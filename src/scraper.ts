import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { SQL } from "bun";
import {
  insertUser,
  insertSite,
  insertSiteTechnology,
  insertSiteColor,
  insertSiteMedia,
  insertVote,
  type DbSite,
  type DbUser,
  type DbVote
} from "./db";
import { downloadMedia } from "./media";
import type { ScraperConfig } from "./args";

// Apply stealth plugin
puppeteer.use(StealthPlugin());

export interface ScrapedData {
  site: DbSite;
  creator: DbUser | null;
  technologies: string[];
  colors: string[];
  media: Array<{ url: string; type: "image" | "video" }>;
  votes: DbVote[];
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

/**
 * functional launcher for Puppeteer
 */
export const launchBrowser = async (config: ScraperConfig): Promise<Browser> => {
  if (config.connectUrl) {
    console.log(`Connecting to existing Chrome via WS: ${config.connectUrl}`);
    return await puppeteer.connect({
      browserWSEndpoint: config.connectUrl,
    }) as unknown as Browser;
  }

  console.log(`Launching Chrome (headless: ${config.headless})...`);
  return await puppeteer.launch({
    headless: config.headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1280,800"
    ],
  }) as unknown as Browser;
};

/**
 * Extracts links of Sites of the Day or Nominees from listing page.
 */
