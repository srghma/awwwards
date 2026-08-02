import { parseConfig } from "./args";
import { deleteInvalidElementData, deleteInvalidSiteData, deleteStaleCollectionItems, elementCrawlQueueCount, elementExists, initDb, pendingCollectionItems, queuedElementsToScrape, queuedSiteUrlsToScrape, removeCompletedSitesFromCrawlQueue, removeSiteFromCrawlQueue, setScraperMetadata, siteCrawlQueueCount, siteExists, updateScrapeProgress, upsertElementCrawlQueue, upsertSiteCrawlQueue, userExists } from "./db";
import type { Browser } from "puppeteer";
import {
  launchBrowser,
  fetchListingPageLinks,
  scrapeDetailPage,
  scrapeCollectionsIndexPage,
  scrapeCollectionDetailPage,
  scrapeElementsIndexPage,
  scrapeDirectoryIndexPage,
  scrapeDirectoryProfilePage,
  configurePageBandwidth,
  scrapeTargetUrl,
  storeCollectionDetailData,
  storeDirectoryProfileData,
  storeAssetScrapeData,
  storeScrapedData
} from "./scraper";

const IGNORE_ANTIBOT = true;

const isLikelyAntiBotError = (err: unknown): boolean => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /net::ERR_FAILED|\b(?:403|429)\b|captcha|cloudflare|access denied|verify you are human|unusual traffic/i.test(message);
};

const shouldIgnoreScrapeError = (err: unknown): boolean => IGNORE_ANTIBOT && isLikelyAntiBotError(err);

const isMissingPageError = (err: unknown): boolean => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /\b(?:404|410)\b/.test(message);
};

const isNavigationTimeoutError = (err: unknown): boolean => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /navigation timeout|timeouterror/i.test(message);
};

/**
 * Functional immediately invoked function expression (IIFE)
 */
