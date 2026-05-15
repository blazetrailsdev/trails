import { describe, it, expect } from "vitest";
import { normalizePath, escapePath, escapeSegment, escapeFragment, unescapeUri } from "./utils.js";

describe("ActionDispatch::Journey::Router::Utils", () => {
  it("test_path_escape", () => {
    expect(escapePath("a/b c+d%")).toBe("a/b%20c+d%25");
  });

  it("test_segment_escape", () => {
    expect(escapeSegment("a/b c+d%")).toBe("a%2Fb%20c+d%25");
  });

  it("test_fragment_escape", () => {
    expect(escapeFragment("a/b c+d%?e")).toBe("a/b%20c+d%25?e");
  });

  it("test_uri_unescape", () => {
    expect(unescapeUri("a%2Fb%20c+d")).toBe("a/b c+d");
  });

  it("test_uri_unescape_with_utf8_string", () => {
    expect(unescapeUri("%C5%A0a%C5%A1inkov%C3%A1")).toBe("Šašinková");
  });

  it("test_normalize_path_not_greedy", () => {
    expect(normalizePath("/foo%20bar%20baz")).toBe("/foo%20bar%20baz");
  });

  it("test_normalize_path_uppercase", () => {
    expect(normalizePath("/foo%aabar%aabaz")).toBe("/foo%AAbar%AAbaz");
  });

  it("test_normalize_path_with_nil", () => {
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
});
