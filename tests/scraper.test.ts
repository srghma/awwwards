import { describe, expect, it } from "bun:test";
import { parseConfig } from "../src/args";
import { downloadMedia } from "../src/media";
import { effectiveCollectionsIndexTotal, parseOptionalScore, parseRequiredCount, safeParseFloat, sanitizeUrl } from "../src/scraper";
import { existsSync, unlinkSync } from "fs";

describe("CLI Arguments Parser", () => {
  it("should return default configurations", () => {
    const config = parseConfig([]);
    expect(config.headless).toBe(false);
    expect(config.connectUrl).toBeNull();
    expect(config.reuseExisting).toBe(false);
    expect(config.remoteDebuggingPort).toBe(Number.parseInt(process.env["CHROME_REMOTE_DEBUGGING_PORT"] ?? process.env["AWWWARDS_REMOTE_DEBUGGING_PORT"] ?? "9222", 10));
    expect(config.pages).toBe(9999);
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

  it("should opt into reuse and isolated worker settings", () => {
    const config = parseConfig(["--reuse-existing", "--continue", "--worker-id", "worker-2", "--window-index", "2", "--user-data-dir", "/tmp/worker-2"]);
    expect(config.reuseExisting).toBe(true);
    expect(config.continueExisting).toBe(true);
    expect(config.workerId).toBe("worker-2");
    expect(config.windowIndex).toBe(2);
    expect(config.userDataDir).toBe("/tmp/worker-2");
  });

  it("should support reverse queue traversal for a second worker", () => {
    const config = parseConfig(["--continue", "--from-end", "https://www.awwwards.com/websites"]);
    expect(config.continueExisting).toBe(true);
    expect(config.fromEnd).toBe(true);
  });

  it("should parse the Chrome remote debugging port", () => {
    const config = parseConfig(["--reuse-existing", "--remote-debugging-port", "9223"]);
    expect(config.remoteDebuggingPort).toBe(9223);
  });

  it("should parse pages and type options", () => {
    const config = parseConfig(["--pages", "4", "--type", "nominees"]);
    expect(config.pages).toBe(4);
    expect(config.type).toBe("nominees");
  });

  it("should accept a direct target URL", () => {
    const url = "https://www.awwwards.com/inspiration/interactive-404-page-fort-vega";
    const config = parseConfig([url]);
    expect(config.targetUrl).toBe(url);
  });

  it("should accept a direct target URL after CLI flags", () => {
    const url = "https://www.awwwards.com/elements";
    const config = parseConfig(["--reuse-existing", "--worker-id", "scraper-1", url]);
    expect(config.reuseExisting).toBe(true);
    expect(config.workerId).toBe("scraper-1");
    expect(config.targetUrl).toBe(url);
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
  it("requires a valid non-negative count", () => {
    expect(parseRequiredCount("10336", "items")).toBe(10336);
    expect(() => parseRequiredCount(null, "items")).toThrow();
    expect(() => parseRequiredCount("10 items", "items")).toThrow();
    expect(() => parseRequiredCount("1.5", "items")).toThrow();
  });

  it("applies the collections count exception only to the exact collections index URL", () => {
    expect(effectiveCollectionsIndexTotal("https://www.awwwards.com/collections/", 132)).toBe(100);
    expect(effectiveCollectionsIndexTotal("https://www.awwwards.com/collections/?page=2", 132)).toBe(132);
    expect(effectiveCollectionsIndexTotal("https://www.awwwards.com/elements/", 10336)).toBe(10336);
  });

  it("rejects non-empty invalid scores instead of converting them to null", () => {
    expect(parseOptionalScore("7.5 of 10", "design")).toBe(7.5);
    expect(parseOptionalScore(null, "design")).toBeNull();
    expect(() => parseOptionalScore("not-a-score", "design")).toThrow();
    expect(() => parseOptionalScore("11", "design")).toThrow();
  });
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
