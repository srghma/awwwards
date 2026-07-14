import { mkdir } from "node:fs/promises";
import { join, extname } from "node:path";

export interface DownloadResult {
  localPath: string;
  mediaType: "image" | "video";
  success: boolean;
}

const IMAGES_DIR = join("data", "media", "images");
const VIDEOS_DIR = join("data", "media", "videos");

/**
 * Functional downloader that fetches a remote asset (or parses base64 data URI)
 * and writes it to the appropriate data directory.
 */
export const downloadMedia = async (sourceUrl: string, siteSlug: string): Promise<DownloadResult> => {
  // Ensure directories exist
  await mkdir(IMAGES_DIR, { recursive: true });
  await mkdir(VIDEOS_DIR, { recursive: true });

  // Handle Base64 Data URIs
  if (sourceUrl.startsWith("data:")) {
    try {
      const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match || !match[1] || !match[2]) {
        return { localPath: sourceUrl, mediaType: "image", success: false };
      }
      const mimeType = match[1];
      const base64Data = match[2];
      const ext = mimeType.split("/")[1] || "png";
      const filename = `${siteSlug}_${Bun.hash(sourceUrl).toString(36)}.${ext}`;
      const localPath = join(IMAGES_DIR, filename);

      const buffer = Buffer.from(base64Data, "base64");
      await Bun.write(localPath, buffer);

      return { localPath, mediaType: "image", success: true };
    } catch (err) {
      console.error(`Failed to parse base64 media for site ${siteSlug}:`, err);
      return { localPath: sourceUrl, mediaType: "image", success: false };
    }
  }

  // Handle standard HTTP/S URLs
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const isVideo = contentType.includes("video") ||
      /\.(mp4|webm|ogg|mov|avi)$/i.test(sourceUrl);

    const mediaType: "image" | "video" = isVideo ? "video" : "image";
    const targetDir = isVideo ? VIDEOS_DIR : IMAGES_DIR;

    // Determine file extension
    let ext = extname(new URL(sourceUrl).pathname);
    if (!ext) {
      ext = isVideo ? ".mp4" : ".png";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
      else if (contentType.includes("gif")) ext = ".gif";
      else if (contentType.includes("webp")) ext = ".webp";
      else if (contentType.includes("svg")) ext = ".svg";
    }

    const hash = Bun.hash(sourceUrl).toString(36);
    const filename = `${siteSlug}_${hash}${ext}`;
    const localPath = join(targetDir, filename);

    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(localPath, arrayBuffer);

    return { localPath, mediaType, success: true };
  } catch (err) {
    console.error(`Failed to download media from ${sourceUrl} for site ${siteSlug}:`, err);
    // Return a safe fallback (original URL) with "image" type
    return { localPath: sourceUrl, mediaType: "image", success: false };
  }
};
