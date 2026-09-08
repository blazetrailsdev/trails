import { describe, it, expect } from "vitest";
import { normalizePath, escapePath, escapeSegment, escapeFragment, unescapeUri } from "./utils.js";

describe("ActionDispatch::Journey::Router::Utils", () => {
  it("path escape", () => {
    expect(escapePath("a/b c+d%")).toBe("a/b%20c+d%25");
  });

  it("segment escape", () => {
    expect(escapeSegment("a/b c+d%")).toBe("a%2Fb%20c+d%25");
  });

  it("fragment escape", () => {
    expect(escapeFragment("a/b c+d%?e")).toBe("a/b%20c+d%25?e");
  });

  it("uri unescape", () => {
    expect(unescapeUri("a%2Fb%20c+d")).toBe("a/b c+d");
  });

  it("uri unescape with utf8 string", () => {
    expect(unescapeUri("%C5%A0a%C5%A1inkov%C3%A1")).toBe("Šašinková");
  });

  it("normalize path not greedy", () => {
    expect(normalizePath("/foo%20bar%20baz")).toBe("/foo%20bar%20baz");
  });

  it("normalize path uppercase", () => {
    expect(normalizePath("/foo%aabar%aabaz")).toBe("/foo%AAbar%AAbaz");
  });

  it("normalize path with nil", () => {
    expect(normalizePath(null)).toBe("/");
  });

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
