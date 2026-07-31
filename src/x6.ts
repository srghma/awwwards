import { SQL } from "bun";
import { deleteInvalidElementData } from "./db";
import type { X6Logger } from "./logger";
import { launchBrowser } from "./scraper";
import {
  isObject,
  assertIsObject,
  unknown_to_object_orThrow,
  unknown_to_string_orThrow,
  unknown_to_nonEmptyString_orThrow,
  unknown_to_nullableString_orThrow,
  unknown_to_number_orThrow,
  unknown_to_nullableNumber_orThrow,
  unknown_to_nullableNonNegativeInteger_orThrow,
  unknown_to_mediaType_orThrow,
  unknown_to_stringArray_orThrow,
  unknown_to_nullableDate_orThrow,
  cleanMeta,
} from "./assertions";

export * from "./assertions";

const UPLOAD_URL = "https://api.x6sense.com/api/file/upload";
const CONTENT_URL = "https://api.x6sense.com/api/case";
const MODERATION_CONTENT_URL = "https://api.x6sense.com/api/moderation/content";

export const isColorSupported = (): boolean => {
  if (process.env["NO_COLOR"] != null) return false;
  if (process.env["FORCE_COLOR"] != null && process.env["FORCE_COLOR"] !== "0") return true;
  return Boolean(process.stdout.isTTY);
};

export const colors = {
  cyan: (str: string): string => isColorSupported() ? `\x1b[36m${str}\x1b[0m` : str,
  green: (str: string): string => isColorSupported() ? `\x1b[32m${str}\x1b[0m` : str,
  yellow: (str: string): string => isColorSupported() ? `\x1b[33m${str}\x1b[0m` : str,
  dim: (str: string): string => isColorSupported() ? `\x1b[2m${str}\x1b[0m` : str,
  bold: (str: string): string => isColorSupported() ? `\x1b[1m${str}\x1b[0m` : str,
  red: (str: string): string => isColorSupported() ? `\x1b[31m${str}\x1b[0m` : str,
  magenta: (str: string): string => isColorSupported() ? `\x1b[35m${str}\x1b[0m` : str,
};

export type X6FileResponse = {
  id: string;
  url: string | null;
  webpUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  mimetype: string | null;
  extension: string | null;
  size: number | null;
  filename: string | null;
  thumbnail: string | null;
  rawJson: string;
};

export type X6ContentResponse = {
  id: string;
  slug: string | null;
  sourceUrl: string | null;
  status: string | null;
  rawJson: string;
};

export type X6ContentListingItem = X6ContentResponse;

export type X6CaseSectionBlock = {
  type: "TEXT" | "IMAGE" | "VIDEO";
  order: number;
  content?: Record<string, unknown>;
  fileId?: string;
};

export type X6CaseSection = {
  order: number;
  blocks: X6CaseSectionBlock[];
};

export type SubmitX6ContentInput = {
  contentId?: string;
  title?: string;
  slug?: string;
  previewId?: string;
  sourceUrl: string;
  parser: string;
  tags?: string[];
  categories?: string[];
  meta?: Record<string, unknown>;
  sections?: X6CaseSection[];
  fileIds?: string[];
  type?: "image" | "video" | "mixed";
};

export type InspirationRow = {
  slug: string;
  title: string;
  source_url: string | null;
  media_type: "image" | "video" | null;
  media_url: string | null;
  media_static_url: string | null;
  author_username: string | null;
  author_name: string | null;
  website_url: string | null;
  tags_json: string | null;
  raw_json: string | null;
  site_slug: string | null;
  site_title: string | null;
  site_description: string | null;
  site_creator_username: string | null;
  site_creator_name: string | null;
  site_live_url: string | null;
  site_award_type: string | null;
  site_award_date: string | null;
  site_sotd_vote_count: number;
  site_developer_vote_count: number;
  site_sotd_vote_average: number | null;
  site_developer_vote_average: number | null;
  site_overall_score: number | null;
  site_design_score: number | null;
  site_usability_score: number | null;
  site_creativity_score: number | null;
  site_content_score: number | null;
  site_dev_overall_score: number | null;
  site_dev_semantics_score: number | null;
  site_dev_animations_score: number | null;
  site_dev_accessibility_score: number | null;
  site_dev_wpo_score: number | null;
  site_dev_responsive_score: number | null;
  site_dev_markup_score: number | null;
  site_creator_names: string[];
  site_technologies: string[];
  site_colors: string[];
  site_tags: string[];
  x6_file_id: string | null;
  x6_static_file_id: string | null;
  x6_case_id: string | null;
  x6_case_slug: string | null;
  x6_post_id: string | null;
  x6_post_status: string | null;
  x6_post_deleted_at: string | null;
  checked_source_url_at: string | null;
};

export type X6FileSlot = "primary" | "static";

export type X6UploadTask = {
  row: InspirationRow;
  slot: X6FileSlot;
  url: string;
};

export const hasAllX6FileIds = (row: InspirationRow): boolean =>
  Boolean(row.x6_file_id) && (row.media_type !== "video" || Boolean(row.x6_static_file_id));

export type X6InspirationSummary = {
  total: number;
  videos: number;
  images: number;
  averageVideosPerInspiration: number;
  averageImagesPerInspiration: number;
  videoExtensions: Map<string, number>;
  imageExtensions: Map<string, number>;
};

const nonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

export const mediaFileExtension = (url: string): string => {
  try {
    const filename = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    return extension && extension !== filename.toLowerCase() ? extension : "(none)";
  } catch {
    return "(invalid-url)";
  }
};

export const isSuspiciousUploadTask = (task: X6UploadTask): boolean => {
  const extension = mediaFileExtension(task.url);
  if (extension === "(invalid-url)" || extension === "(none)") return true;
  const validExtensions = task.slot === "static"
    ? new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"])
    : task.row.media_type === "video"
      ? new Set(["mp4", "m4v", "webm", "mov", "ogg"])
      : new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]);
  return !validExtensions.has(extension);
};

export const summarizeInspirationRows = (rows: InspirationRow[]): X6InspirationSummary => {
  const videoExtensions = new Map<string, number>();
  const imageExtensions = new Map<string, number>();
  for (const row of rows) {
    const mediaUrl = row.media_type === "video" ? row.media_url : row.media_static_url;
    if (!mediaUrl) continue;
    const extensions = row.media_type === "video" ? videoExtensions : imageExtensions;
    const extension = mediaFileExtension(mediaUrl);
    extensions.set(extension, (extensions.get(extension) ?? 0) + 1);
  }
  const videos = rows.filter(row => row.media_type === "video").length;
  const images = rows.filter(row => row.media_type === "image").length;
  return {
    total: rows.length,
    videos,
    images,
    averageVideosPerInspiration: rows.length === 0 ? 0 : videos / rows.length,
    averageImagesPerInspiration: rows.length === 0 ? 0 : images / rows.length,
    videoExtensions,
    imageExtensions,
  };
};

export type SendMode = "send_both_videos_and_fallack_images" | "send_only_video_or_fallack_send_only_image";

export const uploadTasksForRows = (
  rows: InspirationRow[],
  sendMode: SendMode = "send_only_video_or_fallack_send_only_image",
): X6UploadTask[] => rows.flatMap(row => {
  if (sendMode === "send_only_video_or_fallack_send_only_image") {
    if (row.media_type === "video") {
      return !row.x6_file_id && row.media_url
        ? [{ row, slot: "primary" as const, url: row.media_url }]
        : [];
    }
    if (row.media_type === "image") {
      return !row.x6_file_id && row.media_static_url
        ? [{ row, slot: "primary" as const, url: row.media_static_url }]
        : [];
    }
    return [];
  }

  if (row.media_type === "image") {
    return !row.x6_file_id && row.media_static_url
      ? [{ row, slot: "primary" as const, url: row.media_static_url }]
      : [];
  }
  if (row.media_type === "video") {
    const tasks: X6UploadTask[] = [];
    if (!row.x6_file_id && row.media_url) tasks.push({ row, slot: "primary", url: row.media_url });
    if (!row.x6_static_file_id && row.media_static_url) tasks.push({ row, slot: "static", url: row.media_static_url });
    return tasks;
  }
  return [];
});

export const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
};

