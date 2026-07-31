import type { Browser, Page } from "puppeteer";
import { initDb, deleteInvalidElementData } from "../src/db";
import { launchBrowser } from "../src/scraper";
import { databaseConnectionString, isObject, parallelMap, parseCli } from "../src/x6";
import { parseConfig } from "../src/args";

type InspirationRepairRow = {
  slug: string;
  source_url: string;
  media_type: "image" | "video";
  media_url: string | null;
  media_static_url: string | null;
  raw_json: string | null;
};

type PageMedia = {
  kind: "image" | "video" | "unknown";
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
};

type RepairResult =
  | { kind: "deleted"; row: InspirationRepairRow; reason: string }
  | { kind: "repaired"; row: InspirationRepairRow; media: PageMedia; mediaUrl: string | null; staticUrl: string | null }
  | { kind: "unchanged"; row: InspirationRepairRow; reason: string }
  | { kind: "failed"; row: InspirationRepairRow; error: string };

const mimeExtension = (contentType: string): string | null => {
  const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const extensions: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
  };
  return extensions[mime] ?? null;
};

const extensionFix = (url: string, extension: string): string => {
  const parsed = new URL(url);
  parsed.pathname = /\.[^/]*$/.test(parsed.pathname)
    ? parsed.pathname.replace(/\.[^/]*$/, `.${extension}`)
    : `${parsed.pathname}.${extension}`;
  return parsed.href;
};

const bytesExtension = (bytes: Uint8Array): string | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)).startsWith("GIF8")) return "gif";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 12)).startsWith("RIFF") && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "webp";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 12)).includes("ftypavif")) return "avif";
  return null;
};

const detectMediaExtension = async (url: string): Promise<string | null> => {
  const head = await fetch(url, { method: "HEAD" });
  if (head.ok) {
    const headerExtension = mimeExtension(head.headers.get("content-type") ?? "");
    if (headerExtension) return headerExtension;
  }
  const get = await fetch(url, { method: "GET" });
  if (!get.ok) return null;
  const contentType = get.headers.get("content-type") ?? "";
  const headerExtension = mimeExtension(contentType);
  const bytes = new Uint8Array(await get.arrayBuffer());
  return headerExtension ?? bytesExtension(bytes);
};

const inspectPage = async (page: Page, sourceUrl: string): Promise<{ status: number | null; media: PageMedia }> => {
  const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const media = await page.evaluate((): PageMedia => {
    const video = document.querySelector(".gallery-element__content video, .gallery-element__content video source") as HTMLVideoElement | HTMLSourceElement | null;
    const image = document.querySelector(".gallery-element__content img") as HTMLImageElement | null;
    const absolute = (value: string | null): string | null => {
      if (!value) return null;
      try { return new URL(value, location.href).href; } catch { return null; }
    };
    if (video) {
      const videoUrl = video instanceof HTMLSourceElement
        ? video.getAttribute("data-src") || video.getAttribute("src")
        : video.querySelector("source")?.getAttribute("data-src") || video.querySelector("source")?.getAttribute("src") || video.getAttribute("data-src") || video.getAttribute("src");
      return {
        kind: "video",
        imageUrl: null,
        videoUrl: absolute(videoUrl),
        posterUrl: absolute(video instanceof HTMLVideoElement ? video.getAttribute("poster") : video.parentElement?.getAttribute("poster") ?? null),
      };
    }
    return { kind: image ? "image" : "unknown", imageUrl: absolute(image ? image.getAttribute("data-src") || image.getAttribute("src") : null), videoUrl: null, posterUrl: null };
  });
  return { status: response?.status() ?? null, media };
};

