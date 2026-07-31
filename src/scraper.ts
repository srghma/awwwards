import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { SQL } from "bun";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  insertUser,
  insertSite,
  insertSiteTechnology,
  insertSiteColor,
  insertSiteMedia,
  insertSiteCreator,
  insertSiteTag,
  insertVote,
  insertCollection,
  resolveCollectionStorageSlug,
  insertCollectionItem,
  insertElement,
  insertElementCategory,
  type DbSite,
  type DbUser,
  type DbSiteCreator,
  type DbSiteTag,
  type DbVote
} from "./db";
import type { ScraperConfig } from "./args";

// Apply stealth plugin
puppeteer.use(StealthPlugin());

export interface ScrapedData {
  sourceUrl: string;
  parser: string;
  meta: Record<string, unknown>;
  site: DbSite;
  creator: DbUser | null;
  creators: DbSiteCreator[];
  technologies: string[];
  colors: string[];
  tags: DbSiteTag[];
  media: Array<{ url: string; type: "image" | "video" }>;
  votes: DbVote[];
  inspirationSlugs: string[];
}

export interface AssetScrapeData {
  sourceUrl: string;
  parser: string;
  meta: Record<string, unknown>;
  media: Array<{ url: string; type: "image" | "video" }>;
}

export interface CollectionSummaryData {
  slug: string;
  name: string;
  url: string;
  category_name: string | null;
  creator_username: string | null;
  creator_name: string | null;
  followers_count: number | null;
  items_count: number | null;
  sites_count: number | null;
  inspirations_count: number | null;
  raw_json: string | null;
}

export type CollectionIndexResult = CollectionSummaryData[] & { reportedTotal?: number };

export const COLLECTIONS_INDEX_EXCEPTION_URL = "https://www.awwwards.com/collections/";
export const COLLECTIONS_INDEX_EXCEPTION_TOTAL = 100;

export const effectiveCollectionsIndexTotal = (sourceUrl: string, advertisedTotal: number): number => {
  const normalizedUrl = new URL(sourceUrl, "https://www.awwwards.com").href;
  if (normalizedUrl === COLLECTIONS_INDEX_EXCEPTION_URL) return COLLECTIONS_INDEX_EXCEPTION_TOTAL;
  return advertisedTotal;
};

export interface ElementsIndexResult {
  slug: string;
  url: string;
}

export type ElementsIndexPageResult = ElementsIndexResult[] & { reportedTotal?: number };

export type ListingPageResult = string[] & {
  reportedTotal?: number;
  initialPageSize?: number;
  currentPage?: number;
};

export const parseRequiredCount = (value: string | null | undefined, field: string): number => {
  const normalized = value?.trim() ?? "";
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Expected ${field} to be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  const count = Number(normalized);
  if (!Number.isSafeInteger(count)) {
    throw new Error(`Expected ${field} to be a safe integer, got ${JSON.stringify(value)}`);
  }
  return count;
};

export interface CollectionItemData {
  collection_slug: string;
  element_slug: string;
  item_type: "site" | "inspiration";
  item_url: string;
  title: string;
  author_username: string | null;
  author_name: string | null;
  website_url: string | null;
  media_url: string | null;
  media_static_url: string | null;
  tags_json: string | null;
  category_name?: string | null;
  raw_json: string | null;
  site_url?: string | null;
}

export interface DirectorySummaryData {
  url: string;
  username: string;
  display_name: string;
  country: string | null;
  avatar_url: string | null;
  is_pro: boolean;
  raw_json: string | null;
}

export interface DirectoryProfileData {
  username: string;
  display_name: string;
  country: string | null;
  website_url: string | null;
  avatar_url: string | null;
  is_pro: boolean;
  works_count: number | null;
  award_soty_count: number | null;
  award_sotm_count: number | null;
  award_sotd_count: number | null;
  award_hm_count: number | null;
  raw_json: string | null;
}

/**
 * Parses out potential Hex codes from any string.
 */
const extractHexColors = (text: string): string[] => {
  const matches = text.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}/g);
  return matches ? Array.from(new Set(matches.map(c => c.toUpperCase()))) : [];
};

/**
 * Functional-style helper to safely parse a float value.
 */
export const safeParseFloat = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const match = val.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  return isNaN(num) ? null : num;
};

/**
 * Formats a raw URL string, ensuring correct format or returning null.
 */
export const sanitizeUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return null;
};

export const parseOptionalScore = (value: string | null | undefined, field: string): number | null => {
  if (value == null || value.trim() === "") return null;
  const score = safeParseFloat(value);
  if (score == null || score < 0 || score > 10) {
    throw new Error(`Invalid ${field} score: ${JSON.stringify(value)}`);
  }
  return score;
};

const assertSuccessfulPage = (response: Awaited<ReturnType<Page["goto"]>>, url: string, pageType: string): void => {
  if (!response) throw new Error(`${pageType} page did not return an HTTP response: ${url}`);
  if (response.status() >= 400) throw new Error(`${pageType} response ${response.status()}: ${url}`);
};

const assertPagePath = (page: Page, pattern: RegExp, url: string, pageType: string): void => {
  const actual = new URL(page.url());
  if (actual.hostname !== "www.awwwards.com" || !pattern.test(actual.pathname)) {
    throw new Error(`${pageType} redirected to unexpected URL ${actual.href}; expected ${url}`);
  }
};

const pagePath = (url: string): string => new URL(url).pathname;

const detectParser = (url: string): "site" | "element" | "collection" | "directory" => {
  const path = pagePath(url);
  if (path.includes("/sites/")) return "site";
  if (path.includes("/inspiration/")) return "element";
  if (path.includes("/collections/")) return "collection";
  if (path.includes("/elements/")) return "collection";
  if (path.includes("/directory/") || path.split("/").filter(Boolean).length === 1) return "directory";
  return "site";
};

const scrollUntilStable = async (page: Page, selector: string, maxRounds = 40): Promise<void> => {
  let lastCount = -1;
  let stableRounds = 0;
  for (let i = 0; i < maxRounds; i += 1) {
    const count = await page.evaluate(sel => document.querySelectorAll(sel).length, selector);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1100);
    const nextCount = await page.evaluate(sel => document.querySelectorAll(sel).length, selector);
    if (nextCount <= count && nextCount === lastCount) stableRounds += 1;
    else stableRounds = 0;
    lastCount = nextCount;
    if (stableRounds >= 4) break;
  }
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const gotoWithTransientServerRetry = async (
  page: Page,
  url: string,
  options: Parameters<Page["goto"]>[1],
  pageType: string,
): Promise<Awaited<ReturnType<Page["goto"]>>> => {
  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await page.goto(url, options);
      if (response == null || response.status() < 500 || attempt === maxAttempts) {
        return response;
      }

      console.warn(`${pageType} response ${response.status()} for ${url}; retrying (${attempt}/${maxAttempts - 1})`);
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (!/net::ERR_FAILED|net::ERR_(?:CONNECTION|HTTP2|QUIC)|socket hang up|connection reset/i.test(message) || attempt === maxAttempts) {
        throw err;
      }
      lastError = err;
      console.warn(`${pageType} navigation failed for ${url}; retrying (${attempt}/${maxAttempts - 1}): ${message}`);
    }

    await sleep(attempt * 1000);
  }

  console.warn(`${pageType} navigation still failed for ${url}; retrying once without request interception.`);
  try {
    await page.setRequestInterception(false);
    page.removeAllListeners("request");
    await sleep(500);
    return await page.goto(url, options);
  } catch (fallbackError) {
    throw lastError ?? fallbackError ?? new Error(`${pageType} navigation failed: ${url}`);
  }
};

const shouldBlockHeavyRequests = (): boolean => {
  const value = process.env["AWWWARDS_BLOCK_HEAVY_REQUESTS"];
  if (value == null) return true;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
};

