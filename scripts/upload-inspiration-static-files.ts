import type { Browser, Page } from "puppeteer";
import { initDb, deleteInvalidElementData } from "../src/db";
import { launchBrowser } from "../src/scraper";
import { parseConfig } from "../src/args";
import { createX6Logger } from "../src/logger";
import { isSuspiciousUploadTask, loadInspirationRows, mediaFileExtension, parallelMap, parseCli, saveX6File, summarizeInspirationRows, updateInspirationMediaUrls, uploadX6File, uploadTasksForRows, databaseConnectionString, x6ApiKey } from "../src/x6";

type PageMedia = { kind: "image" | "video"; mediaUrl: string; staticUrl: string | null };

const extractPageMedia = async (page: Page, sourceUrl: string): Promise<{ status: number | null; media: PageMedia | null }> => {
  const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const media = await page.evaluate((): PageMedia | null => {
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
      const poster = video instanceof HTMLVideoElement ? video.getAttribute("poster") : video.parentElement?.getAttribute("poster") ?? null;
      const mediaUrl = absolute(videoUrl);
      if (!mediaUrl) return null;
      return { kind: "video", mediaUrl, staticUrl: absolute(poster) };
    }
    const imageUrl = absolute(image ? image.getAttribute("data-src") || image.getAttribute("src") : null);
    return imageUrl ? { kind: "image", mediaUrl: imageUrl, staticUrl: imageUrl } : null;
  });
  return { status: response?.status() ?? null, media };
};

const repairFromChrome = async (sql: Parameters<typeof updateInspirationMediaUrls>[0], browser: Browser, row: { slug: string; source_url: string }): Promise<PageMedia | null> => {
  const page = await browser.newPage();
  try {
    const result = await extractPageMedia(page, row.source_url);
    if (result.status === 404 || result.status === 410) {
      await deleteInvalidElementData(sql, row.slug);
      console.log(`[DELETE] ${row.slug} | HTTP ${result.status}`);
      return null;
    }
    if (result.status != null && result.status >= 400) throw new Error(`Inspiration page returned HTTP ${result.status}`);
    if (!result.media) throw new Error(`Could not find image/video media on ${row.source_url}`);
    await updateInspirationMediaUrls(sql, row.slug, result.media.kind, result.media.mediaUrl, result.media.staticUrl);
    console.log(`[FIXUP] ${row.slug} | media=${result.media.mediaUrl} | static=${result.media.staticUrl ?? "NULL"}`);
    return result.media;
  } finally {
    await page.close();
  }
};

const printSummary = (rows: Awaited<ReturnType<typeof loadInspirationRows>>): void => {
  const summary = summarizeInspirationRows(rows);
  const printExtensions = (label: string, extensions: Map<string, number>): void => {
    const values = Array.from(extensions.entries()).map(([extension, count]) => `${extension}=${count}`).join(", ");
    console.log(`  ${label}: ${values || "none"}`);
  };
  console.log("[x6-files] summary");
  console.log(`  inspirations: ${summary.total}`);
  console.log(`  videos: ${summary.videos}`);
  console.log(`  images: ${summary.images}`);
  console.log(`  average videos per inspiration: ${summary.averageVideosPerInspiration.toFixed(3)}`);
  console.log(`  average images per inspiration: ${summary.averageImagesPerInspiration.toFixed(3)}`);
  printExtensions("video extensions", summary.videoExtensions);
  printExtensions("image extensions", summary.imageExtensions);
};