export const fetchListingPageLinks = async (page: Page, url: string): Promise<string[]> => {
  try {
    console.log(`Navigating to listing: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    // Evaluate the page and extract URLs matching awwwards.com/sites/...
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const targetSubPath = "/sites/sub" + "mit";
      return anchors
        .map(a => a.href)
        .filter(href => href && href.includes("/sites/") && !href.includes(targetSubPath) && !href.includes("#"));
    });

    // Deduplicate
    return Array.from(new Set(links));
  } catch (err) {
    console.error(`Error fetching listing links from ${url}:`, err);
    return [];
  }
};

/**
 * Parses all necessary elements from a single detail page of Awwwards.
 */
export const scrapeDetailPage = async (page: Page, awwwardsUrl: string, awardType: "SOTD" | "Nominee"): Promise<ScrapedData | null> => {
  try {
    console.log(`Scraping detail page: ${awwwardsUrl}`);
    await page.goto(awwwardsUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const slug = awwwardsUrl.split("/").filter(Boolean).pop() || "";
    if (!slug) {
      throw new Error(`Could not extract slug from URL: ${awwwardsUrl}`);
    }

    // Evaluate in-browser to parse structure
    const rawData = await page.evaluate((slug, awwwardsUrl) => {
      // 1. Title
      const h1Text = document.querySelector("h1")?.textContent?.trim();
      const heroText = document.querySelector(".heading-large")?.textContent?.trim() ||
        document.querySelector(".header-title")?.textContent?.trim() ||
        document.querySelector(".submission-title")?.textContent?.trim();
      const title = h1Text || heroText || document.title.split("-")[0]?.trim() || "Untitled Site";

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
        description = descEl.tagName === "META"
          ? (descEl as HTMLMetaElement).content?.trim()
          : descEl.textContent?.trim() || null;
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

      // 5. Creator User
      let creatorUsername: string | null = null;
      let creatorName: string | null = null;
      let creatorAvatar: string | null = null;
      let creatorProfile: string | null = null;
      let creatorCountry: string | null = null;

      const byContainer = document.querySelector(".box-by") ||
        document.querySelector(".creator") ||
        document.querySelector(".by") ||
        document.querySelector(".author");

      if (byContainer) {
        const link = byContainer.querySelector("a");
        if (link) {
          creatorProfile = link.href;
          const pathParts = new URL(link.href).pathname.split("/").filter(Boolean);
          creatorUsername = pathParts[pathParts.length - 1] || null;
          creatorName = link.textContent?.trim() || creatorUsername;
        }
        const img = byContainer.querySelector("img");
        if (img) {
          creatorAvatar = img.src;
        }
      }

      if (!creatorUsername) {
        const anchors = Array.from(document.querySelectorAll("a"));
        for (const a of anchors) {
          const href = a.href || "";
          if (href.startsWith("https://www.awwwards.com/") && !href.includes("/websites/") && !href.includes("/sites/") && !href.includes("/collections/") && !href.includes("/directory/")) {
            const pathParts = new URL(href).pathname.split("/").filter(Boolean);
            if (pathParts.length === 1) {
              creatorUsername = pathParts[0] || null;
              creatorProfile = href;
              creatorName = a.textContent?.trim() || creatorUsername || null;
              const parent = a.parentElement;
              if (parent) {
                const img = parent.querySelector("img");
                if (img) creatorAvatar = img.src;
              }
              break;
            }
          }
        }
      }

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
      const colorEls = Array.from(document.querySelectorAll("[class*='color'], [class*='palette'], .hex"));
      colorEls.forEach(el => {
        const text = el.textContent?.trim() || "";
        const matches = text.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}/);
        if (matches && !colorList.includes(matches[0])) {
          colorList.push(matches[0]);
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

      // 10. Media assets (Images and Videos)
      const mediaList: Array<{ url: string; type: "image" | "video" }> = [];

      const images = Array.from(document.querySelectorAll("img"));
      images.forEach(img => {
        const src = img.src;
        if (src && !src.includes("avatar") && !src.includes("logo") && src.startsWith("http")) {
          if (!mediaList.some(m => m.url === src)) {
            mediaList.push({ url: src, type: "image" });
          }
        }
      });

      const videos = Array.from(document.querySelectorAll("video"));
      videos.forEach(v => {
        const src = v.src || v.querySelector("source")?.src;
        if (src && src.startsWith("http")) {
          if (!mediaList.some(m => m.url === src)) {
            mediaList.push({ url: src, type: "video" });
          }
        }
      });

      // 11. Votes (Jury / Community ratings)
      const votesList: Array<{
        voter_username: string;
        voter_name: string;
        voter_role: string | null;
        voter_country: string | null;
        voter_avatar: string | null;
        voter_profile: string | null;
        vote_type: "Jury" | "Community" | "DevJury";
        design_score: string | null;
        usability_score: string | null;
        creativity_score: string | null;
        content_score: string | null;
        overall_score: string | null;
      }> = [];

      const voterEls = Array.from(document.querySelectorAll(".item-user, .voter-item, .box-jury"));
      voterEls.forEach(el => {
        const link = el.querySelector("a");
        if (!link) return;

        const voterProfile = link.href;
        const pathParts = new URL(link.href).pathname.split("/").filter(Boolean);
        const voter_username = pathParts[pathParts.length - 1] || "";
        if (!voter_username) return;

        const voter_name = link.textContent?.trim() || voter_username;
        const voter_avatar = el.querySelector("img")?.src || null;

        const infoText = el.textContent || "";
        const roleMatch = infoText.match(/from\s+([A-Za-z\s]+)/i);
        const voter_country = roleMatch ? (roleMatch[1] || "").trim() || null : null;
        const voter_role = el.querySelector(".profession, .role")?.textContent?.trim() || null;

        const scores = Array.from(el.querySelectorAll(".score, .note, .val"));
        let design_score: string | null = null;
        let usability_score: string | null = null;
        let creativity_score: string | null = null;
        let content_score: string | null = null;
        let overall_score: string | null = null;

        if (scores.length >= 4) {
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
          voter_avatar,
          voter_profile: voterProfile,
          vote_type: "Jury",
          design_score,
          usability_score,
          creativity_score,
          content_score,
          overall_score
        });
      });

      return {
        slug,
        title,
        liveUrl,
        awwwardsUrl,
        description,
        awardType,
        awardDate,
        creatorUsername,
        creatorName,
        creatorAvatar,
        creatorProfile,
        creatorCountry,
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
        mediaList,
        votesList
      };
    }, slug, awwwardsUrl);

    if (!rawData) {
      return null;
    }

    const creator: DbUser | null = rawData.creatorUsername ? {
      username: rawData.creatorUsername,
      name: rawData.creatorName || rawData.creatorUsername,
      avatar_url: sanitizeUrl(rawData.creatorAvatar),
      profile_url: sanitizeUrl(rawData.creatorProfile),
      role: rawData.creatorCountry ? "Creator" : null,
      country: rawData.creatorCountry || null,
      email: null,
    } : null;

    const site: DbSite = {
      slug: rawData.slug,
      title: rawData.title,
      live_url: sanitizeUrl(rawData.liveUrl),
      awwwards_url: rawData.awwwardsUrl,
      description: rawData.description,
      award_type: awardType === "SOTD" ? "SOTD" : "Nominee",
      award_date: rawData.awardDate,
      creator_username: creator ? creator.username : null,
      overall_score: safeParseFloat(rawData.overallScore),
      design_score: safeParseFloat(rawData.designScore),
      usability_score: safeParseFloat(rawData.usabilityScore),
      creativity_score: safeParseFloat(rawData.creativityScore),
      content_score: safeParseFloat(rawData.contentScore),
      dev_overall_score: safeParseFloat(rawData.devOverallScore),
      dev_semantics_score: safeParseFloat(rawData.devSemanticsScore),
      dev_animations_score: safeParseFloat(rawData.devAnimationsScore),
      dev_accessibility_score: safeParseFloat(rawData.devAccessibilityScore),
      dev_wpo_score: safeParseFloat(rawData.devWpoScore),
      dev_responsive_score: safeParseFloat(rawData.devResponsiveScore),
      dev_markup_score: safeParseFloat(rawData.devMarkupScore),
    };

    const colors = Array.from(new Set(rawData.colorList.flatMap(extractHexColors)));

    const votes: DbVote[] = rawData.votesList.map(v => ({
      site_slug: rawData.slug,
      voter_username: v.voter_username,
      voter_role: v.voter_role,
      vote_type: v.vote_type,
      design_score: safeParseFloat(v.design_score),
      usability_score: safeParseFloat(v.usability_score),
      creativity_score: safeParseFloat(v.creativity_score),
      content_score: safeParseFloat(v.content_score),
      overall_score: safeParseFloat(v.overall_score),
    }));

    return {
      site,
      creator,
      technologies: rawData.techList,
      colors,
      media: rawData.mediaList,
      votes,
    };
  } catch (err) {
    console.error(`Error scraping detail page ${awwwardsUrl}:`, err);
    return null;
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

    for (const vote of data.votes) {
      await insertUser(tx, {
        username: vote.voter_username,
        name: vote.voter_username,
        avatar_url: null,
        profile_url: null,
        role: vote.voter_role,
        country: null,
        email: null,
      });
      await insertVote(tx, vote);
    }

    console.log(`Stored basic database info for site: ${data.site.slug}`);
  });

  for (const m of data.media) {
    console.log(`Downloading asset: ${m.url}`);
    const downloadResult = await downloadMedia(m.url, data.site.slug);

    await insertSiteMedia(sql, {
      site_slug: data.site.slug,
      media_type: downloadResult.mediaType,
      source_url: m.url,
      local_path: downloadResult.localPath,
    });
  }

  console.log(`Successfully completed storage and download for site: ${data.site.slug}`);
};