const repairRow = async (page: Page, row: InspirationRepairRow): Promise<RepairResult> => {
  try {
    const inspected = await inspectPage(page, row.source_url);
    if (inspected.status === 404 || inspected.status === 410) return { kind: "deleted", row, reason: `HTTP ${inspected.status}` };
    if (inspected.status != null && inspected.status >= 400) return { kind: "failed", row, error: `HTTP ${inspected.status}` };
    if (inspected.media.kind === "unknown") return { kind: "failed", row, error: "page has no image or video media" };

    let mediaUrl = inspected.media.kind === "video" ? inspected.media.videoUrl : inspected.media.imageUrl;
    let staticUrl = inspected.media.kind === "video" ? inspected.media.posterUrl : inspected.media.imageUrl;
    if (inspected.media.kind === "image" && staticUrl) {
      const extension = await detectMediaExtension(staticUrl);
      if (extension) staticUrl = extensionFix(staticUrl, extension);
      mediaUrl = staticUrl;
    }
    if (!mediaUrl) return { kind: "failed", row, error: "page media has no usable URL" };
    if (inspected.media.kind === "video" && !staticUrl) return { kind: "failed", row, error: "video has no poster URL" };

    return { kind: "repaired", row, media: inspected.media, mediaUrl, staticUrl };
  } catch (error) {
    return { kind: "failed", row, error: error instanceof Error ? error.message : String(error) };
  }
};

const main = async (): Promise<void> => {
  const cli = parseCli(process.argv.slice(2));
  const parsedConfig = parseConfig(process.argv.slice(2));
  const config = parsedConfig.connectUrl || parsedConfig.reuseExisting
    ? parsedConfig
    : { ...parsedConfig, reuseExisting: true };
  const sql = await initDb(databaseConnectionString());
  let browser: Browser | null = null;
  try {
    const rows = await sql`
      SELECT slug, source_url, media_type, media_url, media_static_url, raw_json
      FROM elements
      WHERE source_url ~* '^https://www\\.awwwards\\.com/inspiration/[^/?#]+/?$'
        AND media_type IN ('image', 'video')
        AND (
          (
            media_type = 'image'
            AND (
              media_static_url ILIKE '%blank_static%'
              OR media_static_url !~* '^https?://'
              OR media_static_url !~* '\\.(jpg|jpeg|png|gif|webp|avif|svg)(\\?.*)?$'
            )
          )
          OR (
            media_type = 'video'
            AND (
              media_url ILIKE '%blank_static%'
              OR media_static_url ILIKE '%blank_static%'
              OR media_url !~* '^https?://'
              OR media_static_url !~* '^https?://'
              OR media_url !~* '\\.(mp4|m4v|webm|mov|ogg)(\\?.*)?$'
              OR media_static_url !~* '\\.(jpg|jpeg|png|gif|webp|avif|svg)(\\?.*)?$'
            )
          )
        )
      ORDER BY slug
    ` as InspirationRepairRow[];
    console.log(`[repair-media] ${cli.dry ? "DRY RUN: " : ""}${rows.length} invalid inspirations, concurrency=${cli.concurrency}`);
    if (rows.length === 0) return;
    browser = await launchBrowser(config);
    const results = await parallelMap(rows, cli.concurrency, async row => {
      const page = await browser!.newPage();
      try {
        return await repairRow(page, row);
      } finally {
        await page.close();
      }
    });
    for (const result of results) {
      if (result.kind === "deleted") {
        console.log(`[DELETE] ${result.row.slug} | ${result.reason}`);
        if (!cli.dry) await deleteInvalidElementData(sql, result.row.slug);
      } else if (result.kind === "repaired") {
        console.log(`[REPAIR] ${result.row.slug} | ${result.media.kind} | media=${result.mediaUrl} | static=${result.staticUrl}`);
        if (!cli.dry) {
          const parsed = result.row.raw_json ? JSON.parse(result.row.raw_json) : null;
          const raw = isObject(parsed) ? parsed : {};
          raw["media"] = result.media.kind === "video"
            ? [{ url: result.mediaUrl, type: "video" }, { url: result.staticUrl, type: "image" }]
            : [{ url: result.staticUrl, type: "image" }];
          await sql`
            UPDATE elements
            SET media_type = ${result.media.kind},
                media_url = ${result.mediaUrl},
                media_static_url = ${result.staticUrl},
                raw_json = ${JSON.stringify(raw)}
            WHERE slug = ${result.row.slug}
          `;
        }
      } else if (result.kind === "failed") {
        console.warn(`[FAILED] ${result.row.slug} | ${result.error}`);
      }
    }
  } finally {
    if (browser) {
      if (config.connectUrl || config.reuseExisting) browser.disconnect();
      else await browser.close();
    }
    await sql.close();
  }
};

await main();
