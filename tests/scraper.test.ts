import { describe, expect, it } from "bun:test";
import { parseConfig } from "../src/args";
import { downloadMedia } from "../src/media";
import { safeParseFloat, sanitizeUrl } from "../src/scraper";
import { existsSync, unlinkSync } from "fs";

describe("CLI Arguments Parser", () => {
  it("should return default configurations", () => {
    const config = parseConfig([]);
    expect(config.headless).toBe(true);
    expect(config.connectUrl).toBeNull();
    expect(config.pages).toBe(1);
    expect(config.type).toBe("sotd");
  });

  it("should handle --no-headless flag", () => {
    const config = parseConfig(["--no-headless"]);
    expect(config.headless).toBe(false);
  });

  it("should parse connect WebSocket URL", () => {
    const wsUrl = "ws://127.0.0.1:9222/devtools/browser/xyz";
    const config = parseConfig(["--connect", wsUrl]);
    expect(config.connectUrl).toBe(wsUrl);
  });

  it("should parse pages and type options", () => {
    const config = parseConfig(["--pages", "4", "--type", "nominees"]);
    expect(config.pages).toBe(4);
    expect(config.type).toBe("nominees");
  });

  it("should fallback pages parameter gracefully to at least 1", () => {
    const config = parseConfig(["--pages", "-5"]);
    expect(config.pages).toBe(1);
  });
});

describe("Media Downloader", () => {
  it("should decode and write inline base64 image URIs", async () => {
    const base64Uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const result = await downloadMedia(base64Uri, "test-media-slug-base64");

    expect(result.success).toBe(true);
    expect(result.mediaType).toBe("image");
    expect(existsSync(result.localPath)).toBe(true);

    if (existsSync(result.localPath)) {
      unlinkSync(result.localPath);
    }
  });

  it("should download HTTP/S files correctly", async () => {
    const imageUrl = "https://picsum.photos/12/12";
    const result = await downloadMedia(imageUrl, "test-media-slug-http");

    expect(result.success).toBe(true);
    expect(result.mediaType).toBe("image");
    expect(existsSync(result.localPath)).toBe(true);

    if (existsSync(result.localPath)) {
      unlinkSync(result.localPath);
    }
  });
});

describe("Data Validation Helpers", () => {
  it("should parse score floats with non-numeric padding gracefully", () => {
    expect(safeParseFloat("7.41 of 10")).toBe(7.41);
    expect(safeParseFloat("9.5")).toBe(9.5);
    expect(safeParseFloat("")).toBeNull();
    expect(safeParseFloat(null)).toBeNull();
  });

  it("should sanitize valid HTTP/S urls and reject others", () => {
    expect(sanitizeUrl("https://awwwards.com")).toBe("https://awwwards.com");
    expect(sanitizeUrl("http://example.com/subpage")).toBe("http://example.com/subpage");
    expect(sanitizeUrl("ftp://invalid-scheme.com")).toBeNull();
    expect(sanitizeUrl("plain-text-not-url")).toBeNull();
    expect(sanitizeUrl(null)).toBeNull();
  });
});
