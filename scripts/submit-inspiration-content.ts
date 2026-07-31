import { initDb } from "../src/db";
import { parseConfig } from "../src/args";
import { createX6Logger } from "../src/logger";
import {
  colors,
  databaseConnectionString,
  loadInspirationRows,
  parallelMap,
  parseCli,
  saveX6Post,
  submitX6ModerationContent,
  verifyUncheckedInspirations,
  x6ApiKey,
} from "../src/x6";

const parseJsonValue = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const metadataFor = (row: Awaited<ReturnType<typeof loadInspirationRows>>[number]): Record<string, unknown> => ({
  slug: row.slug,
  title: row.title,
  source_url: row.source_url,
  author_username: row.author_username,
  author_name: row.author_name,
  website_url: row.website_url,
  tags: parseJsonValue(row.tags_json),
  media_type: row.media_type,
  media_url: row.media_url,
  media_static_url: row.media_static_url,
  site_slug: row.site_slug,
  site_title: row.site_title,
  site_description: row.site_description,
  site_creator_username: row.site_creator_username,
  site_creator_name: row.site_creator_name,
  site_live_url: row.site_live_url,
  site_award_type: row.site_award_type,
  site_award_date: row.site_award_date,
  site_sotd_vote_count: row.site_sotd_vote_count,
  site_developer_vote_count: row.site_developer_vote_count,
  site_sotd_vote_average: row.site_sotd_vote_average,
  site_developer_vote_average: row.site_developer_vote_average,
  site_overall_score: row.site_overall_score,
  site_design_score: row.site_design_score,
  site_usability_score: row.site_usability_score,
  site_creativity_score: row.site_creativity_score,
  site_content_score: row.site_content_score,
  site_dev_overall_score: row.site_dev_overall_score,
  site_dev_semantics_score: row.site_dev_semantics_score,
  site_dev_animations_score: row.site_dev_animations_score,
  site_dev_accessibility_score: row.site_dev_accessibility_score,
  site_dev_wpo_score: row.site_dev_wpo_score,
  site_dev_responsive_score: row.site_dev_responsive_score,
  site_dev_markup_score: row.site_dev_markup_score,
  site_creator_names: row.site_creator_names,
  site_technologies: row.site_technologies,
  site_colors: row.site_colors,
  site_tags: row.site_tags,
});

const uuidInspirationSlug = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const main = async (): Promise<void> => {
  const logPath = "/tmp/submit-inspiration-content.log";
  const logger = createX6Logger(logPath);

  console.log(colors.cyan(`[x6-content] log file: ${logPath}`));

  const cliConfig = parseConfig(process.argv.slice(2));
  const cliOptions = parseCli(process.argv.slice(2));
  const apiKey = x6ApiKey();
  const sql = await initDb(databaseConnectionString());

  try {
    const rows = await loadInspirationRows(sql, { missingFile: false, uploadedFile: true, unsubmitted: true });

    let filteredRows = rows;
    if (!cliOptions.notIgnoreInspirationsWithUuid) {
      filteredRows = rows.filter(row => !uuidInspirationSlug.test(row.slug));
      console.log(colors.cyan(`[x6-content] UUID inspirations: ${rows.length - filteredRows.length} ignored by default`));
    }

    const concurrency = Math.max(1, cliOptions.concurrency);
    const targetRows = cliOptions.first ? filteredRows.slice(0, cliOptions.first) : filteredRows;
    console.log(colors.cyan(`[x6-content] ${targetRows.length} inspirations selected for submission${cliOptions.first ? ` (--first=${cliOptions.first})` : ""}, concurrency=${concurrency}`));

    let validRows = targetRows;
    if (!cliOptions.noBrowserCheck) {
      const uncheckedCount = targetRows.filter(r => r.checked_source_url_at == null).length;
      const checkedCount = targetRows.length - uncheckedCount;
      console.log(colors.cyan(`[x6-content] ${uncheckedCount} inspirations need browser URL check (already checked: ${checkedCount})`));

      const verifyResult = await verifyUncheckedInspirations(sql, targetRows, {
        dry: cliOptions.dryRun,
        concurrency,
        browserConfig: {
          connectUrl: cliOptions.connectUrl ?? cliConfig.connectUrl,
          remoteDebuggingPort: cliOptions.remoteDebuggingPort ?? cliConfig.remoteDebuggingPort,
          reuseExisting: true,
          headless: cliConfig.headless,
          userDataDir: cliConfig.userDataDir,
          workerId: cliConfig.workerId,
          windowIndex: cliConfig.windowIndex,
          pages: cliConfig.pages,
          type: cliConfig.type,
          targetUrl: cliConfig.targetUrl,
          refresh: cliConfig.refresh,
          continueExisting: cliConfig.continueExisting,
          fromEnd: cliConfig.fromEnd,
        },
      });
      validRows = verifyResult.validRows;
    }

    if (cliOptions.dryRun) {
      console.log(colors.yellow(`[x6-content] Dry run mode enabled. No posts will be submitted.`));
      return;
    }

    const pendingRows = validRows.filter(row => row.source_url != null);
    let completed = 0;
    await parallelMap(pendingRows, concurrency, async (row, idx) => {
      if (!row.source_url || !row.x6_file_id || !row.media_type || (row.media_type === "video" && !row.x6_static_file_id)) throw new Error(`Invalid submission row ${row.slug}`);

      const files = [row.x6_file_id];

      const rawTags = parseJsonValue(row.tags_json);
      const elementTags = Array.isArray(rawTags) ? rawTags.filter((t): t is string => typeof t === "string") : [];
      const siteTags = row.site_tags ?? [];
      const tags = Array.from(new Set([...elementTags, ...siteTags].map(t => t.trim()).filter(Boolean)));

      try {
        const content = await submitX6ModerationContent(apiKey, {
          files,
          sourceUrl: row.source_url,
          type: row.media_type,
          parser: "awwwards-inspiration",
          meta: {
            ...metadataFor(row),
            tags,
          },
        }, logger);
        await saveX6Post(sql, row.slug, content);
        completed += 1;
        console.log(`[x6-content] ${idx + 1}/${pendingRows.length} submitted post ${colors.cyan(row.slug)} -> ${colors.green(content.id)}`);
        return content;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("Files not found:")) {
          await sql`
            UPDATE elements
            SET x6_file_id = NULL,
                x6_static_file_id = NULL
            WHERE slug = ${row.slug}
          `;
          console.warn(`[x6-content] Cleared missing x6_file_id for ${colors.cyan(row.slug)} (file missing from x6 storage); will re-upload`);
        }
        console.error(`[x6-content] ${colors.red("FAILED")} to submit post ${colors.cyan(row.slug)}: ${errMsg}`);
        return null;
      }
    });
    console.log(`[x6-content] ${completed}/${pendingRows.length} submitted. Log saved to ${logPath}`);
  } finally {
    await sql.close();
  }
};

await main();
