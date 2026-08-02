import { SQL } from "bun";
import { parseConfig } from "../src/args";
import { launchBrowser, fetchAndCacheExternalSite } from "../src/scraper";

const pgUser = process.env["PGUSER"] ?? process.env["USER"] ?? "postgres";
const pgPort = process.env["PGPORT"] ?? "55432";
const connectionString = process.env["DATABASE_URL"] || `postgresql://${pgUser}@127.0.0.1:${pgPort}/awwwards`;
const sql = new SQL(connectionString);

const args = process.argv.slice(2);
const config = parseConfig(args);

const main = async (): Promise<void> => {
  console.log("Fetching sites with external live_url from PostgreSQL...");

  const sites = await sql`
    SELECT slug, live_url
    FROM sites
    WHERE live_url IS NOT NULL
      AND live_url LIKE 'http%'
      AND live_url NOT LIKE '%awwwards.com%'
    ORDER BY slug ASC
  ` as Array<{ slug: string; live_url: string }>;

  console.log(`Found ${sites.length} sites with external live URLs.`);

  let fetchedCount = 0;
  let failedCount = 0;

  const browser = await launchBrowser(config);
  const page = await browser.newPage();

  try {
    for (let i = 0; i < sites.length; i += 1) {
      const site = sites[i]!;
      console.log(`[${i + 1}/${sites.length}] Processing ${site.slug} (${site.live_url})...`);

      const result = await fetchAndCacheExternalSite(page, sql, site.live_url, { refreshCache: config.refresh });
      if (result) {
        fetchedCount += 1;
      } else {
        failedCount += 1;
      }
    }
  } finally {
    await browser.close();
    await sql.close();
  }

  console.log("\n=== External Site HTML Caching Complete ===");
  console.log(`Total sites: ${sites.length}`);
  console.log(`Cached/Fetched: ${fetchedCount}`);
  console.log(`Failed/Unavailable: ${failedCount}`);
};

main().catch(err => {
  console.error("Critical error in scrape-external-sites script:", err);
  process.exit(1);
});
