import { describe, expect, it } from "bun:test";
import {
  cleanMeta,
  getInspirationDate,
  getSiteDate,
  isRecentDate,
  unknown_to_mediaType_orThrow,
  unknown_to_nullableDate_orThrow,
  unknown_to_string_orThrow,
} from "../src/x6";

describe("Metadata Cleanup & Assertion Helpers", () => {
  it("cleanMeta should remove null and undefined fields recursively", () => {
    const raw = {
      title: "Test Site",
      description: null,
      author: undefined,
      tags: ["design", "ui"],
      emptyArray: [],
      nested: {
        valid: "yes",
        invalid: null,
        emptyChild: {
          subNull: null,
        },
      },
    };

    const cleaned = cleanMeta(raw);
    expect(cleaned).toEqual({
      title: "Test Site",
      tags: ["design", "ui"],
      nested: {
        valid: "yes",
      },
    });
    expect(Object.prototype.hasOwnProperty.call(cleaned, "description")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cleaned, "author")).toBe(false);
  });

  it("unknown_to_string_orThrow validates strings strictly", () => {
    expect(unknown_to_string_orThrow("hello", "field")).toBe("hello");
    expect(() => unknown_to_string_orThrow(123, "field")).toThrow("Expected field to be a string");
  });

  it("unknown_to_mediaType_orThrow validates image/video/null", () => {
    expect(unknown_to_mediaType_orThrow("image", "media_type")).toBe("image");
    expect(unknown_to_mediaType_orThrow("video", "media_type")).toBe("video");
    expect(unknown_to_mediaType_orThrow(null, "media_type")).toBe(null);
    expect(() => unknown_to_mediaType_orThrow("audio", "media_type")).toThrow();
  });

  it("unknown_to_nullableDate_orThrow parses dates strictly", () => {
    const d = new Date();
    expect(unknown_to_nullableDate_orThrow(d, "field")).toEqual(d);
    expect(unknown_to_nullableDate_orThrow(null, "field")).toBe(null);
    expect(unknown_to_nullableDate_orThrow(d.toISOString(), "field")).toEqual(d);
    expect(() => unknown_to_nullableDate_orThrow({}, "field")).toThrow();
  });

  it("isRecentDate accurately checks max age threshold", () => {
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

    expect(isRecentDate(twoDaysAgo, 5)).toBe(true);
    expect(isRecentDate(tenDaysAgo, 5)).toBe(false);
    expect(isRecentDate(now / 1000 - 86400, 5)).toBe(true); // Unix seconds
    expect(isRecentDate(null, 5)).toBe(false);
  });

  it("getInspirationDate and getSiteDate extract dates correctly", () => {
    const inspWithCheckedAt = { checked_source_url_at: new Date() } as any;
    expect(getInspirationDate(inspWithCheckedAt)).toEqual(inspWithCheckedAt.checked_source_url_at);

    const inspWithRawJson = {
      checked_source_url_at: null,
      raw_json: JSON.stringify({ createdAt: 1770204822 }),
    } as any;
    expect(getInspirationDate(inspWithRawJson)).toBe(1770204822);

    const siteWithAwardDate = { checked_source_url_at: null, award_date: "Jul 28, 2026" } as any;
    expect(getSiteDate(siteWithAwardDate)).toBe("Jul 28, 2026");
  });
});