export const configurePageBandwidth = async (page: Page): Promise<void> => {
  await page.evaluateOnNewDocument(() => {
    const installReducedMotionStyle = (): void => {
      if (document.getElementById("awwwards-disable-motion")) return;
      const style = document.createElement("style");
      style.id = "awwwards-disable-motion";
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      `;
      document.documentElement.appendChild(style);
    };
    if (document.documentElement) installReducedMotionStyle();
    else document.addEventListener("DOMContentLoaded", installReducedMotionStyle, { once: true });
  });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

  if (!shouldBlockHeavyRequests()) return;

  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = request.url();
    const type = request.resourceType();
    if (
      ["image", "media", "font", "stylesheet", "manifest", "texttrack"].includes(type) ||
      /(?:doubleclick|googletagmanager|google-analytics|analytics|hotjar|clarity|segment|intercom|sentry|facebook|twitter|tiktok|pinterest|adservice)/i.test(url)
    ) {
      void request.abort();
      return;
    }

    void request.continue();
  });
};

/**
 * functional launcher for Puppeteer
 */
export const launchBrowser = async (config: ScraperConfig): Promise<Browser> => {
  if (config.connectUrl) {
    console.log(`Connecting to existing Chrome via WS: ${config.connectUrl}`);
    return await puppeteer.connect({
      browserWSEndpoint: config.connectUrl,
      defaultViewport: null,
    }) as unknown as Browser;
  }

  if (config.reuseExisting) {
    try {
      const version = await fetch(`http://127.0.0.1:${config.remoteDebuggingPort}/json/version`);
      if (version.ok) {
        const data = await version.json() as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) {
          console.log(`Connecting to existing Chrome via local debug session: ${data.webSocketDebuggerUrl}`);
          return await puppeteer.connect({
            browserWSEndpoint: data.webSocketDebuggerUrl,
            defaultViewport: null,
          }) as unknown as Browser;
        }
      }
    } catch {
      throw new Error(`Could not connect to existing Chrome on port ${config.remoteDebuggingPort}. Start Chrome with remote debugging or omit --reuse-existing.`);
    }
    throw new Error(`No Chrome debug endpoint found on port ${config.remoteDebuggingPort}. Start Chrome with remote debugging or omit --reuse-existing.`);
  }

  console.log(`Launching Chrome (headless: ${config.headless})...`);
  const workerId = config.workerId ?? `worker-${process.pid}`;
  const userDataDir = config.userDataDir
    ? resolve(config.userDataDir)
    : resolve(join(process.env["AWWWARDS_BROWSER_WORK_DIR"] ?? ".chrome-workers", workerId));
  await mkdir(userDataDir, { recursive: true });
  const windowOffset = config.windowIndex * 40;
  return await puppeteer.launch({
    headless: config.headless,
    defaultViewport: null,
    userDataDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1280,800",
      "--new-window",
      `--window-position=${windowOffset},${windowOffset}`
    ],
  }) as unknown as Browser;
};

/**
 * Extracts links of Sites of the Day or Nominees from listing page.
 */