export const buildLexicalTextContent = (paragraphs: string[], heading?: string): Record<string, unknown> => {
  const children: Array<Record<string, unknown>> = [];
  if (heading && heading.trim()) {
    children.push({
      tag: "h1",
      type: "heading",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: [
        {
          mode: "normal",
          text: decodeHtmlEntities(heading.trim()),
          type: "text",
          style: "",
          detail: 0,
          format: 0,
          version: 1,
        },
      ],
    });
  }
  for (const para of paragraphs) {
    if (!para || !para.trim()) continue;
    children.push({
      type: "paragraph",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      textStyle: "",
      textFormat: 0,
      children: [
        {
          mode: "normal",
          text: decodeHtmlEntities(para.trim()),
          type: "text",
          style: "",
          detail: 0,
          format: 0,
          version: 1,
        },
      ],
    });
  }
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children,
    },
  };
};

const responseJson = async (response: Response, operation: string): Promise<unknown> => {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`X6 ${operation} returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`X6 ${operation} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return body;
};

export const unknown_to_fileResponse_orThrow = (body: unknown): X6FileResponse => {
  let record: Record<string, unknown>;
  if (Array.isArray(body)) {
    if (body.length !== 1) {
      throw new Error("X6 upload response array must contain exactly one object");
    }
    assertIsObject(body[0], "X6 upload response array item must be an object");
    record = body[0];
  } else {
    assertIsObject(body, "X6 upload response must be an object");
    record = body;
  }

  const rawId = record["id"] ?? record["_id"];
  return {
    id: unknown_to_nonEmptyString_orThrow(rawId, "id or _id"),
    url: unknown_to_nullableString_orThrow(record["url"], "url"),
    webpUrl: unknown_to_nullableString_orThrow(record["webpUrl"], "webpUrl"),
    width: unknown_to_nullableNonNegativeInteger_orThrow(record["width"], "width"),
    height: unknown_to_nullableNonNegativeInteger_orThrow(record["height"], "height"),
    createdAt: unknown_to_nullableString_orThrow(record["createdAt"], "createdAt"),
    updatedAt: unknown_to_nullableString_orThrow(record["updatedAt"], "updatedAt"),
    mimetype: unknown_to_nullableString_orThrow(record["mimetype"], "mimetype"),
    extension: unknown_to_nullableString_orThrow(record["extension"], "extension"),
    size: unknown_to_nullableNonNegativeInteger_orThrow(record["size"], "size"),
    filename: unknown_to_nullableString_orThrow(record["filename"], "filename"),
    thumbnail: unknown_to_nullableString_orThrow(record["thumbnail"], "thumbnail"),
    rawJson: JSON.stringify(body),
  };
};

export const parseFileResponse = unknown_to_fileResponse_orThrow;

export const unknown_to_contentResponse_orThrow = (body: unknown): X6ContentResponse => {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      throw new Error(`X6 response array has no content record: ${JSON.stringify(body)}`);
    }
    return unknown_to_contentResponse_orThrow(body[0]);
  }

  assertIsObject(body, `X6 response must be an object: ${JSON.stringify(body)}`);
  const rawRecord = body;

  let record: Record<string, unknown> = rawRecord;
  for (const key of ["content", "data", "result", "item", "case"]) {
    const candidate = rawRecord[key];
    if (isObject(candidate)) {
      record = candidate;
      break;
    }
    if (Array.isArray(candidate) && candidate.length > 0 && isObject(candidate[0])) {
      record = candidate[0];
      break;
    }
  }

  const rawId = record["id"] ?? record["_id"] ?? record["contentId"] ?? record["slug"];
  const rawSlug = record["slug"] ?? rawRecord["slug"];
  const rawSourceUrl = record["sourceUrl"] ?? record["source_url"] ?? rawRecord["sourceUrl"];
  const rawStatus = record["status"] ?? record["state"] ?? record["moderationStatus"] ?? rawRecord["status"];

  return {
    id: unknown_to_nonEmptyString_orThrow(rawId, `id or slug in ${JSON.stringify(body)}`),
    slug: unknown_to_nullableString_orThrow(rawSlug, "slug"),
    sourceUrl: unknown_to_nullableString_orThrow(rawSourceUrl, "sourceUrl"),
    status: unknown_to_nullableString_orThrow(rawStatus, "status") ?? "submitted",
    rawJson: JSON.stringify(body),
  };
};

export const x6ApiKey = (): string => {
  const apiKey = process.env["X6_API_KEY"];
  if (!apiKey) {
    throw new Error("X6 API key is not set (expected X6_API_KEY)");
  }
  return apiKey;
};

