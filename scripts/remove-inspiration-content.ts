import { initDb } from "../src/db";
import { createX6Logger } from "../src/logger";
import {
  colors,
  databaseConnectionString,
  deleteX6ModerationContent,
  markInspirationPostDeleted,
  parallelMap,
  parseCli,
  x6ApiKey,
} from "../src/x6";

async function main() {
  const cliOptions = parseCli(process.argv.slice(2));
  const logPath = "/tmp/remove-inspiration-content.log";
  const logger = createX6Logger(logPath);

  console.log(colors.cyan(`[x6-remove] log file: ${logPath}`));

  const apiKey = x6ApiKey();
  const sql = await initDb(databaseConnectionString());

  try {
    const rows = await sql<{ slug: string; title: string; x6_post_id: string }[]>`
      SELECT slug, title, x6_post_id
      FROM elements
      WHERE NULLIF(BTRIM(x6_post_id), '') IS NOT NULL
        AND x6_post_deleted_at IS NULL
      ORDER BY slug
    `;

    const concurrency = Math.max(1, cliOptions.concurrency);
    const targetRows = cliOptions.first ? rows.slice(0, cliOptions.first) : rows;

    console.log(colors.cyan(`[x6-remove] ${targetRows.length} submitted inspiration posts selected for deletion, concurrency=${concurrency}`));

    if (cliOptions.dryRun || cliOptions.dry) {
      console.log(colors.yellow(`[x6-remove] Dry run mode enabled. No posts will be deleted.`));
      return;
    }

    let completed = 0;
    let failed = 0;

    await parallelMap(targetRows, concurrency, async (row, idx) => {
      try {
        await deleteX6ModerationContent(apiKey, row.x6_post_id, logger);
        await markInspirationPostDeleted(sql, row.slug);
        completed += 1;
        console.log(colors.green(`[x6-remove] ${idx + 1}/${targetRows.length} deleted ${row.slug} -> ${row.x6_post_id}`));
      } catch (error) {
        failed += 1;
        console.error(colors.red(`[x6-remove] ${idx + 1}/${targetRows.length} failed to delete ${row.slug} (${row.x6_post_id}): ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    console.log(colors.cyan(`[x6-remove] ${completed}/${targetRows.length} removed (${failed} failed). Log saved to ${logPath}`));
  } finally {
    await sql.close();
  }
}

main().catch(error => {
  console.error(colors.red(`[x6-remove] Fatal error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`));
  process.exit(1);
});
