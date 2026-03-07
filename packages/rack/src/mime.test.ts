import { describe, it, expect } from "vitest";
import { mimeType, match } from "./mime.js";
import * as path from "path";

describe("Rack::Mime", () => {
  it("should return the fallback mime-type for files with no extension", () => {
    const fallback = "image/jpg";
    expect(mimeType(path.extname("no_ext"), fallback)).toBe(fallback);
  });

  it("should always return 'application/octet-stream' for unknown file extensions", () => {
    const unknownExt = path.extname("unknown_ext.abcdefg");
    expect(mimeType(unknownExt)).toBe("application/octet-stream");
  });

  it("should return the mime-type for a given extension", () => {
    expect(mimeType(path.extname("image.jpg"))).toBe("image/jpeg");
  });

  it("should support null fallbacks", () => {
    expect(mimeType(".nothing", null)).toBeNull();
  });

  it("should match exact mimes", () => {
    expect(match("text/html", "text/html")).toBe(true);
    expect(match("text/html", "text/meme")).toBe(false);
    expect(match("text", "text")).toBe(true);
    expect(match("text", "binary")).toBe(false);
  });

  it("should match class wildcard mimes", () => {
    expect(match("text/html", "text/*")).toBe(true);
    expect(match("text/plain", "text/*")).toBe(true);
    expect(match("application/json", "text/*")).toBe(false);
    expect(match("text/html", "text")).toBe(true);
  });

  it("should match full wildcards", () => {
    expect(match("text/html", "*")).toBe(true);
    expect(match("text/plain", "*")).toBe(true);
    expect(match("text/html", "*/*")).toBe(true);
    expect(match("text/plain", "*/*")).toBe(true);
  });

  it("should match type wildcard mimes", () => {
    expect(match("text/html", "*/html")).toBe(true);
    expect(match("text/plain", "*/plain")).toBe(true);
  });
});