export const uploadX6File = async (apiKey: string, sourceUrl: string, logger: X6Logger): Promise<X6FileResponse> => {
  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok) throw new Error(`Static media download failed with HTTP ${sourceResponse.status}: ${sourceUrl}`);
  const blob = await sourceResponse.blob();
  const filename = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() || "inspiration-media";
  const maxRetries = 10;
  const maxAttempts = maxRetries + 1;
  const baseDelayMs = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    const reqBodySummary = { filename, uploadSource: "awwwards-inspiration", sourceMediaUrl: sourceUrl, sizeBytes: blob.size };
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("uploadSource", "awwwards-inspiration");
      response = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey },
        body: form,
      });
    } catch (error) {
      logger.logApiCall({
        operation: `uploadX6File (attempt ${attempt}/${maxAttempts})`,
        method: "POST",
        url: UPLOAD_URL,
        headers: { "x-api-key": apiKey },
        requestBody: reqBodySummary,
        error,
      });
      if (attempt === maxAttempts) throw error;
      const delayMs = baseDelayMs * (1 + 0.5 * (attempt - 1));
      console.warn(`[x6-files] upload attempt ${attempt}/${maxRetries} failed for ${sourceUrl}; retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    const text = await response.text();
    logger.logApiCall({
      operation: `uploadX6File (attempt ${attempt}/${maxAttempts})`,
      method: "POST",
      url: UPLOAD_URL,
      headers: { "x-api-key": apiKey },
      requestBody: reqBodySummary,
      status: response.status,
      responseBody: text,
    });

    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`X6 file upload returned invalid JSON (HTTP ${response.status})`);
    }
    if (response.ok) return parseFileResponse(body);

    const error = new Error(`X6 file upload failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
    if (response.status < 500 || attempt === maxAttempts) throw error;
    const delayMs = baseDelayMs * (1 + 0.5 * (attempt - 1));
    console.warn(`[x6-files] upload attempt ${attempt}/${maxRetries} failed for ${sourceUrl}; retrying in ${delayMs}ms: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error(`X6 file upload exhausted retries: ${sourceUrl}`);
};

const fetchWithRetry = async (url: string, init: RequestInit, logger: X6Logger, maxRetries = 5): Promise<Response> => {
  const baseDelayMs = 1000;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const text = await response.clone().text();
      logger.logApiCall({
        operation: `submitX6Content (attempt ${attempt}/${maxRetries + 1})`,
        method: init.method ?? "GET",
        url,
        headers: (init.headers as Record<string, string>) ?? undefined,
        requestBody: init.body,
        status: response.status,
        responseBody: text,
      });

      if (response.status >= 500 && attempt <= maxRetries) {
        const delayMs = baseDelayMs * Math.pow(1.5, attempt - 1);
        console.warn(`[x6-retry] ${init.method ?? "GET"} ${url} returned HTTP ${response.status}; attempt ${attempt}/${maxRetries}, retrying in ${Math.round(delayMs)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      return response;
    } catch (error) {
      logger.logApiCall({
        operation: `submitX6Content (attempt ${attempt}/${maxRetries + 1})`,
        method: init.method ?? "GET",
        url,
        headers: (init.headers as Record<string, string>) ?? undefined,
        requestBody: init.body,
        error,
      });
      if (attempt > maxRetries) throw error;
      const delayMs = baseDelayMs * Math.pow(1.5, attempt - 1);
      console.warn(`[x6-retry] ${init.method ?? "GET"} ${url} network error; attempt ${attempt}/${maxRetries}, retrying in ${Math.round(delayMs)}ms: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return fetch(url, init);
};

export const getX6Content = async (apiKey: string): Promise<X6ContentListingItem[]> => {
  try {
    const response = await fetch(CONTENT_URL, { headers: { "x-api-key": apiKey } });
    if (!response.ok) return [];
    const body = await responseJson(response, "content listing");

    let candidates: unknown = body;
    if (isObject(body)) {
      candidates = body["data"] ?? body["items"] ?? body["cases"] ?? body;
      if (isObject(candidates)) {
        candidates = candidates["data"] ?? candidates["items"] ?? candidates["cases"];
      }
    }

    if (!Array.isArray(candidates)) return [];

    return candidates
      .map((item) => {
        try {
          return unknown_to_contentResponse_orThrow(item);
        } catch {
          return null;
        }
      })
      .filter((item): item is X6ContentListingItem => item !== null);
  } catch {
    return [];
  }
};

export const submitX6Content = async (
  apiKey: string,
  input: SubmitX6ContentInput,
  logger: X6Logger,
): Promise<X6ContentResponse> => {
  const previewId = input.previewId ?? input.fileIds?.[input.fileIds.length - 1] ?? input.fileIds?.[0];

  const sections: X6CaseSection[] = input.sections ?? (
    input.type === "video"
      ? [
          {
            order: 1,
            blocks: [
              ...(input.fileIds?.[0] ? [{ type: "VIDEO" as const, order: 1, fileId: input.fileIds[0] }] : []),
            ],
          },
        ]
      : [
          {
            order: 1,
            blocks: [
              ...(input.fileIds?.[0] ? [{ type: "IMAGE" as const, order: 1, fileId: input.fileIds[0] }] : []),
            ],
          },
        ]
  );

  const tags = input.tags
    ? Array.from(new Set(input.tags.map(t => t.trim()).filter(Boolean)))
    : undefined;

  const categories = input.categories
    ? Array.from(new Set(input.categories.map(c => c.trim()).filter(Boolean)))
    : undefined;

  const originalSlug = input.slug ? input.slug.trim() : undefined;
  const prefisedSlug = originalSlug && !originalSlug.startsWith("awwwards-") ? `awwwards-${originalSlug}` : undefined;

  const rawMeta = input.meta ? cleanMeta(input.meta) : undefined;
  const meta = rawMeta && Object.keys(rawMeta).length > 0 ? rawMeta : undefined;

  const buildPayload = (targetSlug?: string) => ({
    sourceUrl: input.sourceUrl,
    parser: input.parser,
    ...(input.title ? { title: input.title } : {}),
    ...(targetSlug ? { slug: targetSlug } : {}),
    ...(previewId ? { previewId } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(categories && categories.length > 0 ? { categories } : {}),
    ...(meta ? { meta } : {}),
    sections,
  });

  let payload = buildPayload(originalSlug);
  let response = await fetchWithRetry(CONTENT_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  }, logger);

  if (!response.ok && originalSlug && prefisedSlug) {
    const text = await response.clone().text();
    if (text.includes("Slug is not available")) {
      payload = buildPayload(prefisedSlug);
      response = await fetchWithRetry(CONTENT_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }, logger);
    }
  }

  if (!response.ok) {
    const text = await response.clone().text();
    if (text.includes("Slug is not available")) {
      let targetId = input.contentId;
      if (!targetId) {
        const existingCases = await getX6Content(apiKey);
        const match = existingCases.find(c => c.slug === originalSlug || c.slug === prefisedSlug || c.slug === input.slug);
        if (match) targetId = match.id;
      }

      if (targetId) {
        response = await fetchWithRetry(`${CONTENT_URL}/${targetId}`, {
          method: "PATCH",
          headers: {
            "x-api-key": apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(buildPayload(undefined)),
        }, logger);
      } else {
        response = await fetchWithRetry(CONTENT_URL, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(buildPayload(undefined)),
        }, logger);
      }
    }
  }

  return unknown_to_contentResponse_orThrow(await responseJson(response, "case submission"));
};

export const databaseConnectionString = (): string => {
  return process.env["DATABASE_URL"] ?? (() => {
    const pgUser = process.env["PGUSER"] ?? (() => { throw new Error("PGUSER is not set") })();
    const pgPort = process.env["PGPORT"] ?? (() => { throw new Error("PGPORT is not set") })();
    return `postgresql://${pgUser}@127.0.0.1:${pgPort}/awwwards`
  })();
};

export const parseInspirationRow = (row: Record<string, unknown>): InspirationRow => ({
  slug: unknown_to_nonEmptyString_orThrow(row["slug"], "inspiration.slug"),
  title: unknown_to_string_orThrow(row["title"] ?? "", "inspiration.title"),
  source_url: unknown_to_nullableString_orThrow(row["source_url"], "inspiration.source_url"),
  media_type: unknown_to_mediaType_orThrow(row["media_type"], "inspiration.media_type"),
  media_url: unknown_to_nullableString_orThrow(row["media_url"], "inspiration.media_url"),
  media_static_url: unknown_to_nullableString_orThrow(row["media_static_url"], "inspiration.media_static_url"),
  author_username: unknown_to_nullableString_orThrow(row["author_username"], "inspiration.author_username"),
  author_name: unknown_to_nullableString_orThrow(row["author_name"], "inspiration.author_name"),
  website_url: unknown_to_nullableString_orThrow(row["website_url"], "inspiration.website_url"),
  tags_json: unknown_to_nullableString_orThrow(row["tags_json"], "inspiration.tags_json"),
  raw_json: unknown_to_nullableString_orThrow(row["raw_json"], "inspiration.raw_json"),
  site_slug: unknown_to_nullableString_orThrow(row["site_slug"], "inspiration.site_slug"),
  site_title: unknown_to_nullableString_orThrow(row["site_title"], "inspiration.site_title"),
  site_description: unknown_to_nullableString_orThrow(row["site_description"], "inspiration.site_description"),
  site_creator_username: unknown_to_nullableString_orThrow(row["site_creator_username"], "inspiration.site_creator_username"),
  site_creator_name: unknown_to_nullableString_orThrow(row["site_creator_name"], "inspiration.site_creator_name"),
  site_live_url: unknown_to_nullableString_orThrow(row["site_live_url"], "inspiration.site_live_url"),
  site_award_type: unknown_to_nullableString_orThrow(row["site_award_type"], "inspiration.site_award_type"),
  site_award_date: unknown_to_nullableString_orThrow(row["site_award_date"], "inspiration.site_award_date"),
  site_sotd_vote_count: unknown_to_number_orThrow(row["site_sotd_vote_count"] ?? 0, "inspiration.site_sotd_vote_count"),
  site_developer_vote_count: unknown_to_number_orThrow(row["site_developer_vote_count"] ?? 0, "inspiration.site_developer_vote_count"),
  site_sotd_vote_average: unknown_to_nullableNumber_orThrow(row["site_sotd_vote_average"], "inspiration.site_sotd_vote_average"),
  site_developer_vote_average: unknown_to_nullableNumber_orThrow(row["site_developer_vote_average"], "inspiration.site_developer_vote_average"),
  site_overall_score: unknown_to_nullableNumber_orThrow(row["site_overall_score"], "inspiration.site_overall_score"),
  site_design_score: unknown_to_nullableNumber_orThrow(row["site_design_score"], "inspiration.site_design_score"),
  site_usability_score: unknown_to_nullableNumber_orThrow(row["site_usability_score"], "inspiration.site_usability_score"),
  site_creativity_score: unknown_to_nullableNumber_orThrow(row["site_creativity_score"], "inspiration.site_creativity_score"),
  site_content_score: unknown_to_nullableNumber_orThrow(row["site_content_score"], "inspiration.site_content_score"),
  site_dev_overall_score: unknown_to_nullableNumber_orThrow(row["site_dev_overall_score"], "inspiration.site_dev_overall_score"),
  site_dev_semantics_score: unknown_to_nullableNumber_orThrow(row["site_dev_semantics_score"], "inspiration.site_dev_semantics_score"),
  site_dev_animations_score: unknown_to_nullableNumber_orThrow(row["site_dev_animations_score"], "inspiration.site_dev_animations_score"),
  site_dev_accessibility_score: unknown_to_nullableNumber_orThrow(row["site_dev_accessibility_score"], "inspiration.site_dev_accessibility_score"),
  site_dev_wpo_score: unknown_to_nullableNumber_orThrow(row["site_dev_wpo_score"], "inspiration.site_dev_wpo_score"),
  site_dev_responsive_score: unknown_to_nullableNumber_orThrow(row["site_dev_responsive_score"], "inspiration.site_dev_responsive_score"),
  site_dev_markup_score: unknown_to_nullableNumber_orThrow(row["site_dev_markup_score"], "inspiration.site_dev_markup_score"),
  site_creator_names: unknown_to_stringArray_orThrow(row["site_creator_names"], "inspiration.site_creator_names"),
  site_technologies: unknown_to_stringArray_orThrow(row["site_technologies"], "inspiration.site_technologies"),
  site_colors: unknown_to_stringArray_orThrow(row["site_colors"], "inspiration.site_colors"),
  site_tags: unknown_to_stringArray_orThrow(row["site_tags"], "inspiration.site_tags"),
  x6_file_id: unknown_to_nullableString_orThrow(row["x6_file_id"], "inspiration.x6_file_id"),
  x6_static_file_id: unknown_to_nullableString_orThrow(row["x6_static_file_id"], "inspiration.x6_static_file_id"),
  x6_case_id: unknown_to_nullableString_orThrow(row["x6_case_id"], "inspiration.x6_case_id"),
  x6_case_slug: unknown_to_nullableString_orThrow(row["x6_case_slug"], "inspiration.x6_case_slug"),
  x6_post_id: unknown_to_nullableString_orThrow(row["x6_post_id"], "inspiration.x6_post_id"),
  x6_post_status: unknown_to_nullableString_orThrow(row["x6_post_status"], "inspiration.x6_post_status"),
  x6_post_deleted_at: unknown_to_nullableString_orThrow(row["x6_post_deleted_at"], "inspiration.x6_post_deleted_at"),
  checked_source_url_at: unknown_to_nullableString_orThrow(row["checked_source_url_at"], "inspiration.checked_source_url_at"),
});

export const loadInspirationRows = async (
  sql: SQL,
  options: { missingFile: boolean; uploadedFile: boolean; unsubmitted: boolean },
): Promise<InspirationRow[]> => {
  const rows = await sql`
    SELECT e.slug, e.title, e.source_url, e.media_type, e.media_url, e.media_static_url,
           e.author_username, e.author_name, e.website_url, e.tags_json, e.raw_json,
           s.slug AS site_slug, s.title AS site_title, s.description AS site_description,
           s.creator_username AS site_creator_username, creator.name AS site_creator_name,
           s.live_url AS site_live_url, s.award_type AS site_award_type, s.award_date AS site_award_date,
           s.overall_score AS site_overall_score, s.design_score AS site_design_score,
           s.usability_score AS site_usability_score, s.creativity_score AS site_creativity_score,
           s.content_score AS site_content_score, s.dev_overall_score AS site_dev_overall_score,
           s.dev_semantics_score AS site_dev_semantics_score, s.dev_animations_score AS site_dev_animations_score,
           s.dev_accessibility_score AS site_dev_accessibility_score, s.dev_wpo_score AS site_dev_wpo_score,
           s.dev_responsive_score AS site_dev_responsive_score, s.dev_markup_score AS site_dev_markup_score,
           COALESCE(ARRAY(SELECT sc.display_name FROM site_creators sc WHERE sc.site_slug = s.slug ORDER BY sc.creator_order), ARRAY[]::text[]) AS site_creator_names,
           COALESCE(ARRAY(SELECT st.technology_name FROM site_technologies st WHERE st.site_slug = s.slug ORDER BY st.technology_name), ARRAY[]::text[]) AS site_technologies,
           COALESCE(ARRAY(SELECT cl.hex_code FROM site_colors cl WHERE cl.site_slug = s.slug ORDER BY cl.hex_code), ARRAY[]::text[]) AS site_colors,
           COALESCE(ARRAY(SELECT st.value FROM site_tags st WHERE st.site_slug = s.slug ORDER BY st.tag_type, st.value), ARRAY[]::text[]) AS site_tags,
           COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.site_slug = s.slug AND v.vote_type IN ('Jury', 'Community')), 0) AS site_sotd_vote_count,
           COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.site_slug = s.slug AND v.vote_type = 'DevJury'), 0) AS site_developer_vote_count,
           (SELECT AVG(v.overall_score)::float FROM votes v WHERE v.site_slug = s.slug AND v.vote_type IN ('Jury', 'Community')) AS site_sotd_vote_average,
           (SELECT AVG(v.overall_score)::float FROM votes v WHERE v.site_slug = s.slug AND v.vote_type = 'DevJury') AS site_developer_vote_average,
           e.x6_file_id, e.x6_static_file_id, e.x6_case_id, e.x6_case_slug,
           e.x6_post_id, e.x6_post_status, e.x6_post_deleted_at, e.checked_source_url_at
    FROM elements e
    LEFT JOIN sites s ON s.live_url = e.website_url
    LEFT JOIN users creator ON creator.username = s.creator_username
    WHERE e.source_url ~* '^https://www\\.awwwards\\.com/inspiration/[^/?#]+/?$'
      AND e.media_type IN ('image', 'video')
      AND NOT EXISTS (
        SELECT 1
        FROM collection_items site_item_guard
        WHERE site_item_guard.element_slug = e.slug
          AND site_item_guard.item_type = 'site'
      )
      AND (
        (e.media_type = 'image' AND NULLIF(BTRIM(e.media_static_url), '') IS NOT NULL)
        OR (e.media_type = 'video' AND NULLIF(BTRIM(e.media_url), '') IS NOT NULL AND NULLIF(BTRIM(e.media_static_url), '') IS NOT NULL)
      )
      AND (
        ${options.missingFile} = false
        OR (e.media_type = 'image' AND NULLIF(BTRIM(e.x6_file_id), '') IS NULL)
        OR (e.media_type = 'video' AND (NULLIF(BTRIM(e.x6_file_id), '') IS NULL OR NULLIF(BTRIM(e.x6_static_file_id), '') IS NULL))
      )
      AND (
        ${options.uploadedFile} = false
        OR (e.media_type = 'image' AND NULLIF(BTRIM(e.x6_file_id), '') IS NOT NULL)
        OR (e.media_type = 'video' AND NULLIF(BTRIM(e.x6_file_id), '') IS NOT NULL AND NULLIF(BTRIM(e.x6_static_file_id), '') IS NOT NULL)
      )
      AND (${options.unsubmitted} = false OR NULLIF(BTRIM(e.x6_post_id), '') IS NULL)
    ORDER BY CASE WHEN s.award_type = 'SOTD' THEN 0 ELSE 1 END, e.slug
  `;

  return rows.map((r: Record<string, unknown>) => parseInspirationRow(unknown_to_object_orThrow(r, "inspiration row")));
};

export const saveX6File = async (sql: SQL, slug: string, file: X6FileResponse, slot: X6FileSlot = "primary"): Promise<void> => {
  const prefix = slot === "static" ? "x6_static_file" : "x6_file";
  await sql.unsafe(`
    UPDATE elements
    SET ${prefix}_id = $1,
        ${prefix}_url = $2,
        ${prefix}_webp_url = $3,
        ${prefix}_width = $4,
        ${prefix}_height = $5,
        ${prefix}_created_at = $6,
        ${prefix}_updated_at = $7,
        ${prefix}_mimetype = $8,
        ${prefix}_extension = $9,
        ${prefix}_size = $10,
        ${prefix}_filename = $11,
        ${prefix}_thumbnail = $12,
        ${prefix}_raw_json = $13
    WHERE slug = $14
  `, [nonEmptyString(file.id), nonEmptyString(file.url), nonEmptyString(file.webpUrl), file.width, file.height, nonEmptyString(file.createdAt), nonEmptyString(file.updatedAt), nonEmptyString(file.mimetype), nonEmptyString(file.extension), file.size, nonEmptyString(file.filename), nonEmptyString(file.thumbnail), file.rawJson, slug]);
};

export const saveX6Post = async (sql: SQL, slug: string, content: X6ContentResponse): Promise<void> => {
  await sql`
    UPDATE elements
    SET x6_post_id = ${nonEmptyString(content.id)},
        x6_post_status = ${nonEmptyString(content.status)}
    WHERE slug = ${slug}
  `;
};

export const markElementUrlChecked = async (sql: SQL, slug: string): Promise<void> => {
  await sql`
    UPDATE elements
    SET checked_source_url_at = now()
    WHERE slug = ${slug}
  `;
};

export const updateInspirationMediaUrls = async (
  sql: SQL,
  slug: string,
  mediaType: "image" | "video",
  mediaUrl: string,
  mediaStaticUrl: string | null,
): Promise<void> => {
  await sql`
    UPDATE elements
    SET media_type = ${mediaType},
        media_url = ${mediaUrl},
        media_static_url = ${mediaStaticUrl}
    WHERE slug = ${slug}
  `;
};

export const parallelMap = async <T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, worker));
  return results;
};