export const fetchListingPageLinks = async (
  page: Page,
  url: string,
  options: { scroll?: boolean } = {},
): Promise<ListingPageResult> => {
  console.log(`Navigating to listing: ${url}`);
  const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
  if (response?.status() === 404) {
    console.log(`Listing pagination ended at: ${url}`);
    return [] as ListingPageResult;
  }
  assertSuccessfulPage(response, url, "Listing");
  assertPagePath(page, /^\/websites\/(?:[^/?#]+\/?)?$/, url, "Listing");
  const reportedTotalRaw = await page.$eval(
    "h1.breadcrumb-filters__title[data-count]",
    node => node.getAttribute("data-count"),
  ).catch(() => null);
  const reportedTotal = reportedTotalRaw == null
    ? undefined
    : parseRequiredCount(reportedTotalRaw, "websites index data-count");
  const extractLinks = async (): Promise<string[]> => await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a"));
    const targetSubPath = "/sites/sub" + "mit";
    return Array.from(new Set(
      anchors
        .map(a => a.href)
        .filter(href => href && href.includes("/sites/") && !href.includes(targetSubPath) && !href.includes("#")),
    ));
  });
  const initialPageSize = (await extractLinks()).length;
  const currentPageRaw = await page.$eval(
    ".pagination__item--current",
    node => node.textContent?.trim() ?? "",
  ).catch(() => "");
  const currentPage = /^\d+$/.test(currentPageRaw) ? Number(currentPageRaw) : undefined;

  if (options.scroll !== false) {
    await scrollUntilStable(page, "li, .card-site, .card-slide, .card-directory-sp", 60);
  }

  const links = await extractLinks();
  Object.defineProperties(links, {
    reportedTotal: { value: reportedTotal, enumerable: false },
    initialPageSize: { value: initialPageSize, enumerable: false },
    currentPage: { value: currentPage, enumerable: false },
  });
  return links as ListingPageResult;
};

/**
 * Parses all necessary elements from a single detail page of Awwwards.
 */
export const scrapeDetailPage = async (page: Page, awwwardsUrl: string, awardType: "SOTD" | "Nominee"): Promise<ScrapedData> => {
  console.log(`Scraping detail page: ${awwwardsUrl}`);
  const response = await gotoWithTransientServerRetry(
    page,
    awwwardsUrl,
    { waitUntil: "networkidle2", timeout: 60000 },
    "Site",
  );
  assertSuccessfulPage(response, awwwardsUrl, "Site");
  assertPagePath(page, /^\/sites\/[^/?#]+\/?$/, awwwardsUrl, "Site");

    const slug = awwwardsUrl.split("/").filter(Boolean).pop() || "";
    if (!slug) {
      throw new Error(`Could not extract slug from URL: ${awwwardsUrl}`);
    }

    // Evaluate in-browser to parse structure
    const parseSitePage = () => page.evaluate((slug, awwwardsUrl, awardTypeValue) => {
      // 1. Title
      const h1Text = document.querySelector("h1")?.textContent?.trim();
      const heroText = document.querySelector(".heading-large")?.textContent?.trim() ||
        document.querySelector(".header-title")?.textContent?.trim() ||
        document.querySelector(".submission-title")?.textContent?.trim();
      const title = h1Text || heroText || document.title.split("-")[0]?.trim();
      if (!title) throw new Error("Site page is missing its title");

      // 2. Live URL
      let liveUrl: string | null = null;
      const visitAnchors = Array.from(document.querySelectorAll("a"));
      for (const a of visitAnchors) {
        const text = a.textContent?.toLowerCase() || "";
        const href = a.href || "";
        if (
          (text.includes("visit") || text.includes("visit site") || a.classList.contains("js-visit-site")) &&
          href &&
          !href.includes("awwwards.com") &&
          href.startsWith("http")
        ) {
          liveUrl = href;
          break;
        }
      }

      // 3. Description
      const descEl = document.querySelector(".description") ||
        document.querySelector(".box-description") ||
        document.querySelector(".text-description") ||
        document.querySelector("meta[name='description']");
      let description: string | null = null;
      if (descEl) {
        const rawDescription = descEl.tagName === "META"
          ? (descEl as HTMLMetaElement).content?.trim()
          : descEl.textContent?.trim() || null;
        description = rawDescription || null;
      }

      // 4. Award Date
      let awardDate: string | null = null;
      const bodyText = document.body.innerText;
      const dateMatch = bodyText.match(/(?:Site of the Day|SOTD)[\s-]*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i);
      if (dateMatch) {
        awardDate = dateMatch[1] || null;
      } else {
        const dateEl = document.querySelector(".date") || document.querySelector(".award-date");
        if (dateEl) {
          awardDate = dateEl.textContent?.trim() || null;
        }
      }

      // 5. Creators
      const creators = Array.from(document.querySelectorAll(".head-site__credits .avatar-name__link, .users-credits__details .avatar-name__link"))
        .map((link, creator_order) => {
          const anchor = link as HTMLAnchorElement;
          const href = anchor.href || "";
          const pathParts = href ? new URL(href).pathname.split("/").filter(Boolean) : [];
          const username = pathParts[pathParts.length - 1] || null;
          const img = anchor.querySelector("img") as HTMLImageElement | null;
          const name = anchor.querySelector("strong")?.textContent?.trim()
            || anchor.getAttribute("aria-label")
            || anchor.textContent?.trim()
            || username;
          return username ? {
            username,
            display_name: name || username,
            profile_url: href || null,
            avatar_url: img?.src || null,
            country: null,
            is_pro: Boolean(anchor.querySelector("sup")),
            creator_order,
            raw_json: JSON.stringify({
              href: href || null,
              name,
              is_pro: Boolean(anchor.querySelector("sup")),
            }),
          } as DbSiteCreator : null;
        })
        .filter((item): item is DbSiteCreator => item !== null);

      const primaryCreator = creators[0] ?? null;

      // 6. Scores (Main SOTD Scores)
      let overallScore: string | null = null;
      let designScore: string | null = null;
      let usabilityScore: string | null = null;
      let creativityScore: string | null = null;
      let contentScore: string | null = null;

      const noteSingle = document.querySelector(".note-single") || document.querySelector(".box-score");
      if (noteSingle) {
        overallScore = noteSingle.textContent?.trim() || null;
      }

      const overallHeading = document.querySelector(".c-heading-score__note");
      if (overallHeading) overallScore = overallHeading.textContent?.trim() || overallScore;
      const overallScores = Array.from(document.querySelectorAll(".layout-overall:not(.layout-overall--dev) .layout-overall__score strong"))
        .map(node => node.textContent?.trim() || null);
      designScore = overallScores[0] ?? null;
      usabilityScore = overallScores[1] ?? null;
      creativityScore = overallScores[2] ?? null;
      contentScore = overallScores[3] ?? null;

      const evalItems = Array.from(document.querySelectorAll(".item-evaluation, .evaluation-item, .box-item-score"));
      evalItems.forEach(item => {
        const titleText = item.querySelector(".title, .label, .name")?.textContent?.toLowerCase() || "";
        const scoreVal = item.querySelector(".score, .note, .val")?.textContent?.trim() || null;
        if (titleText.includes("design")) designScore = scoreVal;
        else if (titleText.includes("usability")) usabilityScore = scoreVal;
        else if (titleText.includes("creativity")) creativityScore = scoreVal;
        else if (titleText.includes("content")) contentScore = scoreVal;
      });

      // 7. DEV Award Scores (if any)
      let devOverallScore: string | null = null;
      let devSemanticsScore: string | null = null;
      let devAnimationsScore: string | null = null;
      let devAccessibilityScore: string | null = null;
      let devWpoScore: string | null = null;
      let devResponsiveScore: string | null = null;
      let devMarkupScore: string | null = null;

      const devContainers = Array.from(document.querySelectorAll(".box-evaluation-developer, .developer-award, .dev-award"));
      devContainers.forEach(container => {
        const mainScoreEl = container.querySelector(".note-single, .score, .overall");
        if (mainScoreEl) devOverallScore = mainScoreEl.textContent?.trim() || null;

        const items = Array.from(container.querySelectorAll(".item-evaluation, .evaluation-item"));
        items.forEach(item => {
          const titleText = item.querySelector(".title, .label, .name")?.textContent?.toLowerCase() || "";
          const scoreVal = item.querySelector(".score, .note, .val")?.textContent?.trim() || null;
          if (titleText.includes("semantics")) devSemanticsScore = scoreVal;
          else if (titleText.includes("animations")) devAnimationsScore = scoreVal;
          else if (titleText.includes("accessibility")) devAccessibilityScore = scoreVal;
          else if (titleText.includes("wpo")) devWpoScore = scoreVal;
          else if (titleText.includes("responsive")) devResponsiveScore = scoreVal;
          else if (titleText.includes("markup")) devMarkupScore = scoreVal;
        });
      });
      const devLayout = document.querySelector(".layout-overall--dev");
      if (devLayout) {
        const devHeading = devLayout.previousElementSibling?.querySelector(".c-heading-score__note") || document.querySelectorAll(".c-heading-score__note")[1];
        if (devHeading) devOverallScore = devHeading.textContent?.trim() || null;
        const devScores = Array.from(devLayout.querySelectorAll(".layout-overall__score strong")).map(node => node.textContent?.trim() || null);
        devSemanticsScore = devScores[0] ?? null;
        devAnimationsScore = devScores[1] ?? null;
        devAccessibilityScore = devScores[2] ?? null;
        devWpoScore = devScores[3] ?? null;
        devResponsiveScore = devScores[4] ?? null;
        devMarkupScore = devScores[5] ?? null;
      }

      // 8. Technologies & Tools
      const techList: string[] = [];
      const techAnchors = Array.from(document.querySelectorAll("a[href*='/websites/']"));
      techAnchors.forEach(a => {
        const text = a.textContent?.trim();
        if (text && !techList.includes(text) && !text.includes("Winners") && !text.includes("Nominees") && !text.includes("Sites")) {
          techList.push(text);
        }
      });

      // 9. Colors
      const colorList: string[] = [];
      const colorEls = Array.from(document.querySelectorAll("[class*='color'], [class*='palette'], .hex, [style*='#'], .list-palette__item"));
      colorEls.forEach(el => {
        const text = `${el.textContent?.trim() || ""} ${el.getAttribute("style") || ""}`;
        const matches = text.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}/g) || [];
        for (const color of matches) {
          const normalized = color.toUpperCase();
          if (!colorList.includes(normalized)) colorList.push(normalized);
        }
      });

      if (colorList.length === 0) {
        const pageText = document.body.innerText;
        const matches = pageText.match(/#[0-9A-Fa-f]{6}/g);
        if (matches) {
          matches.forEach(c => {
            if (!colorList.includes(c)) colorList.push(c);
          });
        }
      }

      const tags: DbSiteTag[] = [];
      Array.from(document.querySelectorAll("ul.list-tags > li")).forEach(li => {
        const colorTag = li.querySelector(".button--tag--color--small") as HTMLAnchorElement | null;
        if (colorTag) {
          const style = colorTag.getAttribute("style") || "";
          const match = style.match(/background:\s*(#[0-9A-Fa-f]{3,6})/);
          const value = match?.[1] || null;
          if (value) {
            tags.push({
              site_slug: slug,
              tag_type: "color",
              value,
              hex_code: value,
              label: null,
              raw_json: JSON.stringify({ style }),
            });
          }
          return;
        }

        const tag = li.querySelector(".button--tag") as HTMLAnchorElement | HTMLSpanElement | null;
        const value = tag?.textContent?.trim() || null;
        if (value) {
          tags.push({
            site_slug: slug,
            tag_type: "tag",
            value,
            hex_code: null,
            label: value,
            raw_json: JSON.stringify({
              href: tag instanceof HTMLAnchorElement ? tag.href : null,
            }),
          });
        }
      });

      // 10. Media assets (Images and Videos)
      const mediaList: Array<{ url: string; type: "image" | "video" }> = [];

      const images = Array.from(document.querySelectorAll(".gallery-site:not(.gallery-site--two-cols) img"));
      images.forEach(node => {
        const img = node as HTMLImageElement;
        const src = img.getAttribute("data-src") || img.src;
        if (src && src.startsWith("http")) {
          if (!mediaList.some(m => m.url === src)) {
            mediaList.push({ url: src, type: "image" });
          }
        }
      });

      const videos = Array.from(document.querySelectorAll(".gallery-site:not(.gallery-site--two-cols) video"));
      videos.forEach(node => {
        const v = node as HTMLVideoElement;
        const source = v.querySelector("source");
        const src = source?.getAttribute("data-src") || source?.src || v.src;
        if (src && src.startsWith("http")) {
          if (!mediaList.some(m => m.url === src)) {
            mediaList.push({ url: src, type: "video" });
          }
        }
      });
      if (mediaList.length === 0) throw new Error("Site page is missing gallery media");

      const inspirationSlugs = Array.from(document.querySelectorAll("a[href*='/inspiration/']"))
        .map(anchor => new URL((anchor as HTMLAnchorElement).href, location.origin))
        .filter(url => /^\/inspiration\/[^/?#]+\/?$/.test(url.pathname))
        .map(url => url.pathname.split("/").filter(Boolean).pop() || "")
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);

      // 11. Votes (Jury / Community ratings)
      const votesList: Array<{
        voter_username: string;
        voter_name: string;
        voter_role: string | null;
        voter_country: string | null;
        voter_profile: string | null;
        voter_avatar: string | null;
        voter_website: string | null;
        vote_type: "Jury" | "Community" | "DevJury";
        design_score: string | null;
        usability_score: string | null;
        creativity_score: string | null;
        content_score: string | null;
        overall_score: string | null;
      }> = [];
      const voteSections = Array.from(document.querySelectorAll(".content-tabs__item, .list-users-votes"));
      voteSections.forEach(section => {
        const sectionId = section.getAttribute("id");
        const tabLabel = sectionId
          ? document.querySelector(`.menu-tabs [data-id='${sectionId}'], .menu-tabs [data-tab='${sectionId}']`)?.textContent?.trim() || sectionId
          : section.querySelector(".heading-section__title")?.textContent?.trim() || "Jury";
        const vote_type = tabLabel.toLowerCase().includes("community")
          ? "Community"
          : tabLabel.toLowerCase().includes("dev")
            ? "DevJury"
            : "Jury";

        const voterEls = Array.from(section.querySelectorAll(".list-jury-notes > li, :scope > li, .list-users-votes > li, .item-user, .voter-item, .box-jury"));
        voterEls.forEach(el => {
          const link = el.querySelector("a[href]") as HTMLAnchorElement | null;
          if (!link) return;

          const voterProfile = link.href;
          const pathParts = new URL(link.href).pathname.split("/").filter(Boolean);
          const voter_username = pathParts[pathParts.length - 1] || "";
          if (!voter_username) return;

          const voter_name = el.querySelector("strong")?.textContent?.trim()
            || link.textContent?.trim()
            || voter_username;
          const voter_avatar = el.querySelector("img")?.src || null;

          const infoText = el.querySelector(".info")?.textContent || el.textContent || "";
          const roleMatch = infoText.match(/from\s+([A-Za-z\s-]+)/i);
          const voter_country = roleMatch ? (roleMatch[1] || "").trim() || null : null;
          const voter_role = el.querySelector(".profession, .role")?.textContent?.trim() || null;
          const voter_website = Array.from(el.querySelectorAll(".info div"))
            .map(node => node.textContent?.trim())
            .filter((value): value is string => Boolean(value))
            .find(value => value && !value.includes("from ") && !value.includes(voter_name)) || null;

          const scores = Array.from(el.querySelectorAll(".grid-score__item, .score, .note, .val"));
          let design_score: string | null = null;
          let usability_score: string | null = null;
          let creativity_score: string | null = null;
          let content_score: string | null = null;
          let overall_score: string | null = null;

          if (scores.length >= 5) {
            design_score = scores[0]?.textContent?.trim() || null;
            usability_score = scores[1]?.textContent?.trim() || null;
            creativity_score = scores[2]?.textContent?.trim() || null;
            content_score = scores[3]?.textContent?.trim() || null;
            overall_score = scores[4]?.textContent?.trim() || null;
          } else if (scores.length === 1) {
            overall_score = scores[0]?.textContent?.trim() || null;
          }

          votesList.push({
            voter_username,
            voter_name,
            voter_role,
            voter_country,
            voter_profile: voterProfile,
            voter_avatar,
            voter_website,
            vote_type,
            design_score,
            usability_score,
            creativity_score,
            content_score,
            overall_score
          });
        });
      });

      return {
        slug,
        title,
        liveUrl,
        awwwardsUrl,
        description,
        awardType: awardTypeValue,
        awardDate,
        creators,
        primaryCreator,
        overallScore,
        designScore,
        usabilityScore,
        creativityScore,
        contentScore,
        devOverallScore,
        devSemanticsScore,
        devAnimationsScore,
        devAccessibilityScore,
        devWpoScore,
        devResponsiveScore,
        devMarkupScore,
        techList,
        colorList,
        tags,
        mediaList,
        votesList,
        inspirationSlugs
      };
    }, slug, awwwardsUrl, awardType);

    let rawData: Awaited<ReturnType<typeof parseSitePage>>;
    try {
      rawData = await parseSitePage();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Site page is missing gallery media") {
        throw error;
      }

      console.warn(`Gallery media was absent on first render; retrying site page: ${awwwardsUrl}`);
      const retryResponse = await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      assertSuccessfulPage(retryResponse, awwwardsUrl, "Site retry");
      assertPagePath(page, /^\/sites\/[^/?#]+\/?$/, awwwardsUrl, "Site retry");
      rawData = await parseSitePage();
    }

    const creator: DbUser | null = rawData.primaryCreator ? {
      username: rawData.primaryCreator.username,
      name: rawData.primaryCreator.display_name,
      avatar_url: sanitizeUrl(rawData.primaryCreator.avatar_url),
      profile_url: sanitizeUrl(rawData.primaryCreator.profile_url),
      role: rawData.primaryCreator.is_pro ? "Creator" : null,
      country: rawData.primaryCreator.country,
      email: null,
      display_name: rawData.primaryCreator.display_name,
      website_url: sanitizeUrl(rawData.primaryCreator.profile_url),
      is_pro: rawData.primaryCreator.is_pro,
      source_url: awwwardsUrl,
      raw_json: rawData.primaryCreator.raw_json,
    } : null;

    const site: DbSite = {
      slug: rawData.slug,
      title: rawData.title,
      live_url: sanitizeUrl(rawData.liveUrl),
      awwwards_url: rawData.awwwardsUrl,
      description: rawData.description,
      award_type: awardType === "SOTD" ? "SOTD" : "Nominee",
      award_date: rawData.awardDate,
      creator_username: rawData.primaryCreator?.username ?? null,
      overall_score: parseOptionalScore(rawData.overallScore, "overall"),
      design_score: parseOptionalScore(rawData.designScore, "design"),
      usability_score: parseOptionalScore(rawData.usabilityScore, "usability"),
      creativity_score: parseOptionalScore(rawData.creativityScore, "creativity"),
      content_score: parseOptionalScore(rawData.contentScore, "content"),
      dev_overall_score: parseOptionalScore(rawData.devOverallScore, "developer overall"),
      dev_semantics_score: parseOptionalScore(rawData.devSemanticsScore, "developer semantics"),
      dev_animations_score: parseOptionalScore(rawData.devAnimationsScore, "developer animations"),
      dev_accessibility_score: parseOptionalScore(rawData.devAccessibilityScore, "developer accessibility"),
      dev_wpo_score: parseOptionalScore(rawData.devWpoScore, "developer WPO"),
      dev_responsive_score: parseOptionalScore(rawData.devResponsiveScore, "developer responsive"),
      dev_markup_score: parseOptionalScore(rawData.devMarkupScore, "developer markup"),
    };

    const colors = Array.from(new Set(rawData.colorList.flatMap(extractHexColors)));

    const votes: DbVote[] = rawData.votesList.map(v => ({
      site_slug: rawData.slug,
      voter_username: v.voter_username,
      voter_name: v.voter_name ?? v.voter_username,
      voter_avatar_url: v.voter_avatar ?? null,
      voter_profile_url: v.voter_profile ?? null,
      voter_country: v.voter_country ?? null,
      voter_website_url: v.voter_website ?? null,
      voter_role: v.voter_role,
      vote_type: v.vote_type,
      design_score: parseOptionalScore(v.design_score, "vote design"),
      usability_score: parseOptionalScore(v.usability_score, "vote usability"),
      creativity_score: parseOptionalScore(v.creativity_score, "vote creativity"),
      content_score: parseOptionalScore(v.content_score, "vote content"),
      overall_score: parseOptionalScore(v.overall_score, "vote overall"),
      source_url: awwwardsUrl,
      raw_json: JSON.stringify(v),
    }));

    return {
      sourceUrl: awwwardsUrl,
      parser: "awwwards-site",
      meta: {
        title: site.title,
        award_type: site.award_type,
        creator: creator?.username ?? null,
        creators: rawData.creators,
        technologies: rawData.techList,
        colors,
        tags: rawData.tags,
        votes: votes.length,
      },
      site,
      creator,
      creators: rawData.creators,
      technologies: rawData.techList,
      colors,
      tags: rawData.tags,
      media: rawData.mediaList,
      votes,
      inspirationSlugs: rawData.inspirationSlugs,
    };
};

export const scrapeInspirationPage = async (page: Page, sourceUrl: string): Promise<AssetScrapeData | null> => {
  const response = await gotoWithTransientServerRetry(
    page,
    sourceUrl,
    { waitUntil: "domcontentloaded", timeout: 60000 },
    "Inspiration",
  );
  assertSuccessfulPage(response, sourceUrl, "Inspiration");
  assertPagePath(page, /^\/inspiration\/[^/?#]+\/?$/, sourceUrl, "Inspiration");
  await page.waitForSelector("[data-collectable-model-value]", { timeout: 15000 });

  const rawData = await page.evaluate(() => {
      const title = document.querySelector("h1.gallery-element__title")?.childNodes[0]?.textContent?.trim()
        || document.querySelector("h1")?.textContent?.trim();
      if (!title) throw new Error("Inspiration page is missing its title");

      const websiteLink = document.querySelector("h1.gallery-element__title a, h1 a.link-underlined, h1 a") as HTMLAnchorElement | null;
      const website = websiteLink?.textContent?.trim() || null;
      const websiteUrl = websiteLink?.href || null;
      const siteAwwwardsUrl = websiteLink && new URL(websiteLink.href, location.origin).pathname.match(/^\/sites\/[^/?#]+\/?$/)
        ? new URL(websiteLink.href, location.origin).href
        : null;

      const authorLink = Array.from(document.querySelectorAll("a[href^='/']"))
        .find(a => {
          const href = (a as HTMLAnchorElement).href || "";
          const pathParts = new URL(href, location.origin).pathname.split("/").filter(Boolean);
          return pathParts.length === 1 && !href.includes("/sites/") && !href.includes("/collections/") && !href.includes("/elements/") && !href.includes("/directory/");
        }) as HTMLAnchorElement | undefined;
      const authorUsername = authorLink ? new URL(authorLink.href).pathname.split("/").filter(Boolean).pop() || null : null;
      const authorName = authorLink?.querySelector("img")?.getAttribute("alt")
        || authorLink?.querySelector("img")?.getAttribute("title")
        || authorLink?.textContent?.trim()
        || authorUsername;

      const modelSource = document.querySelector("[data-collectable-model-value]")?.getAttribute("data-collectable-model-value");
      let model: Record<string, unknown> | null = null;
      if (!modelSource) throw new Error("Inspiration page is missing data-collectable-model-value");
      try {
        model = JSON.parse(modelSource);
      } catch {
        throw new Error("Inspiration page has invalid data-collectable-model-value JSON");
      }
      if (!model) throw new Error("Inspiration page has empty data-collectable-model-value");
      if (model["type"] !== "element") {
        throw new Error(`Inspiration page has invalid model type: ${JSON.stringify(model["type"])}`);
      }

      const tags = Array.from(
        document.querySelectorAll(".c-tags .button--tag, .list-tags .button--tag, .tags a, .tag, [data-tag], .card-site__tags a")
      ).map(tag => tag.textContent?.trim()).filter((tag): tag is string => Boolean(tag));

      const media: Array<{ url: string; type: "image" | "video" }> = [];
      const image = document.querySelector(".gallery-element__media img, .figure-rollover__file, picture img") as HTMLImageElement | null;
      const imageUrl = image?.getAttribute("data-src") || image?.src || null;
      const video = document.querySelector(".gallery-element__media video source, .gallery-element__media video, video source, video") as HTMLSourceElement | HTMLVideoElement | null;
      const videoUrl = video instanceof HTMLSourceElement
        ? video.getAttribute("data-src") || video.src
        : video?.querySelector("source")?.getAttribute("data-src") || video?.querySelector("source")?.src || video?.src || null;
      const modelMedia = typeof model?.["main_image"] === "string"
        ? model["main_image"] as string
        : typeof model?.["collectableImage"] === "string"
          ? model["collectableImage"] as string
          : null;
      const assetBase = modelMedia ? `https://assets.awwwards.com/awards/${modelMedia}` : null;
      if (imageUrl) {
        media.push({ url: imageUrl, type: "image" });
      } else if (videoUrl) {
        media.push({ url: videoUrl, type: "video" });
        media.push({ url: videoUrl.replace(/\.mp4(\?.*)?$/, "_static.jpeg"), type: "image" });
      } else if (assetBase && assetBase.endsWith(".mp4")) {
        media.push({ url: assetBase, type: "video" });
        media.push({ url: assetBase.replace(/\.mp4(\?.*)?$/, "_static.jpeg"), type: "image" });
      }

      return {
        title,
        website,
        websiteUrl,
        siteAwwwardsUrl,
        authorUsername,
        authorName,
        tags,
        likes: typeof model?.["likes"] === "number" ? model["likes"] as number : null,
        model,
        media,
      };
    });

  return {
    sourceUrl,
    parser: "awwwards-element",
    meta: {
      kind: "element",
      title: rawData.title,
      website: rawData.website,
      websiteUrl: rawData.websiteUrl,
      siteAwwwardsUrl: rawData.siteAwwwardsUrl,
      author: rawData.authorUsername,
      authorName: rawData.authorName,
      tags: rawData.tags,
      likes: rawData.likes,
      model: rawData.model,
    },
    media: rawData.media,
  };
};

export const scrapeElementsIndexPage = async (page: Page, sourceUrl: string): Promise<ElementsIndexPageResult> => {
  const response = await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });
  assertSuccessfulPage(response, sourceUrl, "Elements index");
  assertPagePath(page, /^\/elements\/?$/, sourceUrl, "Elements index");
  await scrollUntilStable(page, "a[href*='/inspiration/']", 400);
  const reportedTotalRaw = await page.$eval("h1.breadcrumb-filters__title[data-count]", node => node.getAttribute("data-count"));
  const reportedTotal = parseRequiredCount(reportedTotalRaw, "elements index data-count");
  const elements = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href*='/inspiration/']"))
      .map(anchor => new URL((anchor as HTMLAnchorElement).href, location.origin))
      .map(url => ({
        slug: url.pathname.split("/").filter(Boolean).pop() || "",
        url: url.href,
      }))
      .filter(item => /^https:\/\/www\.awwwards\.com\/inspiration\/[^/?#]+$/.test(item.url) && Boolean(item.slug));
    return Array.from(new Map(links.map(item => [item.url, item])).values());
  });
  if (elements.length !== reportedTotal) {
    console.warn(
      `Elements index count mismatch: expected ${reportedTotal} inspirations, found ${elements.length}; continuing with discovered inspiration URLs.`,
    );
  }
  Object.defineProperty(elements, "reportedTotal", { value: reportedTotal, enumerable: false });
  return elements as ElementsIndexPageResult;
};

export const scrapeCollectionPage = async (page: Page, sourceUrl: string): Promise<AssetScrapeData | null> => {
  try {
    await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const rawData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("figure[data-model]"));
      const items = cards.flatMap(card => {
        const modelText = card.getAttribute("data-model");
        let model: Record<string, unknown> | null = null;
        if (modelText) {
          try {
            model = JSON.parse(modelText);
          } catch {
            model = null;
          }
        }

        const link = card.querySelector("a[href]") as HTMLAnchorElement | null;
        const image = card.querySelector("img") as HTMLImageElement | null;
        const title = card.querySelector(".js-title-collection, .card-site__title, h3, h2")?.textContent?.trim()
          || model?.["name"]?.toString()
          || null;

        if (!title) return [];
        return [{
          title,
          slug: model?.["slug"]?.toString() || link?.href || title,
          category: model?.["category"] && typeof model["category"] === "object" ? (model["category"] as Record<string, unknown>)["name"]?.toString() || null : null,
          author: model?.["user"] && typeof model["user"] === "object" ? (model["user"] as Record<string, unknown>)["username"]?.toString() || null : null,
          media: image?.src || image?.getAttribute("data-src") || null,
          model,
        }];
      });

      return {
        title: document.title.replace(/-\s*Awwwards.*$/i, "").trim() || "Collections",
        items,
      };
    });

    return {
      sourceUrl,
      parser: "awwwards-collection",
      meta: {
        kind: "collection",
        title: rawData.title,
        items: rawData.items,
      },
      media: rawData.items.flatMap(item => item.media ? [{ url: item.media, type: "image" as const }] : []),
    };
  } catch (err) {
    console.error(`Error scraping collection page ${sourceUrl}:`, err);
    return null;
  }
};

export const scrapeDirectoryPage = async (page: Page, sourceUrl: string): Promise<AssetScrapeData | null> => {
  try {
    await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const rawData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".card-directory-sp, .card-directory"));
      const items = cards.map(card => {
        const link = card.querySelector("a[href]") as HTMLAnchorElement | null;
        const username = link ? new URL(link.href).pathname.split("/").filter(Boolean).pop() || null : null;
        const name = card.querySelector(".card-directory-sp__title a, .avatar-name__name strong, .avatar-name__title, h2, h3")?.textContent?.trim()
          || username;
        const location = card.querySelector(".card-directory-sp__left p, .card-directory__section + div")?.textContent?.trim() || null;
        const website = card.querySelector(".url[href], a[target='_blank'][rel*='noopener']") as HTMLAnchorElement | null;
        const avatar = card.querySelector("img") as HTMLImageElement | null;
        const awards = Array.from(card.querySelectorAll(".box-score")).map(box => ({
          label: box.querySelector(".box-score__top strong")?.textContent?.trim() || "",
          value: box.querySelector(".box-score__bottom strong")?.textContent?.trim() || "",
        }));
        return { username, name, location, website: website?.href || null, avatar: avatar?.src || null, awards };
      });
      return { title: document.title.trim(), items };
    });

    return {
      sourceUrl,
      parser: "awwwards-directory",
      meta: {
        kind: "directory",
        title: rawData.title,
        items: rawData.items,
      },
      media: rawData.items.flatMap(item => item.avatar ? [{ url: item.avatar, type: "image" as const }] : []),
    };
  } catch (err) {
    console.error(`Error scraping directory page ${sourceUrl}:`, err);
    return null;
  }
};

