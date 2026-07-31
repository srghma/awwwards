import { describe, expect, it } from "bun:test";
import { cleanMeta, unknown_to_mediaType_orThrow, unknown_to_string_orThrow } from "../src/x6";

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
});
