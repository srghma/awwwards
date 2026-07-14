import { parseConfig } from "./args";
import { initDb, siteExists } from "./db";
import { launchBrowser, fetchListingPageLinks, scrapeDetailPage, storeScrapedData } from "./scraper";

/**
 * Functional immediately invoked function expression (IIFE)
 */
(async () => {
  console.log("=== Awwwards.com Stealth Scraper starting ===");

  const config = parseConfig(process.argv.slice(2));
  console.log("Loaded Configuration:", config);

  const connectionString = process.env["DATABASE_URL"] || "postgresql://postgres@127.0.0.1:5432/awwwards";
  console.log(`Connecting to database: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);
  const sql = await initDb(connectionString);
  console.log("Database initialized.");

  let browser;
  try {
    browser = await launchBrowser(config);
    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    const baseUrl = config.type === "nominees"
      ? "https://www.awwwards.com/websites/nominees/"
      : "https://www.awwwards.com/websites/sites_of_the_day/";

    const targetListingUrls = Array.from({ length: config.pages }, (_, i) => {
      return i === 0 ? baseUrl : `${baseUrl}?page=${i + 1}`;
    });

    console.log(`Target listing pages to scrape:`, targetListingUrls);

    const detailLinks: string[] = [];
    for (const url of targetListingUrls) {
      const links = await fetchListingPageLinks(page, url);
      detailLinks.push(...links);
    }

    const uniqueLinks = Array.from(new Set(detailLinks));
    console.log(`Found ${uniqueLinks.length} total detail links to analyze.`);

    for (const link of uniqueLinks) {
      const slug = link.split("/").filter(Boolean).pop() || "";
      if (!slug) continue;

      const exists = await siteExists(sql, slug);
      if (exists) {
        console.log(`[SKIP] Site '${slug}' already exists in DB. Skipping.`);
        continue;
      }

      console.log(`[NEW] Scraping new site '${slug}'...`);
      const detailPage = await browser.newPage();
      try {
        const scrapedData = await scrapeDetailPage(
          detailPage,
          link,
          config.type === "nominees" ? "Nominee" : "SOTD"
        );

        if (scrapedData) {
          await storeScrapedData(sql, scrapedData);
          console.log(`[SUCCESS] Fully scraped and stored: '${slug}'`);
        } else {
          console.warn(`[WARN] Failed to scrape site from: ${link}`);
        }
      } catch (err) {
        console.error(`Error processing link ${link}:`, err);
      } finally {
        await detailPage.close();
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log("=== Scraping process finished successfully! ===");
  } catch (err) {
    console.error("Critical error in IIFE Scraping loop:", err);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed.");
    }
    await sql.close();
    console.log("Database connection closed.");
  }
})();