export const scrapeDirectoryIndexPage = async (page: Page, sourceUrl: string): Promise<DirectorySummaryData[]> => {
  await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });
  await scrollUntilStable(page, ".card-directory-sp, .card-directory");

  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".card-directory-sp, .card-directory")).map(card => {
      const link = card.querySelector("a[href^='/']") as HTMLAnchorElement | null;
      const username = link ? new URL(link.href, location.origin).pathname.split("/").filter(Boolean).pop() || "" : "";
      const displayName = card.querySelector(".card-directory-sp__title a, .avatar-name__name strong, .avatar-name__title, h2, h3")?.textContent?.trim()
        || username;
      const country = card.querySelector(".card-directory-sp__left p")?.textContent?.trim() || null;
      const avatar = card.querySelector("img") as HTMLImageElement | null;
      return {
        url: link?.href || "",
        username,
        display_name: displayName,
        country,
        avatar_url: avatar?.src || null,
        is_pro: Boolean(card.querySelector("sup, .badge, .pro")),
        raw_json: null,
      };
    }).filter(profile => Boolean(profile.url) && Boolean(profile.username));
  });
};

export const scrapeDirectoryProfilePage = async (page: Page, sourceUrl: string): Promise<DirectoryProfileData | null> => {
  try {
    await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });

    return await page.evaluate(() => {
      const username = location.pathname.split("/").filter(Boolean).pop() || "";
      const displayName = document.querySelector(".avatar-name__title, h1, .card-directory-sp__title a")?.textContent?.trim() || username;
      const avatar = document.querySelector(".avatar-name__img, .circle-avatar__img") as HTMLImageElement | null;
      const websiteAnchor = document.querySelector(".card-directory__list a[href^='http'], .card-directory-sp__footer a[href^='http']") as HTMLAnchorElement | null;
      const items = Array.from(document.querySelectorAll(".card-directory__list > li, .card-directory-sp__footer"));

      const getCount = (label: string): number | null => {
        const node = Array.from(document.querySelectorAll(".box-score, .badget-reviews")).find(el =>
          el.textContent?.toUpperCase().includes(label.toUpperCase())
        );
        const value = node?.querySelector(".box-score__bottom strong, .badget-reviews__number")?.textContent?.trim();
        const parsed = value ? parseInt(value, 10) : NaN;
        return Number.isFinite(parsed) ? parsed : null;
      };

      const country = Array.from(items).find(item => item.textContent?.includes("Location"))?.querySelector("div:last-child")?.textContent?.trim() || null;
      const isPro = Boolean(document.querySelector("sup"));

      return {
        username,
        display_name: displayName,
        country,
        website_url: websiteAnchor?.href || null,
        avatar_url: avatar?.src || null,
        is_pro: isPro,
        works_count: getCount("Works"),
        award_soty_count: getCount("SOTY"),
        award_sotm_count: getCount("SOTM"),
        award_sotd_count: getCount("SOTD"),
        award_hm_count: getCount("HM"),
        raw_json: null,
      };
    });
  } catch (err) {
    console.error(`Error scraping directory profile ${sourceUrl}:`, err);
    return null;
  }
};