const main = async (): Promise<void> => {
  const logPath = "/tmp/upload-inspiration-static-files.log";
  const logger = createX6Logger(logPath);
  console.log(`[x6-files] log file: ${logPath}`);
  const cliOptions = parseCli(process.argv.slice(2));
  const { dry, groupedAndOnlyInvalid, concurrency, sendMode } = cliOptions;
  const parsedConfig = parseConfig(process.argv.slice(2));
  const config = parsedConfig.connectUrl || parsedConfig.reuseExisting ? parsedConfig : { ...parsedConfig, reuseExisting: true };
  let browser: Browser | null = null;
  const sql = await initDb(databaseConnectionString());
  try {
    browser = await launchBrowser(config);
    let rows = await loadInspirationRows(sql, { missingFile: true, uploadedFile: false, unsubmitted: false });
    if (!dry) {
      for (const row of rows) {
        if (!row.source_url) continue;
        const rowTasks = uploadTasksForRows([row], sendMode);
        if (!rowTasks.some(isSuspiciousUploadTask)) continue;
        await repairFromChrome(sql, browser, { slug: row.slug, source_url: row.source_url });
      }
      rows = await loadInspirationRows(sql, { missingFile: true, uploadedFile: false, unsubmitted: false });
    }
    const tasks = uploadTasksForRows(rows, sendMode);
    const tasksBySlug = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const current = tasksBySlug.get(task.row.slug) ?? [];
      current.push(task);
      tasksBySlug.set(task.row.slug, current);
    }
    console.log(`[x6-files] ${dry ? "DRY RUN: " : ""}${tasks.length} upload tasks for ${rows.length} inspirations (mode: ${sendMode}), concurrency=${concurrency}`);
    if (dry) {
      if (groupedAndOnlyInvalid) {
        const groups = new Map<string, typeof tasks>();
        for (const task of tasks) {
          if (!isSuspiciousUploadTask(task)) continue;
          const extension = mediaFileExtension(task.url);
          const current = groups.get(extension) ?? [];
          current.push(task);
          groups.set(extension, current);
        }
        for (const [extension, groupedTasks] of groups) {
          console.log(`[DRY invalid group] ${extension}=${groupedTasks.length}`);
          for (const task of groupedTasks) {
            console.log(`  ${task.row.slug} | ${task.row.media_type} | ${task.row.source_url ?? task.row.slug}`);
            console.log(`    ${task.slot === "primary" ? "file 1" : "file 2"}: ${task.url}`);
          }
        }
        printSummary(rows);
        console.log(`[x6-files] log saved to ${logPath}`);
        return;
      }
      for (const row of rows) {
        console.log(`[DRY] ${row.slug} | ${row.media_type} | ${row.source_url ?? row.slug}`);
        for (const task of tasksBySlug.get(row.slug) ?? []) {
          console.log(`  ${task.slot === "primary" ? "file 1" : "file 2"}: ${task.url}`);
        }
      }
      printSummary(rows);
      console.log(`[x6-files] log saved to ${logPath}`);
      return;
    }
    const apiKey = x6ApiKey();
    let completed = 0;
    await parallelMap(tasks, concurrency, async task => {
      let file: Awaited<ReturnType<typeof uploadX6File>>;
      try {
        file = await uploadX6File(apiKey, task.url, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/HTTP 404/.test(message) || !task.row.source_url) {
          console.error(`[x6-files] giving up for now; will retry next run: ${task.url}: ${message}`);
          return null;
        }
        let repairedUrl: string | null = null;
        try {
          const media = await repairFromChrome(sql, browser!, { slug: task.row.slug, source_url: task.row.source_url });
          if (!media) return null;
          repairedUrl = task.slot === "static" ? media.staticUrl : media.mediaUrl;
          if (!repairedUrl) {
            console.error(`[x6-files] Chrome repair did not provide ${task.slot} media; will retry next run: ${task.url}`);
            return null;
          }
          file = await uploadX6File(apiKey, repairedUrl, logger);
        } catch (repairError) {
          const repairMessage = repairError instanceof Error ? repairError.message : String(repairError);
          console.error(`[x6-files] repaired upload failed; will retry next run: ${repairedUrl ?? task.url}: ${repairMessage}`);
          return null;
        }
      }
      await saveX6File(sql, task.row.slug, file, task.slot);
      completed += 1;
      console.log(`progress file/${completed} of ${tasks.length} total -> ${task.row.source_url ?? task.row.slug}`);
      console.log(`  ${task.slot === "primary" ? "file 1" : "file 2"}: ${task.url}`);
      console.log(`  x6 file id: ${file.id}`);
      return file;
    });
    printSummary(rows);
    console.log(`[x6-files] log saved to ${logPath}`);
  } finally {
    if (browser) {
      if (config.connectUrl || config.reuseExisting) browser.disconnect();
      else await browser.close();
    }
    await sql.close();
  }
};

await main();
