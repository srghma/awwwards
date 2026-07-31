import {
  deleteInvalidElementData,
  deleteInvalidSiteData,
  deleteStaleCollectionItems,
  elementExists,
  initDb,
  siteExists,
} from "../src/db";
import { parseConfig } from "../src/args";
import { createX6Logger } from "../src/logger";
import {
  configurePageBandwidth,
  launchBrowser,
  scrapeCollectionDetailPage,
  scrapeCollectionsIndexPage,
  scrapeTargetUrl,
  storeAssetScrapeData,
  storeCollectionDetailData,
  storeScrapedData,
} from "../src/scraper";
import {
  cleanMeta,
  colors,
  databaseConnectionString,
  loadCollectionRows,
  parallelMap,
  parseCli,
  saveX6CollectionPost,
  submitX6ModerationContent,
  verifyUncheckedCollections,
  x6ApiKey,
} from "../src/x6";

const main = async (): Promise<void> => {
  const logPath = "/tmp/submit-collections.log";
  const logger = createX6Logger(logPath);

  console.log(colors.cyan(`[x6-collections] log file: ${logPath}`));

  const cliConfig = parseConfig(process.argv.slice(2));
  const cliOptions = parseCli(process.argv.slice(2));

  if (!cliOptions.mode) {
    throw new Error(
      `--mode is required for submit-collections. Must be '--mode=just_upload_db_into_x6' or '--mode=visit_awwwards_website__scrape_new_collections_and_their_sites_inspirations_if_new_added_and_then_upload_db_into_x6'`
    );
  }

  const apiKey = x6ApiKey();
  const sql = await initDb(databaseConnectionString());

  console.log(colors.cyan(`[x6-collections] Mode: ${cliOptions.mode}`));

  try {
    if (cliOptions.mode === "visit_awwwards_website__scrape_new_collections_and_their_sites_inspirations_if_new_added_and_then_upload_db_into_x6") {
      console.log(colors.cyan(`[x6-collections] Rescanning Awwwards collections and items via Puppeteer...`));
      const browser = await launchBrowser({
        ...cliConfig,
        connectUrl: cliOptions.connectUrl ?? cliConfig.connectUrl,
        remoteDebuggingPort: cliOptions.remoteDebuggingPort ?? cliConfig.remoteDebuggingPort,
        reuseExisting: true,
      });

      try {
        const indexPage = await browser.newPage();
        await configurePageBandwidth(indexPage);

        const discoveredCollections = await scrapeCollectionsIndexPage(indexPage, "https://www.awwwards.com/collections/");
        console.log(colors.cyan(`[x6-collections] Discovered ${discoveredCollections.length} collections on Awwwards index page.`));
        await indexPage.close();

        for (const col of discoveredCollections) {
          const collectionUrl = new URL(col.url, "https://www.awwwards.com").href;
          const detailPage = await browser.newPage();
          try {
            await configurePageBandwidth(detailPage);
            const detail = await scrapeCollectionDetailPage(detailPage, collectionUrl);
            if (detail) {
              const storageSlug = await storeCollectionDetailData(sql, detail);
              await deleteStaleCollectionItems(sql, storageSlug, detail.items.map(item => item.item_url));

              for (const item of detail.items) {
                if (item.item_type === "site" && item.site_url) {
                  const siteSlug = new URL(item.site_url).pathname.split("/").filter(Boolean).pop() || "";
                  if (siteSlug && !(await siteExists(sql, siteSlug))) {
                    console.log(`[x6-collections] Scraping new collection site: ${item.site_url}`);
                    const sitePage = await browser.newPage();
                    try {
                      await configurePageBandwidth(sitePage);
                      const site = await scrapeTargetUrl(sitePage, item.site_url, "SOTD");
                      if (site?.kind === "site") await storeScrapedData(sql, site.data);
                    } catch (err) {
                      await deleteInvalidSiteData(sql, siteSlug);
                      console.warn(`[x6-collections] Failed to scrape site ${item.site_url}: ${err instanceof Error ? err.message : String(err)}`);
                    } finally {
                      await sitePage.close();
                    }
                  }
                } else if (item.item_type === "inspiration" && item.element_slug) {
                  if (!(await elementExists(sql, item.element_slug))) {
                    console.log(`[x6-collections] Scraping new collection inspiration: ${item.element_slug}`);
                    const elemPage = await browser.newPage();
                    try {
                      await configurePageBandwidth(elemPage);
                      const element = await scrapeTargetUrl(elemPage, item.item_url, "SOTD");
                      if (element?.kind === "asset") await storeAssetScrapeData(sql, element.data);
                    } catch (err) {
                      await deleteInvalidElementData(sql, item.element_slug);
                      console.warn(`[x6-collections] Failed to scrape inspiration ${item.element_slug}: ${err instanceof Error ? err.message : String(err)}`);
                    } finally {
                      await elemPage.close();
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error(`[x6-collections] Failed to scrape collection detail ${collectionUrl}: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            await detailPage.close();
          }
        }
      } finally {
        browser.disconnect();
      }

      console.log(colors.cyan(`[x6-collections] Rescan finished. Loading collections from DB...`));
    }

    const collections = await loadCollectionRows(sql, { unsubmittedOnly: cliOptions.unsubmittedOnly });
    console.log(colors.cyan(`[x6-collections] total ${cliOptions.unsubmittedOnly ? "unsubmitted " : ""}collections in DB: ${collections.length}`));

    const eligibleCollections = collections.filter(c => c.files.length > 0);
    console.log(colors.cyan(`[x6-collections] ${eligibleCollections.length} collections have uploaded media files and can be submitted`));

    const concurrency = Math.max(1, cliOptions.concurrency);
    const targetCollections = cliOptions.first ? eligibleCollections.slice(0, cliOptions.first) : eligibleCollections;
    console.log(colors.cyan(`[x6-collections] ${targetCollections.length} collections selected for submission${cliOptions.first ? ` (--first=${cliOptions.first})` : ""}, concurrency=${concurrency}`));

    let validCollections = targetCollections;
    if (!cliOptions.noBrowserCheck) {
      const uncheckedCount = targetCollections.filter(c => c.checked_source_url_at == null).length;
      console.log(colors.cyan(`[x6-collections] ${uncheckedCount} collections need browser URL check`));

      const verifyResult = await verifyUncheckedCollections(sql, targetCollections, {
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
      validCollections = verifyResult.validCollections;
    }

    if (cliOptions.dryRun) {
      console.log(colors.yellow(`[x6-collections] Dry run mode enabled. No collections will be submitted.`));
      return;
    }

    let completed = 0;
    await parallelMap(validCollections, concurrency, async (col, idx) => {
      if (col.files.length === 0) return null;

      const rawMeta = {
        slug: col.slug,
        name: col.name,
        source_url: col.source_url ?? col.url,
        category_name: col.category_name,
        creator_username: col.creator_username,
        creator_name: col.creator_name,
        followers_count: col.followers_count,
        items_count: col.items_count,
        sites_count: col.sites_count,
        inspirations_count: col.inspirations_count,
        sites: col.sites,
        inspirations: col.inspirations,
      };

      try {
        const content = await submitX6ModerationContent(apiKey, {
          files: col.files,
          sourceUrl: col.source_url ?? col.url ?? `https://www.awwwards.com/collections/${col.slug}`,
          type: "mixed",
          parser: "awwwards-collection",
          meta: cleanMeta(rawMeta),
        }, logger);

        await saveX6CollectionPost(sql, col.slug, content);
        completed += 1;
        console.log(`[x6-collections] ${idx + 1}/${validCollections.length} submitted collection ${colors.cyan(col.slug)} -> ${colors.green(content.id)}`);
        return content;
      } catch (error) {
        console.error(`[x6-collections] ${colors.red("FAILED")} to submit collection ${colors.cyan(col.slug)}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });

    console.log(`[x6-collections] ${completed}/${validCollections.length} submitted. Log saved to ${logPath}`);
  } finally {
    await sql.close();
  }
};

await main();