export type CollectionSubmitMode =
  | "just_upload_db_into_x6"
  | "visit_awwwards_website__scrape_new_collections_and_their_sites_inspirations_if_new_added_and_then_upload_db_into_x6";

export type X6CliOptions = {
  dry: boolean;
  dryRun: boolean;
  noBrowserCheck: boolean;
  groupedAndOnlyInvalid: boolean;
  concurrency: number;
  first: number | null;
  notIgnoreInspirationsWithUuid: boolean;
  sendMode: SendMode;
  connectUrl?: string;
  remoteDebuggingPort?: number;
  all: boolean;
  unsubmittedOnly: boolean;
  mode: CollectionSubmitMode | null;
};

export const parseCli = (args: string[]): X6CliOptions => {
  const dry = args.includes("--dry") || args.includes("--dry-run");
  const dryRun = dry;
  const noBrowserCheck = args.includes("--no-browser-check");
  const groupedAndOnlyInvalid = args.includes("--grouped-and-only-invalid");
  if (groupedAndOnlyInvalid && !dry) throw new Error("--grouped-and-only-invalid requires --dry");
  const concurrencyArg = args.find(arg => arg.startsWith("--concurrency="))?.split("=", 2)[1];
  const concurrency = Math.max(1, Number.parseInt(concurrencyArg ?? process.env["X6_CONCURRENCY"] ?? "8", 10) || 8);
  const firstArg = args.find(arg => arg.startsWith("--first="))?.split("=", 2)[1];
  const first = firstArg == null ? null : Number.parseInt(firstArg, 10);
  if (firstArg != null && (first === null || !Number.isSafeInteger(first) || first < 0)) throw new Error("--first must be a non-negative integer");

  const sendModeArg = args.find(arg => arg.startsWith("--send-mode="))?.split("=", 2)[1];
  let sendMode: SendMode = "send_only_video_or_fallack_send_only_image";
  if (sendModeArg === "send_both_videos_and_fallack_images" || args.includes("--send-both-videos-and-fallback-images")) {
    sendMode = "send_both_videos_and_fallack_images";
  } else if (sendModeArg === "send_only_video_or_fallack_send_only_image") {
    sendMode = "send_only_video_or_fallack_send_only_image";
  }

  const rawMode = args.find(arg => arg.startsWith("--mode="))?.split("=", 2)[1];
  let mode: CollectionSubmitMode | null = null;
  if (rawMode === "visit_awwwards_website__scrape_new_collections_and_their_sites_inspirations_if_new_added_and_then_upload_db_into_x6") {
    mode = "visit_awwwards_website__scrape_new_collections_and_their_sites_inspirations_if_new_added_and_then_upload_db_into_x6";
  } else if (rawMode === "just_upload_db_into_x6") {
    mode = "just_upload_db_into_x6";
  } else if (rawMode != null) {
    throw new Error(`Invalid --mode: '${rawMode}'. Must be 'just_upload_db_into_x6' or 'visit_awwwards_website__scrape_new_collections_and_their_sites_inspirations_if_new_added_and_then_upload_db_into_x6'`);
  }

  const connectArg = args.find(arg => arg.startsWith("--connect="))?.split("=", 2)[1];
  const portArg = args.find(arg => arg.startsWith("--remote-debugging-port="))?.split("=", 2)[1];
  const remoteDebuggingPort = portArg ? Number.parseInt(portArg, 10) : undefined;
  const unsubmittedOnly = args.includes("--unsubmitted-only");

  return {
    dry,
    dryRun,
    noBrowserCheck,
    groupedAndOnlyInvalid,
    concurrency,
    first,
    notIgnoreInspirationsWithUuid: args.includes("--not-ignore-inspirations-with-uuid"),
    sendMode,
    connectUrl: connectArg,
    remoteDebuggingPort,
    all: !unsubmittedOnly,
    unsubmittedOnly,
    mode,
  };
};