(async () => {
  console.log("=== Awwwards.com Stealth Scraper starting ===");

  const config = parseConfig(process.argv.slice(2));
  console.log("Loaded Configuration:", config);

  const pgUser = process.env["PGUSER"] ?? process.env["USER"] ?? "postgres";
  const pgPort = process.env["PGPORT"] ?? "55432";
  const connectionString = process.env["DATABASE_URL"] || `postgresql://${pgUser}@127.0.0.1:${pgPort}/awwwards`;
  console.log(`Connecting to database: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);
  const sql = await initDb(connectionString);
  console.log("Database initialized.");
  const workerId = process.env["AWWWARDS_WORKER_ID"] ?? config.workerId ?? `worker-${process.pid}`;
  const progress = { worker_id: workerId, phase: "starting", current_url: null as string | null, discovered: 0, completed: 0, skipped: 0, failed: 0 };
  const saveProgress = async (phase: string, currentUrl?: string) => {
    progress.phase = phase;
    progress.current_url = currentUrl ?? null;
    await updateScrapeProgress(sql, progress);
    console.log(
      `[${workerId}] ${phase} | discovered=${progress.discovered} completed=${progress.completed} skipped=${progress.skipped} failed=${progress.failed}`
      + (currentUrl ? ` | ${currentUrl}` : ""),
    );
  };
  await saveProgress("starting");

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(config);
    const page = await browser!.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
    await configurePageBandwidth(page);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const scrapeElementsAndLinkedSites = async (): Promise<void> => {
      const elementsUrl = "https://www.awwwards.com/elements/";
      let elements: Array<{ slug: string; url: string }>;
      if (config.continueExisting) {
        const queuedCount = await elementCrawlQueueCount(sql, elementsUrl);
        if (queuedCount > 0) {
          elements = await queuedElementsToScrape(sql, elementsUrl);
          progress.discovered = queuedCount;
          await saveProgress("elements-resume", elementsUrl);
          console.log(`[${workerId}] Resuming ${elements.length} of ${queuedCount} queued inspiration URLs; skipping the elements index.`);
        } else {
          await saveProgress("elements-index", elementsUrl);
          const discovered = await scrapeElementsIndexPage(page, elementsUrl, sql);
          elements = discovered;
          progress.discovered = discovered.reportedTotal ?? discovered.length;
          if (discovered.reportedTotal != null) {
            await setScraperMetadata(sql, "elements_total", String(discovered.reportedTotal));
          }
          await upsertElementCrawlQueue(sql, elementsUrl, elements);
          console.log(`[${workerId}] Elements index loaded and persisted: ${elements.length} inspiration URLs (${discovered.reportedTotal ?? "unknown"} reported).`);
        }
      } else {
        await saveProgress("elements-index", elementsUrl);
        const discovered = await scrapeElementsIndexPage(page, elementsUrl, sql);
        elements = discovered;
        progress.discovered = discovered.reportedTotal ?? discovered.length;
        if (discovered.reportedTotal != null) {
          await setScraperMetadata(sql, "elements_total", String(discovered.reportedTotal));
        }
        await upsertElementCrawlQueue(sql, elementsUrl, elements);
        console.log(`[${workerId}] Elements index loaded and persisted: ${elements.length} inspiration URLs (${discovered.reportedTotal ?? "unknown"} reported).`);
      }

      for (const elementEntry of elements) {
        if (await elementExists(sql, elementEntry.slug)) {
          progress.skipped += 1;
          continue;
        }

        await saveProgress("element", elementEntry.url);
        const elementPage = await browser!.newPage();
        try {
          await configurePageBandwidth(elementPage);
          const element = await scrapeTargetUrl(elementPage, elementEntry.url, "SOTD", sql);
          if (!element || element.kind !== "asset") {
            throw new Error(`Expected inspiration asset result for ${elementEntry.url}`);
          }
          await storeAssetScrapeData(sql, element.data);
          progress.completed += 1;

          const siteUrl = typeof element.data.meta["siteAwwwardsUrl"] === "string"
            ? element.data.meta["siteAwwwardsUrl"]
            : null;
          if (!siteUrl) continue;

          const siteSlug = new URL(siteUrl).pathname.split("/").filter(Boolean).pop() || "";
          if (!siteSlug) throw new Error(`Linked site URL has no slug: ${siteUrl}`);
          if (await siteExists(sql, siteSlug)) {
            progress.skipped += 1;
            continue;
          }

          await saveProgress("element-linked-site", siteUrl);
          const sitePage = await browser!.newPage();
          try {
            await configurePageBandwidth(sitePage);
            const site = await scrapeTargetUrl(sitePage, siteUrl, "SOTD", sql);
            if (!site || site.kind !== "site") {
              throw new Error(`Expected site result for linked URL ${siteUrl}`);
            }
            await storeScrapedData(sql, site.data);
            for (const inspirationSlug of site.data.inspirationSlugs) {
              if (await elementExists(sql, inspirationSlug)) continue;
              const linkedElementPage = await browser!.newPage();
              try {
                await configurePageBandwidth(linkedElementPage);
                const linkedElement = await scrapeTargetUrl(
                  linkedElementPage,
                  `https://www.awwwards.com/inspiration/${inspirationSlug}`,
                  "SOTD",
                  sql,
                );
                if (!linkedElement || linkedElement.kind !== "asset") {
                  throw new Error(`Expected inspiration asset for ${inspirationSlug}`);
                }
                await storeAssetScrapeData(sql, linkedElement.data);
              } catch (err) {
                await deleteInvalidElementData(sql, inspirationSlug);
                if (isNavigationTimeoutError(err) || shouldIgnoreScrapeError(err)) {
                  progress.failed += 1;
                  console.warn(`Skipping unavailable inspiration ${inspirationSlug} linked from ${siteUrl}:`, err);
                  continue;
                }
                throw err;
              } finally {
                await linkedElementPage.close();
              }
            }
            progress.completed += 1;
          } catch (err) {
            await deleteInvalidSiteData(sql, siteSlug);
            if (isMissingPageError(err)) {
              progress.failed += 1;
              console.warn(`Skipping missing site ${siteUrl} linked from ${elementEntry.url}:`, err);
              continue;
            }
            throw err;
          } finally {
            await sitePage.close();
          }
        } catch (err) {
          progress.failed += 1;
          console.error(`Error scraping element ${elementEntry.url}:`, err);
          await deleteInvalidElementData(sql, elementEntry.slug);
          if (isNavigationTimeoutError(err) || shouldIgnoreScrapeError(err)) {
            console.warn(`Skipping unavailable inspiration ${elementEntry.slug}:`, err);
            continue;
          }
          throw err;
        } finally {
          await elementPage.close();
        }
      }
    };

    const scrapePendingCollectionItems = async (): Promise<void> => {
      const items = await pendingCollectionItems(sql);
      progress.discovered = items.length;
      await saveProgress("collections-resume");
      console.log(`[${workerId}] Resuming ${items.length} incomplete collection items without reopening collection pages.`);

      for (const item of items) {
        await saveProgress(`collection-${item.item_type}`, item.item_url);
        const itemPage = await browser!.newPage();
        try {
          await configurePageBandwidth(itemPage);
          const result = await scrapeTargetUrl(itemPage, item.item_url, "SOTD", sql);
          if (item.item_type === "site") {
            if (!result || result.kind !== "site") throw new Error(`Expected site result for collection item ${item.item_url}`);
            await storeScrapedData(sql, result.data);
          } else {
            if (!result || result.kind !== "asset") throw new Error(`Expected inspiration result for collection item ${item.item_url}`);
            await storeAssetScrapeData(sql, result.data);
          }
          progress.completed += 1;
        } catch (err) {
          progress.failed += 1;
          if (item.item_type === "site") await deleteInvalidSiteData(sql, item.element_slug);
          else await deleteInvalidElementData(sql, item.element_slug);
          if (isNavigationTimeoutError(err) || shouldIgnoreScrapeError(err)) {
            console.warn(`Skipping unavailable collection ${item.item_type} ${item.item_url}:`, err);
            continue;
          }
          throw err;
        } finally {
          await itemPage.close();
        }
      }
    };

    const scrapeCollectionsAndDirectory = async (): Promise<void> => {
      await saveProgress("collections-index", "https://www.awwwards.com/collections/");
      const collections = await scrapeCollectionsIndexPage(page, "https://www.awwwards.com/collections/", sql);
      progress.discovered = collections.reportedTotal ?? collections.length;
      if (collections.reportedTotal != null) {
        await setScraperMetadata(sql, "collections_total", String(collections.reportedTotal));
      }
      console.log(`[${workerId}] Collections index loaded: ${collections.length} valid collection URLs (${collections.reportedTotal ?? "unknown"} reported).`);
      for (const collection of collections) {
        const collectionUrl = new URL(collection.url, "https://www.awwwards.com").href;
        const detailPage = await browser!.newPage();
        try {
          await configurePageBandwidth(detailPage);
          const detail = await scrapeCollectionDetailPage(detailPage, collectionUrl, sql);
          if (detail) {
            const siteItems = detail.items.filter(item => item.item_type === "site").length;
            const inspirationItems = detail.items.filter(item => item.item_type === "inspiration").length;
            console.log(`[${workerId}] Collection ${detail.collection.name}: ${inspirationItems} inspirations, ${siteItems} sites discovered.`);
            const storageSlug = await storeCollectionDetailData(sql, detail);
            await deleteStaleCollectionItems(sql, storageSlug, detail.items.map(item => item.item_url));
            for (const item of detail.items) {
              if (item.item_type !== "site" || !item.site_url) continue;
              const siteSlug = new URL(item.site_url).pathname.split("/").filter(Boolean).pop() || "";
              if (!siteSlug) continue;
              const siteAlreadyStored = await siteExists(sql, siteSlug);
              await saveProgress(siteAlreadyStored ? "collection-site-inspirations" : "collection-site", item.site_url);
              const sitePage = await browser!.newPage();
              try {
                await configurePageBandwidth(sitePage);
                const site = await scrapeTargetUrl(sitePage, item.site_url, "SOTD", sql);
                if (site?.kind === "site") {
                  if (!siteAlreadyStored) await storeScrapedData(sql, site.data);
                  for (const elementSlug of site.data.inspirationSlugs) {
                    if (await elementExists(sql, elementSlug)) continue;
                    const inspirationPage = await browser!.newPage();
                    try {
                      await configurePageBandwidth(inspirationPage);
                      const element = await scrapeTargetUrl(inspirationPage, `https://www.awwwards.com/inspiration/${elementSlug}`, "SOTD", sql);
                      if (!element || element.kind !== "asset") throw new Error(`Expected inspiration asset for ${elementSlug}`);
                      await storeAssetScrapeData(sql, element.data);
                    } catch (err) {
                      await deleteInvalidElementData(sql, elementSlug);
                      if (!shouldIgnoreScrapeError(err)) throw err;
                      progress.failed += 1;
                      console.warn(`Skipping failed inspiration ${elementSlug} linked from ${item.site_url}:`, err);
                      continue;
                    } finally {
                      await inspirationPage.close();
                    }
                  }
                  if (siteAlreadyStored) progress.skipped += 1;
                }
                progress.completed += 1;
              } catch (err) {
                progress.failed += 1;
                await deleteInvalidSiteData(sql, siteSlug);
                if (!shouldIgnoreScrapeError(err)) throw err;
                console.warn(`Skipping anti-bot-blocked collection site ${item.site_url}:`, err);
                continue;
              } finally {
                await sitePage.close();
              }
            }
            for (const item of detail.items) {
              if (item.item_type !== "inspiration") continue;
              if (await elementExists(sql, item.element_slug)) continue;
              await saveProgress("inspiration", `https://www.awwwards.com/inspiration/${item.element_slug}`);
              const elementPage = await browser!.newPage();
              try {
                await configurePageBandwidth(elementPage);
                const element = await scrapeTargetUrl(elementPage, item.item_url, "SOTD", sql);
                if (element?.kind === "asset") await storeAssetScrapeData(sql, element.data);
                progress.completed += 1;
              } catch (err) {
                progress.failed += 1;
                await deleteInvalidElementData(sql, item.element_slug);
                if (!shouldIgnoreScrapeError(err)) throw err;
                console.warn(`Skipping anti-bot-blocked collection inspiration ${item.element_slug}:`, err);
                continue;
              } finally {
                await elementPage.close();
              }
            }
          }
        } catch (err) {
          console.error(`Error scraping collection detail ${collectionUrl}:`, err);
          throw err;
        } finally {
          await detailPage.close();
        }
        await sleep(2000);
      }

      await scrapeElementsAndLinkedSites();

      const directoryIndex = await scrapeDirectoryIndexPage(page, "https://www.awwwards.com/directory/");
      for (const profile of directoryIndex) {
        if (await userExists(sql, profile.username)) {
          progress.skipped += 1;
          continue;
        }
        const profilePage = await browser!.newPage();
        try {
          await configurePageBandwidth(profilePage);
          const detail = await scrapeDirectoryProfilePage(profilePage, profile.url, sql);
          if (detail) {
            await storeDirectoryProfileData(sql, detail);
          }
        } catch (err) {
          console.error(`Error scraping directory profile ${profile.url}:`, err);
        } finally {
          await profilePage.close();
        }
        await sleep(1500);
      }
    };

    const scrapeListingSiteLinks = async (uniqueLinks: string[], queueSourceUrl?: string): Promise<void> => {
      console.log(`Found ${uniqueLinks.length} total detail links to analyze.`);
      if (config.continueExisting) {
        console.log("Resume mode: retaining stored sites and scraping only URLs still absent from the database.");
      }

      for (const link of uniqueLinks) {
        const slug = link.split("/").filter(Boolean).pop() || "";
        if (!slug) continue;

        const exists = await siteExists(sql, slug);
        if (exists && !config.refresh) {
          if (queueSourceUrl) {
            await removeSiteFromCrawlQueue(sql, queueSourceUrl, slug);
          }
          progress.skipped += 1;
          await saveProgress("listing-skip", link);
          console.log(`[SKIP] Site '${slug}' already exists in DB. Skipping.`);
          continue;
        }

        console.log(`[NEW] Scraping new site '${slug}'...`);
        const detailPage = await browser!.newPage();
        try {
          await saveProgress("site", link);
          await configurePageBandwidth(detailPage);
          const scrapedData = await scrapeDetailPage(
            detailPage,
            link,
            config.type === "nominees" ? "Nominee" : "SOTD",
            sql,
          );

          if (scrapedData) {
            await storeScrapedData(sql, scrapedData);
            for (const elementSlug of scrapedData.inspirationSlugs) {
              if (await elementExists(sql, elementSlug)) continue;
              const inspirationPage = await browser!.newPage();
              try {
                await configurePageBandwidth(inspirationPage);
                const element = await scrapeTargetUrl(inspirationPage, `https://www.awwwards.com/inspiration/${elementSlug}`, "SOTD", sql);
                if (!element || element.kind !== "asset") throw new Error(`Expected inspiration asset for ${elementSlug}`);
                await storeAssetScrapeData(sql, element.data);
              } catch (err) {
                await deleteInvalidElementData(sql, elementSlug);
                if (isNavigationTimeoutError(err) || shouldIgnoreScrapeError(err)) {
                  progress.failed += 1;
                  console.warn(`Skipping unavailable inspiration ${elementSlug} linked from ${link}:`, err);
                  continue;
                }
                throw err;
              } finally {
                await inspirationPage.close();
              }
            }
            if (queueSourceUrl) {
              await removeSiteFromCrawlQueue(sql, queueSourceUrl, slug);
            }
            console.log(`[SUCCESS] Fully scraped and stored: '${slug}'`);
            progress.completed += 1;
          } else {
            console.warn(`[WARN] Failed to scrape site from: ${link}`);
          }
        } catch (err) {
          console.error(`Error processing link ${link}:`, err);
          await deleteInvalidSiteData(sql, slug);
          if (isNavigationTimeoutError(err) || shouldIgnoreScrapeError(err)) {
            progress.failed += 1;
            console.warn(`Skipping unavailable site ${slug}; it will remain resumable:`, err);
            continue;
          }
          throw err;
        } finally {
          await detailPage.close();
        }

        await sleep(1500);
      }
    };

    const scrapeListingPages = async (listingBaseUrl?: string): Promise<void> => {
      await saveProgress("listing-pages");
      const requestedBaseUrl = listingBaseUrl ?? (config.type === "nominees"
        ? "https://www.awwwards.com/websites/nominees/"
        : "https://www.awwwards.com/websites/sites_of_the_day/");
      const base = new URL(requestedBaseUrl);
      if (!base.pathname.endsWith("/")) base.pathname += "/";
      base.search = "";
      base.hash = "";
      const baseUrl = base.href;
      const basePath = base.pathname.replace(/\/$/, "");
      const isAllWebsitesIndex = basePath === "/websites";

      if (config.continueExisting && isAllWebsitesIndex) {
        await removeCompletedSitesFromCrawlQueue(sql, baseUrl);
        const queuedCount = await siteCrawlQueueCount(sql, baseUrl);
        const queuedLinks = await queuedSiteUrlsToScrape(sql, baseUrl, config.fromEnd);
        if (queuedCount > 0) {
          progress.discovered = queuedCount;
          await saveProgress("listing-resume", baseUrl);
          console.log(
            `Resuming ${queuedLinks.length} of ${queuedCount} queued site URLs not yet stored from ${config.fromEnd ? "end" : "start"}; skipping the websites index.`,
          );
          await scrapeListingSiteLinks(queuedLinks, baseUrl);
          return;
        }
      }

      const firstPageLinks = await fetchListingPageLinks(page, baseUrl);
      const detailLinks = new Set(firstPageLinks);

      if (isAllWebsitesIndex && firstPageLinks.reportedTotal != null) {
        progress.discovered = firstPageLinks.reportedTotal;
        await saveProgress("listing-pages", baseUrl);
        console.log(`Websites index reports ${firstPageLinks.reportedTotal} sites; infinite scroll found ${detailLinks.size} unique URLs.`);
      }

      if (isAllWebsitesIndex && firstPageLinks.reportedTotal != null && detailLinks.size < firstPageLinks.reportedTotal) {
        const pageSize = firstPageLinks.initialPageSize ?? 0;
        if (pageSize === 0) throw new Error(`Websites index has no initial site cards: ${baseUrl}`);

        const lastPage = Math.ceil(firstPageLinks.reportedTotal / pageSize);
        console.warn(
          `Websites index discovered ${detailLinks.size} of ${firstPageLinks.reportedTotal} sites after infinite scroll; backfilling from page ${lastPage}.`,
        );
        let pageNumber = lastPage;
        while (pageNumber > 1 && detailLinks.size < firstPageLinks.reportedTotal) {
          const listingUrl = `${baseUrl}?page=${pageNumber}`;
          await saveProgress("listing-backfill", listingUrl);
          const links = await fetchListingPageLinks(page, listingUrl, { scroll: false });
          const sizeBefore = detailLinks.size;
          const newLinks = links.filter(link => !detailLinks.has(link));
          newLinks.forEach(link => detailLinks.add(link));
          const samples = newLinks.slice(0, 3).map(link => new URL(link).pathname).join(", ") || "none (all URLs were already known)";
          const servedPage = links.currentPage ?? pageNumber;
          console.log(
            `Websites backfill requested=${pageNumber}, served=${servedPage}: page URLs=${links.length}, new=${newLinks.length}, inventory=${sizeBefore}->${detailLinks.size}/${firstPageLinks.reportedTotal}, samples=${samples}.`,
          );
          pageNumber = Math.min(pageNumber - 1, servedPage - 1);
        }
      } else if (!isAllWebsitesIndex) {
        for (let pageNumber = 2; pageNumber <= config.pages; pageNumber += 1) {
          const links = await fetchListingPageLinks(page, `${baseUrl}?page=${pageNumber}`);
          if (links.length === 0) break;
          links.forEach(link => detailLinks.add(link));
          await sleep(1000);
        }
      }

      if (isAllWebsitesIndex && firstPageLinks.reportedTotal != null && detailLinks.size !== firstPageLinks.reportedTotal) {
        console.warn(`Websites index count mismatch: expected ${firstPageLinks.reportedTotal}, found ${detailLinks.size} unique site URLs.`);
      }

      const uniqueLinks = Array.from(detailLinks);
      if (isAllWebsitesIndex) {
        await upsertSiteCrawlQueue(sql, baseUrl, uniqueLinks);
        console.log(`Persisted ${uniqueLinks.length} unique website URLs to the crawl queue.`);
      }
      await scrapeListingSiteLinks(uniqueLinks, isAllWebsitesIndex ? baseUrl : undefined);
    };

    if (config.targetUrl) {
      const targetPath = new URL(config.targetUrl, "https://www.awwwards.com").pathname;
      if (targetPath === "/collections/" || targetPath === "/collections") {
        if (config.continueExisting) {
          await scrapePendingCollectionItems();
          console.log("=== Collection item resume finished successfully! ===");
          return;
        }
        await scrapeCollectionsAndDirectory();
        console.log("=== Collections scrape finished successfully! ===");
        return;
      }

      if (targetPath === "/directory/" || targetPath === "/directory") {
        const directoryIndex = await scrapeDirectoryIndexPage(page, "https://www.awwwards.com/directory/");
        for (const profile of directoryIndex) {
          const profilePage = await browser!.newPage();
          try {
            await configurePageBandwidth(profilePage);
            const detail = await scrapeDirectoryProfilePage(profilePage, profile.url);
            if (detail) {
              await storeDirectoryProfileData(sql, detail);
            }
          } finally {
            await profilePage.close();
          }
          await sleep(1500);
        }
        console.log("=== Directory scrape finished successfully! ===");
        return;
      }

      if (targetPath === "/elements/" || targetPath === "/elements") {
        await scrapeElementsAndLinkedSites();
        console.log("=== Elements scrape finished successfully! ===");
        return;
      }

      if (targetPath === "/websites/" || targetPath === "/websites") {
        await scrapeListingPages(config.targetUrl);
        console.log("=== Websites listing scrape finished successfully! ===");
        return;
      }

      if (targetPath.includes("/collections/")) {
        const detailPage = await browser!.newPage();
        try {
          await configurePageBandwidth(detailPage);
          const detail = await scrapeCollectionDetailPage(detailPage, config.targetUrl);
          if (detail) {
            await storeCollectionDetailData(sql, detail);
            console.log("=== Collection detail scrape finished successfully! ===");
          }
        } finally {
          await detailPage.close();
        }
        return;
      }

      const result = await scrapeTargetUrl(
        page,
        config.targetUrl,
        config.type === "nominees" ? "Nominee" : "SOTD",
        sql,
      );

      if (!result) {
        console.warn(`[WARN] Failed to scrape target URL: ${config.targetUrl}`);
        return;
      }

      if (result.kind === "site") {
        const slug = result.data.site.slug;
        if (config.refresh || !(await siteExists(sql, slug))) {
          await storeScrapedData(sql, result.data);
        }
      } else if (result.kind === "asset") {
        await storeAssetScrapeData(sql, result.data);
      } else if (result.kind === "collection") {
        await storeCollectionDetailData(sql, result.data);
      } else if (result.kind === "directory") {
        await storeDirectoryProfileData(sql, result.data);
      }

      console.log("=== Single URL scrape finished successfully! ===");
      return;
    }

    await scrapeCollectionsAndDirectory();
    await scrapeListingPages();
    await saveProgress("complete");

    console.log("=== Scraping process finished successfully! ===");
  } catch (err) {
    console.error("Critical error in IIFE Scraping loop:", err);
    if (config.targetUrl) {
      const failedPath = new URL(config.targetUrl, "https://www.awwwards.com").pathname;
      const failedParts = failedPath.split("/").filter(Boolean);
      const failedSlug = failedParts[failedParts.length - 1] || "";
      if (/^\/sites\/[^/?#]+\/?$/.test(failedPath) && failedSlug) {
        await deleteInvalidSiteData(sql, failedSlug);
      } else if (/^\/inspiration\/[^/?#]+\/?$/.test(failedPath) && failedSlug) {
        await deleteInvalidElementData(sql, failedSlug);
      }
    }
    process.exit(1);
  } finally {
    if (browser) {
      if (config.connectUrl || config.reuseExisting) {
        browser.disconnect();
        console.log("Disconnected from existing Chrome.");
      } else {
        await browser.close();
        console.log("Browser closed.");
      }
    }
    await sql.close();
    console.log("Database connection closed.");
  }
})();