export const storeDirectoryProfileData = async (sql: SQL, profile: DirectoryProfileData): Promise<void> => {
  await insertUser(sql, {
    username: profile.username,
    name: profile.display_name,
    avatar_url: profile.avatar_url,
    profile_url: profile.website_url,
    role: "Creator",
    country: profile.country,
    email: null,
    display_name: profile.display_name,
    website_url: profile.website_url,
    is_pro: profile.is_pro,
    works_count: profile.works_count,
    award_soty_count: profile.award_soty_count,
    award_sotm_count: profile.award_sotm_count,
    award_sotd_count: profile.award_sotd_count,
    award_hm_count: profile.award_hm_count,
    source_url: profile.website_url,
    raw_json: profile.raw_json,
  });
};

export const scrapeCollectionsIndexPage = async (page: Page, sourceUrl: string): Promise<CollectionIndexResult> => {
  const response = await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });
  assertSuccessfulPage(response, sourceUrl, "Collections index");
  assertPagePath(page, /^\/collections\/?$/, sourceUrl, "Collections index");
  await scrollUntilStable(page, "figure[data-model], .card-slide", 400);
  const totalCollectionsRaw = await page.$eval("h1.breadcrumb-filters__title[data-count]", node => node.getAttribute("data-count"));
  const advertisedTotal = parseRequiredCount(totalCollectionsRaw, "collections index data-count");
  const reportedTotal = effectiveCollectionsIndexTotal(sourceUrl, advertisedTotal);
  if (reportedTotal !== advertisedTotal) {
    console.warn(`Collections index exception: advertised ${advertisedTotal}, using ${reportedTotal} for ${sourceUrl}`);
  }
  console.log(`Collections index reports ${advertisedTotal} collections; effective total is ${reportedTotal}.`);

  const extractCollectionsFromCurrentPage = async (): Promise<CollectionSummaryData[]> => await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("figure[data-model], .card-slide, a[href*='/collections/']"));
    const items = cards.map(card => {
      const isCollectionCard = card.matches("figure[data-model], .card-slide") || Boolean(card.closest("figure[data-model], .card-slide"));
      if (!isCollectionCard) return null;
      const raw = card.getAttribute("data-model") || card.querySelector("figure")?.getAttribute("data-model") || null;
      let model: Record<string, unknown> | null = null;
      if (raw) {
        try {
          model = JSON.parse(raw);
        } catch {
          throw new Error("Collections index card has invalid data-model JSON");
        }
      }

      const link = (card.matches("a[href*='/collections/']") ? card : card.querySelector("a[href*='/collections/']")) as HTMLAnchorElement | null;
      const title = card.querySelector(".js-title-collection, .card-slide__title, h3")?.textContent?.trim()
        || model?.["name"]?.toString()
        || link?.textContent?.trim()
        || "";
      const path = link ? new URL(link.href, location.origin).pathname : "";
      const pathParts = path.split("/").filter(Boolean);
      const collectionsIndex = pathParts.indexOf("collections");
      const publicSlug = collectionsIndex >= 0 ? pathParts[collectionsIndex + 1] || "" : "";
      const ownerSegment = collectionsIndex > 0 ? pathParts[collectionsIndex - 1] : "";
      const validCollectionPath = collectionsIndex === 1 && Boolean(ownerSegment) && ownerSegment !== "collections" && Boolean(publicSlug);
      const slug = validCollectionPath ? publicSlug : model?.["slug"]?.toString() || title;
      const creator = model?.["user"] && typeof model["user"] === "object" ? model["user"] as Record<string, unknown> : null;
      const category = model?.["category"] && typeof model["category"] === "object" ? model["category"] as Record<string, unknown> : null;
      const followers = typeof model?.["followers_count"] === "number" ? model["followers_count"] as number : null;
      return {
        slug,
        name: title,
        url: validCollectionPath ? (link?.href || path || "") : "",
        category_name: category?.["name"]?.toString() || null,
        creator_username: creator?.["username"]?.toString() || null,
        creator_name: creator?.["display_name"]?.toString() || null,
        followers_count: followers,
        items_count: null,
        sites_count: null,
        inspirations_count: null,
        raw_json: model ? JSON.stringify(model) : null,
      };
    });

    return Array.from(new Map(items
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter(item => Boolean(item.slug) && Boolean(item.name) && Boolean(item.url) && /\/[^/?#]+\/collections\/[^/?#]+/.test(item.url))
      .map(item => [item.url, item])).values());
  });
  const paginationUrls = await page.evaluate(() => Array.from(document.querySelectorAll("a[href*='/collections/']"))
    .map(anchor => new URL((anchor as HTMLAnchorElement).href, location.origin))
    .filter(url => url.pathname === "/collections/" && url.searchParams.has("page"))
    .map(url => url.href));
  const pageUrls = Array.from(new Set([new URL(sourceUrl, "https://www.awwwards.com").href, ...paginationUrls]))
    .sort((left, right) => Number(new URL(left).searchParams.get("page") ?? "1") - Number(new URL(right).searchParams.get("page") ?? "1"));
  const visitedPaginationPages = new Set(pageUrls);
  let paginationPageUrl = pageUrls.at(-1) || new URL(sourceUrl, "https://www.awwwards.com").href;
  while (paginationPageUrl) {
    if (page.url() !== paginationPageUrl) {
      const pageResponse = await page.goto(paginationPageUrl, { waitUntil: "networkidle2", timeout: 60000 });
      assertSuccessfulPage(pageResponse, paginationPageUrl, "Collections index pagination page");
      assertPagePath(page, /^\/collections\/?$/, paginationPageUrl, "Collections index pagination page");
    }
    const nextPageUrl = await page.evaluate(() => {
      const next = document.querySelector(".pagination__next") as HTMLAnchorElement | null;
      return next?.href || null;
    });
    if (!nextPageUrl || visitedPaginationPages.has(nextPageUrl)) break;
    visitedPaginationPages.add(nextPageUrl);
    pageUrls.push(nextPageUrl);
    paginationPageUrl = nextPageUrl;
  }
  const collectionMap = new Map<string, CollectionSummaryData>();
  for (const pageUrl of pageUrls) {
    if (page.url() !== pageUrl) {
      const pageResponse = await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 60000 });
      assertSuccessfulPage(pageResponse, pageUrl, "Collections index page");
      assertPagePath(page, /^\/collections\/?$/, pageUrl, "Collections index page");
    }
    await scrollUntilStable(page, "figure[data-model], .card-slide", 400);
    const pageCollections = await extractCollectionsFromCurrentPage();
    console.log(`Collections index page ${pageUrl} yielded ${pageCollections.length} collection URLs.`);
    if (pageCollections.length === 0) {
      throw new Error(`Collections index pagination page yielded no collection cards: ${pageUrl}`);
    }
    for (const collection of pageCollections) {
      collectionMap.set(collection.url, collection);
    }
  }
  const collections = Array.from(collectionMap.values());
  if (collections.length !== reportedTotal) {
    console.warn(
      `Collections index count mismatch: advertised ${advertisedTotal}, effective ${reportedTotal}, discovered ${collections.length}; continuing with discovered collection URLs.`,
    );
  }
  Object.defineProperty(collections, "reportedTotal", {
    value: reportedTotal,
    enumerable: false,
  });
  return collections as CollectionIndexResult;
};

