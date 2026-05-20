// Oracle values computed via Ruby 3.3 did_you_mean's
// DidYouMean::Levenshtein.distance.
import { describe, it, expect } from "vitest";
import { levenshteinDistance } from "./levenshtein.js";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("foo", "foo")).toBe(0);
  });

  it("returns length of the other when one is empty", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("counts insertions and deletions", () => {
    expect(levenshteinDistance("foo", "fooo")).toBe(1);
    expect(levenshteinDistance("abcd", "abc")).toBe(1);
  });

  it("counts substitutions and transpositions", () => {
    expect(levenshteinDistance("foo", "fobr")).toBe(2);
    expect(levenshteinDistance("foo", "qux")).toBe(3);
    expect(levenshteinDistance("MARTHA", "MARHTA")).toBe(2);
    expect(levenshteinDistance("DIXON", "DICKSONX")).toBe(4);
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("receive", "recieve")).toBe(2);
    expect(levenshteinDistance("shwo", "show")).toBe(2);
    expect(levenshteinDistance("ab", "ba")).toBe(2);
  });

  it("counts a non-BMP codepoint as one edit (codepoint iteration)", () => {
    // Ruby's Levenshtein.distance("𝐀", "") == 1
    expect(levenshteinDistance("\u{1D400}", "")).toBe(1);
    expect(levenshteinDistance("\u{1D400}", "\u{1D400}")).toBe(0);
    expect(levenshteinDistance("a\u{1D400}", "a")).toBe(1);
  });

  it("treats accented characters as single codepoints", () => {
    // "café" → "cafe" differs in one codepoint
    expect(levenshteinDistance("café", "cafe")).toBe(1);
    expect(levenshteinDistance("café", "café")).toBe(0);
  });
});
