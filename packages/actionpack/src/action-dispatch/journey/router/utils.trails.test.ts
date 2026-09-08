import { describe, it, expect } from "vitest";
import { normalizePath, escapeSegment, unescapeUri } from "./utils.js";

describe("ActionDispatch::Journey::Router::Utils", () => {
  it("strips trailing slash", () => {
    expect(normalizePath("/foo/")).toBe("/foo");
  });

  it("collapses repeated slashes", () => {
    expect(normalizePath("//foo///bar//")).toBe("/foo/bar");
  });

  it("adds leading slash", () => {
    expect(normalizePath("foo")).toBe("/foo");
  });

  it("escapes non-BMP code points as their real UTF-8 bytes, not surrogate halves", () => {
    expect(escapeSegment("🚀")).toBe("%F0%9F%9A%80");
  });

  it("unescapes non-BMP UTF-8 sequences back to the original code point", () => {
    expect(unescapeUri("%F0%9F%9A%80")).toBe("🚀");
  });

  it("round-trips non-BMP characters through escape/unescape", () => {
    const s = "café — 🚀 — 中文";
    expect(unescapeUri(escapeSegment(s))).toBe(s);
  });
});