export const scrapeCollectionDetailPage = async (page: Page, sourceUrl: string): Promise<{ collection: CollectionSummaryData; items: CollectionItemData[] } | null> => {
  const response = await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 60000 });
  assertSuccessfulPage(response, sourceUrl, "Collection");
  assertPagePath(page, /^\/[^/?#]+\/collections\/[^/?#]+\/?$/, sourceUrl, "Collection");

  // Collection pages use an AJAX infinite-scroll controller, but the same
  // controller exposes ordinary pagination links in the DOM. Following those
  // links is deterministic and avoids stopping while a delayed batch is still
  // being requested.
  const collectionCardHtml: string[] = [];
  const visitedCollectionPages = new Set<string>();
  let nextCollectionPage: string | null = page.url();
  while (nextCollectionPage && !visitedCollectionPages.has(nextCollectionPage)) {
    visitedCollectionPages.add(nextCollectionPage);
    if (page.url() !== nextCollectionPage) {
      const pageResponse = await page.goto(nextCollectionPage, { waitUntil: "domcontentloaded", timeout: 60000 });
      assertSuccessfulPage(pageResponse, nextCollectionPage, "Collection pagination page");
      assertPagePath(page, /^\/[^/?#]+\/collections\/[^/?#]+\/?$/, nextCollectionPage, "Collection pagination page");
      await sleep(500);
    }

    const pageData = await page.evaluate(() => ({
      cards: Array.from(document.querySelectorAll("li.js-collectable")).map(card => card.outerHTML),
      next: (document.querySelector(".js-ajax-pagination .pagination__next") as HTMLAnchorElement | null)?.href || null,
    }));
    collectionCardHtml.push(...pageData.cards);
    nextCollectionPage = pageData.next;
  }

  await page.evaluate(cards => {
    const entries = document.querySelector(".js-ajax-entries");
    if (!entries) throw new Error("Collection page is missing its item grid");
    entries.innerHTML = "";
    const template = document.createElement("template");
    for (const card of cards) {
      template.innerHTML = card;
      entries.appendChild(template.content.firstElementChild!);
    }
  }, collectionCardHtml);

  const data = await page.evaluate(() => {
      const collectionTitle = document.querySelector("h1")?.textContent?.trim();
      if (!collectionTitle) throw new Error("Collection page is missing its h1 title");
      const pathParts = location.pathname.split("/").filter(Boolean);
      const collectionsIndex = pathParts.indexOf("collections");
      const slug = collectionsIndex >= 0 ? pathParts[collectionsIndex + 1] || collectionTitle : pathParts[pathParts.length - 1] || collectionTitle;
      const authorAnchor = document.querySelector("h1 a[href^='/'], .avatar-name__link[href^='/']") as HTMLAnchorElement | null;
      const authorPath = authorAnchor ? new URL(authorAnchor.href, location.origin).pathname.split("/").filter(Boolean) : [];
      const creator_username = authorPath.length === 1 ? authorPath[0] : null;
      const creator_name = authorAnchor?.textContent?.trim() || null;
      const canonicalUrl = document.querySelector("link[rel='canonical']")?.getAttribute("href") || location.href;
      if (!/^https:\/\/www\.awwwards\.com\/[^/?#]+\/collections\/[^/?#]+\/?$/.test(canonicalUrl)) {
        throw new Error(`Collection page has invalid canonical URL: ${canonicalUrl}`);
      }
      // Collection pages no longer expose their total on the breadcrumb heading.
      // The current markup publishes it as: <p class="total-grid"><strong>...</strong> items.</p>.
      const countNode = document.querySelector("h1.breadcrumb-filters__title[data-count], .total-grid strong");
      if (!countNode) throw new Error("Collection page is missing its total item count");
      const countRaw = countNode.getAttribute("data-count") || countNode.textContent;
      if (!/^\d+$/.test(countRaw?.trim() ?? "")) {
        throw new Error(`Collection page has invalid data-count: ${JSON.stringify(countRaw)}`);
      }
      const totalGridCount = Number(countRaw);
      if (!Number.isSafeInteger(totalGridCount)) throw new Error(`Collection page data-count is not a safe integer: ${countRaw}`);

      const cards = Array.from(document.querySelectorAll("li.js-collectable"));
      const items = cards.map(card => {
        const raw = card.getAttribute("data-collectable-model-value") || card.getAttribute("data-model") || null;
        let model: Record<string, unknown> | null = null;
        if (raw) {
          try {
            model = JSON.parse(raw);
          } catch {
            throw new Error(`Collection card has invalid data-model JSON`);
          }
        }

        const link = card.querySelector("a.figure-rollover__link[href*='/inspiration/'], a.figure-rollover__link[href*='/sites/'], a[href*='/inspiration/'], a[href*='/sites/']") as HTMLAnchorElement | null;
        const title = model?.["title"]?.toString()
          || model?.["collectableTitle"]?.toString()
          || card.querySelector(".card-site__title, .js-title-collection, h3, h2")?.textContent?.trim()
          || link?.textContent?.trim()
          || (model?.["slug"]?.toString() ?? "");
        // Awwwards' model often contains an internal UUID. The public,
        // stable identifier is the final segment of the /inspiration/ URL.
        const itemUrl = link ? new URL(link.href, location.origin).href : "";
        const linkPath = link ? new URL(itemUrl).pathname : "";
        const linkSlug = linkPath.split("/").filter(Boolean).pop() || "";
        if (!link) throw new Error("Collection card is missing a /sites/ or /inspiration/ link");
        if (!linkPath.includes("/sites/") && !linkPath.includes("/inspiration/")) {
          throw new Error(`Collection card has invalid item URL: ${itemUrl}`);
        }
        const itemType: "site" | "inspiration" = linkPath.includes("/sites/") ? "site" : "inspiration";
        const elementSlug = linkSlug
          || model?.["slug"]?.toString()
          || model?.["collectableIdentifier"]?.toString()
          || "";
        if (!title) throw new Error(`Collection card ${itemUrl} is missing a title`);
        if (!elementSlug) throw new Error(`Collection card ${itemUrl} is missing a public slug`);
        const user = model?.["user"] && typeof model["user"] === "object" ? model["user"] as Record<string, unknown> : null;
        const tags = Array.isArray(model?.["tags"]) ? model["tags"] as string[] : [];
        const mediaPath = typeof model?.["main_image"] === "string"
          ? model["main_image"] as string
          : typeof model?.["collectableImage"] === "string"
            ? model["collectableImage"] as string
            : null;
        const mediaUrl = mediaPath ? `https://assets.awwwards.com/awards/${mediaPath}` : null;
        const mediaStaticUrl = mediaPath ? (mediaPath.startsWith("http") ? mediaPath : `https://assets.awwwards.com/awards/${mediaPath.replace(/\.mp4(\?.*)?$/, "_static.jpeg")}`) : null;
        const websiteLink = card.querySelector(".figure-rollover__bt[href^='http']") as HTMLAnchorElement | null;
        const category = card.querySelector(".figure-rollover__row:not(:has(small))")?.textContent?.trim() || null;

        return {
          collection_slug: slug,
          element_slug: elementSlug,
          item_type: itemType,
          item_url: itemUrl,
          title,
          author_username: user?.["username"]?.toString() || null,
          author_name: user?.["displayName"]?.toString() || null,
          website_url: websiteLink?.href || null,
          media_url: mediaUrl,
          media_static_url: mediaStaticUrl,
          tags_json: JSON.stringify(tags),
          raw_json: model ? JSON.stringify(model) : null,
          category_name: category,
          site_url: itemType === "site" ? itemUrl : null,
        };
      });

      return {
        collection: {
          slug,
          name: collectionTitle,
          url: canonicalUrl,
          category_name: null,
          creator_username: creator_username ?? null,
          creator_name,
          followers_count: null,
          items_count: Number.isFinite(totalGridCount) ? totalGridCount : items.length,
          sites_count: items.filter(item => item.item_type === "site").length,
          inspirations_count: items.filter(item => item.item_type === "inspiration").length,
          raw_json: null,
        },
        items,
      };
    });

  const items = Array.from(new Map(data.items.map(item => [item.item_url, item])).values());
  if (data.items.length !== data.collection.items_count) {
    console.warn(
      `Collection count mismatch: expected ${data.collection.items_count} cards, found ${data.items.length}; continuing with loaded cards.`,
    );
  }
  if (items.length !== data.collection.items_count) {
    console.warn(
      `Collection count mismatch after canonical deduplication: expected ${data.collection.items_count}, found ${items.length}; continuing with unique loaded items.`,
    );
  }
  return { collection: data.collection, items };
};

export const storeCollectionDetailData = async (
  sql: SQL,
  data: { collection: CollectionSummaryData; items: CollectionItemData[] },
): Promise<string> => {
  const storageSlug = await resolveCollectionStorageSlug(sql, data.collection.slug, data.collection.url);
  if (data.collection.creator_username) {
    await insertUser(sql, {
      username: data.collection.creator_username,
      name: data.collection.creator_name || data.collection.creator_username,
      avatar_url: null,
      profile_url: null,
      role: "Creator",
      country: null,
      email: null,
      display_name: data.collection.creator_name || data.collection.creator_username,
      source_url: data.collection.url,
      raw_json: null,
    });
  }

  await insertCollection(sql, {
    slug: storageSlug,
    name: data.collection.name,
    url: data.collection.url,
    is_blocked: false,
    is_valuable: false,
    clone_name_x6: null,
    category_name: data.collection.category_name,
    creator_username: data.collection.creator_username,
    creator_name: data.collection.creator_name,
    followers_count: data.collection.followers_count,
    items_count: data.collection.items_count,
    sites_count: data.collection.sites_count,
    inspirations_count: data.collection.inspirations_count,
    source_url: data.collection.url,
    raw_json: data.collection.raw_json,
  });

  for (const item of data.items) {
    if (item.author_username) {
      await insertUser(sql, {
        username: item.author_username,
        name: item.author_name || item.author_username,
        avatar_url: null,
        profile_url: null,
        role: "Creator",
        country: null,
        email: null,
        display_name: item.author_name || item.author_username,
        source_url: item.website_url || data.collection.url,
        raw_json: item.raw_json,
      });
    }

    await insertCollectionItem(sql, { ...item, collection_slug: storageSlug });
  }
  return storageSlug;
};

export const scrapeTargetUrl = async (
  page: Page,
  sourceUrl: string,
  awardType: "SOTD" | "Nominee",
): Promise<{ kind: "site"; data: ScrapedData } | { kind: "asset"; data: AssetScrapeData } | null> => {
  switch (detectParser(sourceUrl)) {
    case "site": {
      const data = await scrapeDetailPage(page, sourceUrl, awardType);
      return data ? { kind: "site", data } : null;
    }
    case "element": {
      const data = await scrapeInspirationPage(page, sourceUrl);
      return data ? { kind: "asset", data } : null;
    }
    case "collection": {
      const data = await scrapeCollectionPage(page, sourceUrl);
      return data ? { kind: "asset", data } : null;
    }
    case "directory": {
      const data = await scrapeDirectoryPage(page, sourceUrl);
      return data ? { kind: "asset", data } : null;
    }
  }
};

export const storeAssetScrapeData = async (sql: SQL, data: AssetScrapeData): Promise<void> => {
  if (data.meta["kind"] !== "element") {
    throw new Error(`Expected element asset metadata for ${data.sourceUrl}`);
  }
  const source = new URL(data.sourceUrl);
  if (source.hostname !== "www.awwwards.com" || !/^\/inspiration\/[^/?#]+\/?$/.test(source.pathname)) {
    throw new Error(`Expected an /inspiration/ source URL, got ${data.sourceUrl}`);
  }
  const elementSlug = source.pathname.split("/").filter(Boolean).pop() || "";
  if (!elementSlug) throw new Error(`Element asset has no slug: ${data.sourceUrl}`);
  if (data.media.length === 0) {
    throw new Error(`Element asset has no media: ${data.sourceUrl}`);
  }
  {
    await sql.begin(async tx => {
      const authorUsername = typeof data.meta["author"] === "string" ? data.meta["author"] : null;
      const authorName = typeof data.meta["authorName"] === "string" ? data.meta["authorName"] : authorUsername;
      const websiteUrl = typeof data.meta["websiteUrl"] === "string" ? data.meta["websiteUrl"] : null;

      if (authorUsername) {
        await insertUser(tx, {
          username: authorUsername,
          name: authorName || authorUsername,
          avatar_url: null,
          profile_url: null,
          role: "Creator",
          country: null,
          email: null,
          display_name: authorName || authorUsername,
          website_url: websiteUrl,
          source_url: data.sourceUrl,
          raw_json: JSON.stringify(data.meta),
        });
      }

      await insertElementCategory(tx, {
        slug: "inspiration",
        name: "Inspiration",
        post_count: 0,
        should_track: false,
      });

      await insertElement(tx, {
        slug: elementSlug,
        title: typeof data.meta["title"] === "string" ? data.meta["title"] : elementSlug,
        category_slug: "inspiration",
        source_url: data.sourceUrl,
        author_username: authorUsername,
        author_name: authorName || null,
        website_url: websiteUrl,
        media_type: data.media.find(item => item.type === "video")?.type ?? data.media[0]?.type ?? null,
        media_url: data.media.find(item => item.type === "video")?.url ?? data.media[0]?.url ?? null,
        media_static_url: data.media.find(item => item.type === "image")?.url ?? null,
        tags_json: JSON.stringify(data.meta["tags"] ?? []),
        raw_json: JSON.stringify({
          ...data.meta,
          media: data.media,
        }),
      });
    });
  }
};

/**
 * Functional processor that downloads files and inserts items into the database.
 */
export const storeScrapedData = async (sql: SQL, data: ScrapedData): Promise<void> => {
  await sql.begin(async tx => {
    if (data.creator) {
      await insertUser(tx, data.creator);
    }

    await insertSite(tx, data.site);
    await tx`DELETE FROM site_creators WHERE site_slug = ${data.site.slug}`;
    await tx`DELETE FROM site_technologies WHERE site_slug = ${data.site.slug}`;
    await tx`DELETE FROM site_colors WHERE site_slug = ${data.site.slug}`;
    await tx`DELETE FROM site_tags WHERE site_slug = ${data.site.slug}`;
    await tx`DELETE FROM site_media WHERE site_slug = ${data.site.slug}`;
    await tx`DELETE FROM votes WHERE site_slug = ${data.site.slug}`;

    for (const creator of data.creators) {
      await insertUser(tx, {
        username: creator.username,
        name: creator.display_name,
        avatar_url: creator.avatar_url,
        profile_url: creator.profile_url,
        role: creator.is_pro ? "Creator" : null,
        country: creator.country,
        email: null,
        display_name: creator.display_name,
        website_url: creator.profile_url,
        is_pro: creator.is_pro,
        source_url: data.sourceUrl,
        raw_json: creator.raw_json,
      });

      await insertSiteCreator(tx, {
        site_slug: data.site.slug,
        username: creator.username,
        display_name: creator.display_name,
        profile_url: creator.profile_url,
        avatar_url: creator.avatar_url,
        country: creator.country,
        is_pro: creator.is_pro,
        creator_order: creator.creator_order,
        raw_json: creator.raw_json,
      });
    }

    for (const tech of data.technologies) {
      await insertSiteTechnology(tx, {
        site_slug: data.site.slug,
        technology_name: tech,
      });
    }

    for (const color of data.colors) {
      await insertSiteColor(tx, {
        site_slug: data.site.slug,
        hex_code: color,
      });
    }

    for (const tag of data.tags) {
      await insertSiteTag(tx, {
        site_slug: data.site.slug,
        tag_type: tag.tag_type,
        value: tag.value,
        hex_code: tag.hex_code,
        label: tag.label,
        raw_json: tag.raw_json,
      });
    }

    for (const media of data.media) {
      await insertSiteMedia(tx, {
        site_slug: data.site.slug,
        media_type: media.type,
        source_url: media.url,
        preview_url: media.type === "video" ? media.url.replace(/\.mp4(\?.*)?$/, "_static.jpeg") : media.url,
        local_path: null,
      });
    }

    for (const vote of data.votes) {
      const sourceUser = {
        username: vote.voter_username,
        name: vote.voter_name ?? vote.voter_username,
        avatar_url: vote.voter_avatar_url ?? null,
        profile_url: vote.voter_profile_url ?? null,
        role: vote.voter_role,
        country: vote.voter_country ?? null,
        email: null,
        display_name: vote.voter_name ?? vote.voter_username,
        website_url: vote.voter_website_url ?? null,
        source_url: data.sourceUrl,
      } satisfies DbUser;

      await insertUser(tx, {
        ...sourceUser,
      });
      await insertVote(tx, vote);
    }

    console.log(`Stored basic database info for site: ${data.site.slug}`);
  });

  console.log(`Successfully completed storage and download for site: ${data.site.slug}`);
};
