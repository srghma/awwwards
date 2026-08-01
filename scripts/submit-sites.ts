import { initDb } from "../src/db";
import { parseConfig } from "../src/args";
import { createX6Logger } from "../src/logger";
import {
  buildLexicalTextContent,
  colors,
  databaseConnectionString,
  loadSiteRows,
  parallelMap,
  parseCli,
  saveSiteX6Content,
  submitX6Content,
  verifyUncheckedSites,
  x6ApiKey,
  type X6CaseSection,
  type SiteRow,
} from "../src/x6";

function buildScoresTextContent(site: SiteRow): Record<string, unknown> | null {
  const lines: string[] = [];
  if (site.overall_score != null) {
    lines.push(`SOTD Overall Score: ${site.overall_score.toFixed(2)} / 10`);
    if (site.design_score != null) lines.push(`- Design: ${site.design_score.toFixed(2)}`);
    if (site.usability_score != null) lines.push(`- Usability: ${site.usability_score.toFixed(2)}`);
    if (site.creativity_score != null) lines.push(`- Creativity: ${site.creativity_score.toFixed(2)}`);
    if (site.content_score != null) lines.push(`- Content: ${site.content_score.toFixed(2)}`);
  }
  if (site.dev_overall_score != null) {
    lines.push(`Developer Award Score: ${site.dev_overall_score.toFixed(2)} / 10`);
    if (site.dev_semantics_score != null) lines.push(`- Semantics / SEO: ${site.dev_semantics_score.toFixed(2)}`);
    if (site.dev_animations_score != null) lines.push(`- Animations / Transitions: ${site.dev_animations_score.toFixed(2)}`);
    if (site.dev_accessibility_score != null) lines.push(`- Accessibility: ${site.dev_accessibility_score.toFixed(2)}`);
    if (site.dev_wpo_score != null) lines.push(`- WPO: ${site.dev_wpo_score.toFixed(2)}`);
    if (site.dev_responsive_score != null) lines.push(`- Responsive Design: ${site.dev_responsive_score.toFixed(2)}`);
    if (site.dev_markup_score != null) lines.push(`- Markup / Meta-data: ${site.dev_markup_score.toFixed(2)}`);
  }
  if (lines.length === 0) return null;
  return buildLexicalTextContent(lines, "Awwwards Scores & Evaluation");
}

function buildVotesTextContent(site: SiteRow): Record<string, unknown> | null {
  const lines: string[] = [];
  if (site.site_sotd_vote_count > 0) {
    lines.push(`Jury / Community Votes: ${site.site_sotd_vote_count} votes${site.site_sotd_vote_average != null ? ` (Average: ${site.site_sotd_vote_average.toFixed(2)})` : ""}`);
  }
  if (site.site_developer_vote_count > 0) {
    lines.push(`DevJury Votes: ${site.site_developer_vote_count} votes${site.site_developer_vote_average != null ? ` (Average: ${site.site_developer_vote_average.toFixed(2)})` : ""}`);
  }
  if (lines.length === 0) return null;
  return buildLexicalTextContent(lines, "Voting Summary");
}