export const isRecentDate = (date: Date | string | number | null | undefined, maxAgeDays = 5): boolean => {
  if (!date) return false;
  const timestamp = typeof date === "number"
    ? (date > 1e11 ? date : date * 1000)
    : typeof date === "string"
      ? Date.parse(date)
      : date.getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= maxAgeDays * 24 * 60 * 60 * 1000;
};

export const getInspirationDate = (row: InspirationRow): Date | string | number | null => {
  if (row.checked_source_url_at) return row.checked_source_url_at;
  if (row.raw_json) {
    try {
      const parsed = JSON.parse(row.raw_json) as Record<string, unknown>;
      const createdAt = parsed["createdAt"] ?? (parsed["model"] && isObject(parsed["model"]) ? parsed["model"]["createdAt"] : undefined);
      if (typeof createdAt === "number" || typeof createdAt === "string") return createdAt;
    } catch {}
  }
  return null;
};

export type VerifyInspirationsResult = {
  validRows: InspirationRow[];
  deletedSlugs: Set<string>;
};

export const verifyUncheckedInspirations = async (
  sql: SQL,
  rows: InspirationRow[],
  options: {
    dry: boolean;
    concurrency: number;
    browserConfig: Parameters<typeof launchBrowser>[0];
    maxAgeDays?: number;
  },
): Promise<VerifyInspirationsResult> => {
  const maxAgeDays = options.maxAgeDays ?? 5;
  const deletedSlugs = new Set<string>();

  const recentRows: InspirationRow[] = [];
  const needsCheckRows: InspirationRow[] = [];

  for (const row of rows) {
    const isCheckedRecently = row.checked_source_url_at != null && isRecentDate(row.checked_source_url_at, maxAgeDays);
    const isCreatedRecently = isRecentDate(getInspirationDate(row), maxAgeDays);

    if (isCheckedRecently || isCreatedRecently) {
      recentRows.push(row);
      if (row.checked_source_url_at == null && isCreatedRecently && !options.dry) {
        await markElementUrlChecked(sql, row.slug);
      }
    } else {
      needsCheckRows.push(row);
    }
  }

  if (options.dry || needsCheckRows.length === 0) {
    const validRows = rows.filter(row => row.source_url != null && !deletedSlugs.has(row.slug));
    return { validRows, deletedSlugs };
  }

  const browser = await launchBrowser(options.browserConfig);
  try {
    await parallelMap(needsCheckRows, options.concurrency, async row => {
      if (!row.source_url) return null;
      try {
        const page = await browser.newPage();
        let status: number | null = null;
        try {
          const response = await page.goto(row.source_url, { waitUntil: "domcontentloaded", timeout: 60000 });
          status = response?.status() ?? null;
        } finally {
          await page.close();
        }

        if (status === 404 || status === 410) {
          console.warn(`[x6-content] deleting 404 inspiration ${row.slug}: HTTP ${status}`);
          await deleteInvalidElementData(sql, row.slug);
          deletedSlugs.add(row.slug);
          return null;
        }
        if (status != null && status >= 400) {
          console.warn(`[x6-content] skipping ${row.slug}: inspiration page HTTP ${status}`);
          return null;
        }
        await markElementUrlChecked(sql, row.slug);
        return row;
      } catch (error) {
        console.warn(`[x6-content] skipping ${row.slug}: could not verify inspiration URL: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
  } finally {
    if (options.browserConfig.connectUrl || options.browserConfig.reuseExisting) {
      browser.disconnect();
    } else {
      await browser.close();
    }
  }

  const validRows = rows.filter(row => row.source_url != null && !deletedSlugs.has(row.slug));
  return { validRows, deletedSlugs };
};

export const deleteX6Content = async (
  apiKey: string,
  contentId: string,
  logger: X6Logger,
): Promise<boolean> => {
  const url = `${CONTENT_URL}/${contentId}`;
  const response = await fetchWithRetry(url, {
    method: "DELETE",
    headers: {
      "x-api-key": apiKey,
    },
  }, logger);

  if (response.ok || response.status === 404) {
    return true;
  }
  const text = await response.text();
  throw new Error(`Failed to delete X6 case ${contentId}: HTTP ${response.status} ${text.slice(0, 300)}`);
};

export type SubmitX6ModerationContentInput = {
  files: string[];
  sourceUrl: string;
  type: "video" | "image" | "mixed";
  parser: string;
  meta?: Record<string, unknown>;
};

export const submitX6ModerationContent = async (
  apiKey: string,
  input: SubmitX6ModerationContentInput,
  logger: X6Logger,
): Promise<X6ContentResponse> => {
  const rawMeta = input.meta ? cleanMeta(input.meta) : undefined;
  const meta = rawMeta && Object.keys(rawMeta).length > 0 ? rawMeta : undefined;

  const payload: Record<string, unknown> = {
    files: input.files,
    sourceUrl: input.sourceUrl,
    type: input.type,
    parser: input.parser,
  };
  if (meta) payload["meta"] = meta;

  const response = await fetchWithRetry(MODERATION_CONTENT_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  }, logger);

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`X6 moderation content submission returned invalid JSON (HTTP ${response.status})`);
  }

  if (response.status === 409 && isObject(body)) {
    const rawMatchedId = body["matchedId"] ?? body["fileId"] ?? body["id"];
    const matchedId = rawMatchedId != null ? String(rawMatchedId) : null;
    if (matchedId) {
      const patchResponse = await fetchWithRetry(`${MODERATION_CONTENT_URL}/${matchedId}`, {
        method: "PATCH",
        headers: {
          "x-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }, logger);

      if (patchResponse.ok) {
        const patchBody = await responseJson(patchResponse, "moderation content patch");
        if (isObject(patchBody) && patchBody["data"] && isObject(patchBody["data"])) {
          return unknown_to_contentResponse_orThrow(patchBody["data"]);
        }
        return unknown_to_contentResponse_orThrow(patchBody);
      }

      return {
        id: matchedId,
        slug: null,
        sourceUrl: input.sourceUrl,
        status: "published",
        rawJson: text,
      };
    }
  }

  if (!response.ok) {
    throw new Error(`X6 moderation content submission failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (isObject(body) && body["data"] && isObject(body["data"])) {
    return unknown_to_contentResponse_orThrow(body["data"]);
  }
  return unknown_to_contentResponse_orThrow(body);
};

export const deleteX6ModerationContent = async (
  apiKey: string,
  contentId: string,
  logger: X6Logger,
): Promise<boolean> => {
  const url = `${MODERATION_CONTENT_URL}/${contentId}`;
  const response = await fetchWithRetry(url, {
    method: "DELETE",
    headers: {
      "x-api-key": apiKey,
    },
  }, logger);

  if (response.ok || response.status === 404) {
    return true;
  }
  const text = await response.text();
  throw new Error(`Failed to delete X6 moderation post ${contentId}: HTTP ${response.status} ${text.slice(0, 300)}`);
};

export const markInspirationPostDeleted = async (sql: SQL, slug: string): Promise<void> => {
  await sql`
    UPDATE elements
    SET x6_post_deleted_at = NOW()
    WHERE slug = ${slug}
  `;
};

export interface SiteElementMedia {
  slug: string;
  title: string;
  source_url: string | null;
  media_type: "image" | "video" | null;
  media_url: string | null;
  media_static_url: string | null;
  x6_file_id: string | null;
  x6_static_file_id: string | null;
  checked_source_url_at: string | null;
}

export interface SiteRow {
  slug: string;
  title: string;
  live_url: string | null;
  awwwards_url: string | null;
  description: string | null;
  award_type: string | null;
  award_date: string | null;
  creator_username: string | null;
  overall_score: number | null;
  design_score: number | null;
  usability_score: number | null;
  creativity_score: number | null;
  content_score: number | null;
  dev_overall_score: number | null;
  dev_semantics_score: number | null;
  dev_animations_score: number | null;
  dev_accessibility_score: number | null;
  dev_wpo_score: number | null;
  dev_responsive_score: number | null;
  dev_markup_score: number | null;
  site_creator_names: string[];
  site_technologies: string[];
  site_colors: string[];
  site_tags: string[];
  site_sotd_vote_count: number;
  site_developer_vote_count: number;
  site_sotd_vote_average: number | null;
  site_developer_vote_average: number | null;
  x6_content_id: string | null;
  x6_content_slug: string | null;
  x6_content_status: string | null;
  checked_source_url_at: string | null;
  elements: SiteElementMedia[];
}

export const parseSiteElementMedia = (row: Record<string, unknown>): SiteElementMedia => ({
  slug: unknown_to_nonEmptyString_orThrow(row["slug"], "element.slug"),
  title: unknown_to_string_orThrow(row["title"] ?? "", "element.title"),
  source_url: unknown_to_nullableString_orThrow(row["source_url"], "element.source_url"),
  media_type: unknown_to_mediaType_orThrow(row["media_type"], "element.media_type"),
  media_url: unknown_to_nullableString_orThrow(row["media_url"], "element.media_url"),
  media_static_url: unknown_to_nullableString_orThrow(row["media_static_url"], "element.media_static_url"),
  x6_file_id: unknown_to_nullableString_orThrow(row["x6_file_id"], "element.x6_file_id"),
  x6_static_file_id: unknown_to_nullableString_orThrow(row["x6_static_file_id"], "element.x6_static_file_id"),
  checked_source_url_at: unknown_to_nullableString_orThrow(row["checked_source_url_at"], "element.checked_source_url_at"),
});

export const parseSiteRow = (row: Record<string, unknown>, elements: SiteElementMedia[]): SiteRow => ({
  slug: unknown_to_nonEmptyString_orThrow(row["slug"], "site.slug"),
  title: unknown_to_string_orThrow(row["title"] ?? "", "site.title"),
  live_url: unknown_to_nullableString_orThrow(row["live_url"], "site.live_url"),
  awwwards_url: unknown_to_nullableString_orThrow(row["awwwards_url"], "site.awwwards_url"),
  description: unknown_to_nullableString_orThrow(row["description"], "site.description"),
  award_type: unknown_to_nullableString_orThrow(row["award_type"], "site.award_type"),
  award_date: unknown_to_nullableString_orThrow(row["award_date"], "site.award_date"),
  creator_username: unknown_to_nullableString_orThrow(row["creator_username"], "site.creator_username"),
  overall_score: unknown_to_nullableNumber_orThrow(row["overall_score"], "site.overall_score"),
  design_score: unknown_to_nullableNumber_orThrow(row["design_score"], "site.design_score"),
  usability_score: unknown_to_nullableNumber_orThrow(row["usability_score"], "site.usability_score"),
  creativity_score: unknown_to_nullableNumber_orThrow(row["creativity_score"], "site.creativity_score"),
  content_score: unknown_to_nullableNumber_orThrow(row["content_score"], "site.content_score"),
  dev_overall_score: unknown_to_nullableNumber_orThrow(row["dev_overall_score"], "site.dev_overall_score"),
  dev_semantics_score: unknown_to_nullableNumber_orThrow(row["dev_semantics_score"], "site.dev_semantics_score"),
  dev_animations_score: unknown_to_nullableNumber_orThrow(row["dev_animations_score"], "site.dev_animations_score"),
  dev_accessibility_score: unknown_to_nullableNumber_orThrow(row["dev_accessibility_score"], "site.dev_accessibility_score"),
  dev_wpo_score: unknown_to_nullableNumber_orThrow(row["dev_wpo_score"], "site.dev_wpo_score"),
  dev_responsive_score: unknown_to_nullableNumber_orThrow(row["dev_responsive_score"], "site.dev_responsive_score"),
  dev_markup_score: unknown_to_nullableNumber_orThrow(row["dev_markup_score"], "site.dev_markup_score"),
  site_creator_names: unknown_to_stringArray_orThrow(row["site_creator_names"], "site.site_creator_names"),
  site_technologies: unknown_to_stringArray_orThrow(row["site_technologies"], "site.site_technologies"),
  site_colors: unknown_to_stringArray_orThrow(row["site_colors"], "site.site_colors"),
  site_tags: unknown_to_stringArray_orThrow(row["site_tags"], "site.site_tags"),
  site_sotd_vote_count: unknown_to_number_orThrow(row["site_sotd_vote_count"] ?? 0, "site.site_sotd_vote_count"),
  site_developer_vote_count: unknown_to_number_orThrow(row["site_developer_vote_count"] ?? 0, "site.site_developer_vote_count"),
  site_sotd_vote_average: unknown_to_nullableNumber_orThrow(row["site_sotd_vote_average"], "site.site_sotd_vote_average"),
  site_developer_vote_average: unknown_to_nullableNumber_orThrow(row["site_developer_vote_average"], "site.site_developer_vote_average"),
  x6_content_id: unknown_to_nullableString_orThrow(row["x6_content_id"], "site.x6_content_id"),
  x6_content_slug: unknown_to_nullableString_orThrow(row["x6_content_slug"], "site.x6_content_slug"),
  x6_content_status: unknown_to_nullableString_orThrow(row["x6_content_status"], "site.x6_content_status"),
  checked_source_url_at: unknown_to_nullableString_orThrow(row["checked_source_url_at"], "site.checked_source_url_at"),
  elements,
});

export const loadSiteRows = async (
  sql: SQL,
  options: { unsubmitted: boolean },
): Promise<SiteRow[]> => {
  const sitesData = await sql`
    SELECT s.slug, s.title, s.live_url, s.awwwards_url, s.description, s.award_type, s.award_date,
           s.creator_username, s.overall_score, s.design_score, s.usability_score, s.creativity_score,
           s.content_score, s.dev_overall_score, s.dev_semantics_score, s.dev_animations_score,
           s.dev_accessibility_score, s.dev_wpo_score, s.dev_responsive_score, s.dev_markup_score,
           s.x6_content_id, s.x6_content_slug, s.x6_content_status, s.checked_source_url_at,
           COALESCE(ARRAY(SELECT sc.display_name FROM site_creators sc WHERE sc.site_slug = s.slug ORDER BY sc.creator_order), ARRAY[]::text[]) AS site_creator_names,
           COALESCE(ARRAY(SELECT st.technology_name FROM site_technologies st WHERE st.site_slug = s.slug ORDER BY st.technology_name), ARRAY[]::text[]) AS site_technologies,
           COALESCE(ARRAY(SELECT cl.hex_code FROM site_colors cl WHERE cl.site_slug = s.slug ORDER BY cl.hex_code), ARRAY[]::text[]) AS site_colors,
           COALESCE(ARRAY(SELECT st.value FROM site_tags st WHERE st.site_slug = s.slug ORDER BY st.tag_type, st.value), ARRAY[]::text[]) AS site_tags,
           COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.site_slug = s.slug AND v.vote_type IN ('Jury', 'Community')), 0) AS site_sotd_vote_count,
           COALESCE((SELECT COUNT(*)::int FROM votes v WHERE v.site_slug = s.slug AND v.vote_type = 'DevJury'), 0) AS site_developer_vote_count,
           (SELECT AVG(v.overall_score)::float FROM votes v WHERE v.site_slug = s.slug AND v.vote_type IN ('Jury', 'Community')) AS site_sotd_vote_average,
           (SELECT AVG(v.overall_score)::float FROM votes v WHERE v.site_slug = s.slug AND v.vote_type = 'DevJury') AS site_developer_vote_average
    FROM sites s
    WHERE (${options.unsubmitted} = false OR NULLIF(BTRIM(s.x6_content_id), '') IS NULL)
    ORDER BY CASE WHEN s.award_type = 'SOTD' THEN 0 ELSE 1 END, s.slug
  `;

  if (sitesData.length === 0) return [];

  const elementsData = await sql`
    SELECT s.slug AS site_slug, e.slug, e.title, e.source_url, e.media_type,
           e.media_url, e.media_static_url, e.x6_file_id, e.x6_static_file_id, e.checked_source_url_at
    FROM sites s
    JOIN elements e ON e.website_url = s.live_url
    WHERE (${options.unsubmitted} = false OR NULLIF(BTRIM(s.x6_content_id), '') IS NULL)
    ORDER BY s.slug, e.slug
  `;

  const elementsBySite = new Map<string, SiteElementMedia[]>();
  for (const elem of elementsData) {
    const record = unknown_to_object_orThrow(elem, "element item");
    const siteSlug = unknown_to_nonEmptyString_orThrow(record["site_slug"], "element.site_slug");
    const list = elementsBySite.get(siteSlug) ?? [];
    list.push(parseSiteElementMedia(record));
    elementsBySite.set(siteSlug, list);
  }

  return sitesData.map((siteObj: Record<string, unknown>) => {
    const record = unknown_to_object_orThrow(siteObj, "site row");
    const slug = unknown_to_nonEmptyString_orThrow(record["slug"], "site.slug");
    const elements = elementsBySite.get(slug) ?? [];
    return parseSiteRow(record, elements);
  });
};

export const saveSiteX6Content = async (sql: SQL, siteSlug: string, content: X6ContentResponse): Promise<void> => {
  await sql`
    UPDATE sites
    SET x6_content_id = ${content.id},
        x6_content_slug = ${content.slug},
        x6_content_status = ${content.status}
    WHERE slug = ${siteSlug}
  `;
};

export const markSiteUrlChecked = async (sql: SQL, siteSlug: string): Promise<void> => {
  await sql`
    UPDATE sites
    SET checked_source_url_at = NOW()
    WHERE slug = ${siteSlug}
  `;
};

export const getSiteDate = (site: SiteRow): Date | string | null => {
  if (site.checked_source_url_at) return site.checked_source_url_at;
  if (site.award_date) return site.award_date;
  return null;
};

export type VerifySitesResult = {
  validSites: SiteRow[];
  invalidSlugs: Set<string>;
};

export const verifyUncheckedSites = async (
  sql: SQL,
  sites: SiteRow[],
  options: {
    dry: boolean;
    concurrency: number;
    browserConfig: Parameters<typeof launchBrowser>[0];
    maxAgeDays?: number;
  },
): Promise<VerifySitesResult> => {
  const maxAgeDays = options.maxAgeDays ?? 5;
  const invalidSlugs = new Set<string>();

  const recentSites: SiteRow[] = [];
  const needsCheckSites: SiteRow[] = [];

  for (const site of sites) {
    const isCheckedRecently = site.checked_source_url_at != null && isRecentDate(site.checked_source_url_at, maxAgeDays);
    const isCreatedRecently = isRecentDate(getSiteDate(site), maxAgeDays);

    if (isCheckedRecently || isCreatedRecently) {
      recentSites.push(site);
      if (site.checked_source_url_at == null && isCreatedRecently && !options.dry) {
        await markSiteUrlChecked(sql, site.slug);
      }
    } else {
      needsCheckSites.push(site);
    }
  }

  if (options.dry || needsCheckSites.length === 0) {
    const validSites = sites.filter(s => !invalidSlugs.has(s.slug));
    return { validSites, invalidSlugs };
  }

  const browser = await launchBrowser(options.browserConfig);
  try {
    await parallelMap(needsCheckSites, options.concurrency, async site => {
      const urlToCheck = site.awwwards_url ?? site.live_url;
      if (!urlToCheck) return null;
      try {
        const page = await browser.newPage();
        let status: number | null = null;
        try {
          const response = await page.goto(urlToCheck, { waitUntil: "domcontentloaded", timeout: 60000 });
          status = response?.status() ?? null;
        } finally {
          await page.close();
        }

        if (status === 404 || status === 410) {
          console.warn(`[x6-sites] site ${site.slug} returned HTTP ${status}`);
          invalidSlugs.add(site.slug);
          return null;
        }
        if (status != null && status >= 400) {
          console.warn(`[x6-sites] skipping site ${site.slug}: HTTP ${status}`);
          return null;
        }
        await markSiteUrlChecked(sql, site.slug);
        return site;
      } catch (error) {
        console.warn(`[x6-sites] skipping site ${site.slug}: error verifying URL: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
  } finally {
    if (options.browserConfig.connectUrl || options.browserConfig.reuseExisting) {
      browser.disconnect();
    } else {
      await browser.close();
    }
  }

  const validSites = sites.filter(s => !invalidSlugs.has(s.slug));
  return { validSites, invalidSlugs };
};

export type CollectionRow = {
  slug: string;
  name: string;
  url: string | null;
  source_url: string | null;
  category_name: string | null;
  creator_username: string | null;
  creator_name: string | null;
  followers_count: number | null;
  items_count: number | null;
  sites_count: number | null;
  inspirations_count: number | null;
  raw_json: string | null;
  x6_post_id: string | null;
  x6_post_slug: string | null;
  x6_post_status: string | null;
  checked_source_url_at: Date | null;
  sites: string[];
  inspirations: string[];
  files: string[];
};

export const loadCollectionRows = async (
  sql: SQL,
  options?: {
    unsubmittedOnly?: boolean;
    slug?: string;
  },
): Promise<CollectionRow[]> => {
  const collectionList = await sql`
    SELECT
      c.slug,
      c.name,
      c.url,
      c.source_url,
      c.category_name,
      c.creator_username,
      c.creator_name,
      c.followers_count,
      c.items_count,
      c.sites_count,
      c.inspirations_count,
      c.raw_json,
      c.x6_post_id,
      c.x6_post_slug,
      c.x6_post_status,
      c.checked_source_url_at
    FROM collections c
    WHERE (${options?.unsubmittedOnly ? true : false} = false OR c.x6_post_id IS NULL)
      AND (${options?.slug ? true : false} = false OR c.slug = ${options?.slug ?? ""})
    ORDER BY c.slug
  ` as Array<Record<string, unknown>>;

  if (collectionList.length === 0) return [];

  const itemsList = await sql`
    SELECT
      ci.collection_slug,
      ci.item_type,
      ci.element_slug,
      e.x6_file_id
    FROM collection_items ci
    LEFT JOIN elements e ON e.slug = ci.element_slug
  ` as Array<{ collection_slug: string; item_type: string; element_slug: string; x6_file_id: string | null }>;

  const itemsByCollection = new Map<string, { sites: Set<string>; inspirations: Set<string>; files: Set<string> }>();
  for (const item of itemsList) {
    let entry = itemsByCollection.get(item.collection_slug);
    if (!entry) {
      entry = { sites: new Set(), inspirations: new Set(), files: new Set() };
      itemsByCollection.set(item.collection_slug, entry);
    }
    if (item.item_type === "site" && item.element_slug) {
      entry.sites.add(item.element_slug);
    } else if (item.item_type === "inspiration" && item.element_slug) {
      entry.inspirations.add(item.element_slug);
    }
    if (item.x6_file_id) {
      entry.files.add(item.x6_file_id);
    }
  }

  return collectionList.map(row => {
    const colSlug = unknown_to_nonEmptyString_orThrow(row["slug"], "collection.slug");
    const itemData = itemsByCollection.get(colSlug) ?? { sites: new Set(), inspirations: new Set(), files: new Set() };

    return {
      slug: colSlug,
      name: unknown_to_string_orThrow(row["name"], "collection.name"),
      url: unknown_to_nullableString_orThrow(row["url"], "collection.url"),
      source_url: unknown_to_nullableString_orThrow(row["source_url"], "collection.source_url"),
      category_name: unknown_to_nullableString_orThrow(row["category_name"], "collection.category_name"),
      creator_username: unknown_to_nullableString_orThrow(row["creator_username"], "collection.creator_username"),
      creator_name: unknown_to_nullableString_orThrow(row["creator_name"], "collection.creator_name"),
      followers_count: unknown_to_nullableNumber_orThrow(row["followers_count"], "collection.followers_count"),
      items_count: unknown_to_nullableNumber_orThrow(row["items_count"], "collection.items_count"),
      sites_count: unknown_to_nullableNumber_orThrow(row["sites_count"], "collection.sites_count"),
      inspirations_count: unknown_to_nullableNumber_orThrow(row["inspirations_count"], "collection.inspirations_count"),
      raw_json: unknown_to_nullableString_orThrow(row["raw_json"], "collection.raw_json"),
      x6_post_id: unknown_to_nullableString_orThrow(row["x6_post_id"], "collection.x6_post_id"),
      x6_post_slug: unknown_to_nullableString_orThrow(row["x6_post_slug"], "collection.x6_post_slug"),
      x6_post_status: unknown_to_nullableString_orThrow(row["x6_post_status"], "collection.x6_post_status"),
      checked_source_url_at: unknown_to_nullableDate_orThrow(row["checked_source_url_at"], "collection.checked_source_url_at"),
      sites: unknown_to_stringArray_orThrow(Array.from(itemData.sites), "collection.sites"),
      inspirations: unknown_to_stringArray_orThrow(Array.from(itemData.inspirations), "collection.inspirations"),
      files: unknown_to_stringArray_orThrow(Array.from(itemData.files), "collection.files"),
    };
  });
};

export const saveX6CollectionPost = async (sql: SQL, collectionSlug: string, content: X6ContentResponse): Promise<void> => {
  await sql`
    UPDATE collections
    SET x6_post_id = ${content.id},
        x6_post_slug = ${content.slug},
        x6_post_status = ${content.status}
    WHERE slug = ${collectionSlug}
  `;
};

export const markCollectionUrlChecked = async (sql: SQL, collectionSlug: string): Promise<void> => {
  await sql`
    UPDATE collections
    SET checked_source_url_at = NOW()
    WHERE slug = ${collectionSlug}
  `;
};

export const getCollectionDate = (col: CollectionRow): Date | string | number | null => {
  if (col.checked_source_url_at) return col.checked_source_url_at;
  if (col.raw_json) {
    try {
      const parsed = JSON.parse(col.raw_json) as Record<string, unknown>;
      const createdAt = parsed["createdAt"];
      if (typeof createdAt === "number" || typeof createdAt === "string") return createdAt;
    } catch {}
  }
  return null;
};

export type VerifyCollectionsResult = {
  validCollections: CollectionRow[];
  invalidSlugs: Set<string>;
};

export const verifyUncheckedCollections = async (
  sql: SQL,
  collections: CollectionRow[],
  options: {
    dry: boolean;
    concurrency: number;
    browserConfig: Parameters<typeof launchBrowser>[0];
    maxAgeDays?: number;
  },
): Promise<VerifyCollectionsResult> => {
  const maxAgeDays = options.maxAgeDays ?? 5;
  const invalidSlugs = new Set<string>();

  const recentCollections: CollectionRow[] = [];
  const needsCheckCollections: CollectionRow[] = [];

  for (const col of collections) {
    const isCheckedRecently = col.checked_source_url_at != null && isRecentDate(col.checked_source_url_at, maxAgeDays);
    const isCreatedRecently = isRecentDate(getCollectionDate(col), maxAgeDays);

    if (isCheckedRecently || isCreatedRecently) {
      recentCollections.push(col);
      if (col.checked_source_url_at == null && isCreatedRecently && !options.dry) {
        await markCollectionUrlChecked(sql, col.slug);
      }
    } else {
      needsCheckCollections.push(col);
    }
  }

  if (options.dry || needsCheckCollections.length === 0) {
    const validCollections = collections.filter(c => !invalidSlugs.has(c.slug));
    return { validCollections, invalidSlugs };
  }

  const browser = await launchBrowser(options.browserConfig);
  try {
    await parallelMap(needsCheckCollections, options.concurrency, async col => {
      const urlToCheck = col.source_url ?? col.url;
      if (!urlToCheck) return null;
      try {
        const page = await browser.newPage();
        let status: number | null = null;
        try {
          const response = await page.goto(urlToCheck, { waitUntil: "domcontentloaded", timeout: 60000 });
          status = response?.status() ?? null;
        } finally {
          await page.close();
        }

        if (status === 404 || status === 410) {
          console.warn(`[x6-collections] collection ${col.slug} returned HTTP ${status}`);
          invalidSlugs.add(col.slug);
          return null;
        }
        if (status != null && status >= 400) {
          console.warn(`[x6-collections] skipping collection ${col.slug}: HTTP ${status}`);
          return null;
        }
        await markCollectionUrlChecked(sql, col.slug);
        return col;
      } catch (error) {
        console.warn(`[x6-collections] skipping collection ${col.slug}: error verifying URL: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
  } finally {
    if (options.browserConfig.connectUrl || options.browserConfig.reuseExisting) {
      browser.disconnect();
    } else {
      await browser.close();
    }
  }

  const validCollections = collections.filter(c => !invalidSlugs.has(c.slug));
  return { validCollections, invalidSlugs };
};