async function main() {
  const cliConfig = parseConfig(process.argv.slice(2));
  const cliOptions = parseCli(process.argv.slice(2));
  const logPath = "/tmp/submit-sites.log";
  const logger = createX6Logger(logPath);

  console.log(colors.cyan(`[x6-sites] log file: ${logPath}`));

  const apiKey = x6ApiKey();
  const sql = await initDb(databaseConnectionString());

  try {
    const resendMode = cliOptions.resendAlreadySentAndPatchIfAlreadyPresent;
    const unsubmittedSites = await loadSiteRows(sql, { unsubmitted: !resendMode });
    console.log(colors.cyan(`[x6-sites] total ${resendMode ? "" : "unsubmitted "}sites in DB: ${unsubmittedSites.length}${resendMode ? " (--resend-already-sent-and-patch-if-already-present enabled)" : ""}`));

    const isElementFullyUploadedAndChecked = (e: (typeof unsubmittedSites)[number]["elements"][number]): boolean => {
      if (e.checked_source_url_at == null) return false;
      if (e.media_type === "image") return e.x6_file_id != null;
      if (e.media_type === "video") return e.x6_file_id != null && e.x6_static_file_id != null;
      return false;
    };

    const eligibleSites = unsubmittedSites.filter(site => {
      if (!site.live_url && !site.awwwards_url) return false;
      if (resendMode) return true;
      if (site.elements.length === 0) return false;
      return site.elements.every(isElementFullyUploadedAndChecked);
    });

    console.log(colors.cyan(`[x6-sites] ${eligibleSites.length} sites eligible for submission`));

    const concurrency = Math.max(1, cliOptions.concurrency);
    const targetSites = cliOptions.first ? eligibleSites.slice(0, cliOptions.first) : eligibleSites;

    console.log(colors.cyan(`[x6-sites] ${targetSites.length} sites selected for submission, concurrency=${concurrency}`));

    let verifiedSites = targetSites;
    if (!cliOptions.noBrowserCheck && !resendMode) {
      console.log(colors.cyan(`[x6-sites] ${targetSites.length} sites need browser URL verification`));
      const verifyResult = await verifyUncheckedSites(sql, targetSites, {
        dry: cliOptions.dryRun,
        concurrency,
        maxAgeDays: 6,
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
      verifiedSites = verifyResult.validSites;
      console.log(colors.cyan(`[x6-sites] ${verifiedSites.length} sites passed browser URL check (${verifyResult.invalidSlugs.size} HTTP 404/error)`));
    }

    if (cliOptions.dryRun) {
      console.log(colors.yellow(`[x6-sites] Dry run mode enabled. No sites will be submitted.`));
      return;
    }

    let completed = 0;
    let failed = 0;

    await parallelMap(verifiedSites, concurrency, async (site, idx) => {
      const validElements = site.elements.filter((e): e is typeof e & { x6_file_id: string } => e.x6_file_id != null);
      const firstElem = validElements[0];
      if (!firstElem) return;

      const sourceUrl = site.awwwards_url ?? site.live_url!;

      const sections: X6CaseSection[] = [];
      let sectionOrder = 1;

      if (site.description) {
        sections.push({
          order: sectionOrder++,
          blocks: [{
            type: "TEXT",
            order: 1,
            content: buildLexicalTextContent([site.description], "Website Description"),
          }],
        });
      }

      const scoresContent = buildScoresTextContent(site);
      if (scoresContent) {
        sections.push({
          order: sectionOrder++,
          blocks: [{
            type: "TEXT",
            order: 1,
            content: scoresContent,
          }],
        });
      }

      for (const elem of validElements) {
        if (elem.media_type === "video") {
          if (elem.x6_static_file_id) {
            sections.push({
              order: sectionOrder++,
              blocks: [{ type: "IMAGE", order: 1, fileId: elem.x6_static_file_id }],
            });
            sections.push({
              order: sectionOrder++,
              blocks: [{ type: "VIDEO", order: 1, fileId: elem.x6_file_id }],
            });
          } else {
            sections.push({
              order: sectionOrder++,
              blocks: [{ type: "VIDEO", order: 1, fileId: elem.x6_file_id }],
            });
          }
        } else {
          sections.push({
            order: sectionOrder++,
            blocks: [{ type: "IMAGE", order: 1, fileId: elem.x6_file_id }],
          });
        }
      }

      const votesContent = buildVotesTextContent(site);
      if (votesContent) {
        sections.push({
          order: sectionOrder++,
          blocks: [{
            type: "TEXT",
            order: 1,
            content: votesContent,
          }],
        });
      }

      const tags = Array.from(new Set([
        ...site.site_tags,
        ...site.site_technologies,
        ...site.site_colors,
      ].map(t => t.trim()).filter(Boolean)));

      const meta: Record<string, unknown> = {
        slug: site.slug,
        title: site.title,
        source_url: sourceUrl,
        live_url: site.live_url,
        awwwards_url: site.awwwards_url,
        award_type: site.award_type,
        award_date: site.award_date,
        creator_username: site.creator_username,
        creator_names: site.site_creator_names,
        technologies: site.site_technologies,
        colors: site.site_colors,
        tags: site.site_tags,
        overall_score: site.overall_score,
        design_score: site.design_score,
        usability_score: site.usability_score,
        creativity_score: site.creativity_score,
        content_score: site.content_score,
        dev_overall_score: site.dev_overall_score,
        sotd_vote_count: site.site_sotd_vote_count,
        developer_vote_count: site.site_developer_vote_count,
        sotd_vote_average: site.site_sotd_vote_average,
        developer_vote_average: site.site_developer_vote_average,
      };

      try {
        const content = await submitX6Content(apiKey, {
          contentId: site.x6_content_id ?? undefined,
          title: site.title,
          slug: site.slug,
          sourceUrl,
          parser: "awwwards-site",
          tags,
          meta,
          sections,
          forceResend: resendMode,
        }, logger);

        await saveSiteX6Content(sql, site.slug, content);
        completed += 1;
        console.log(colors.green(`[x6-sites] ${idx + 1}/${verifiedSites.length} submitted site ${site.slug} -> ${content.id} (x6 slug: ${content.slug})`));
      } catch (error) {
        failed += 1;
        console.error(colors.red(`[x6-sites] ${idx + 1}/${verifiedSites.length} failed to submit site ${site.slug}: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    console.log(colors.cyan(`[x6-sites] ${completed}/${verifiedSites.length} submitted. Log saved to ${logPath}`));
  } finally {
    await sql.close();
  }
}

main().catch(error => {
  console.error(colors.red(`[x6-sites] Fatal error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`));
  process.exit(1);
});
