// Oracle values computed via Ruby 3.3 did_you_mean's
// DidYouMean::Levenshtein.distance.
import { describe, it, expect } from "vitest";
import { Levenshtein } from "./levenshtein.js";

describe("Levenshtein.distance", () => {
  it("returns 0 for identical strings", () => {
    expect(Levenshtein.distance("foo", "foo")).toBe(0);
  });

  it("returns length of the other when one is empty", () => {
    expect(Levenshtein.distance("", "")).toBe(0);
    expect(Levenshtein.distance("abc", "")).toBe(3);
    expect(Levenshtein.distance("", "abc")).toBe(3);
  });

  it("counts insertions and deletions", () => {
    expect(Levenshtein.distance("foo", "fooo")).toBe(1);
    expect(Levenshtein.distance("abcd", "abc")).toBe(1);
  });

  it("counts substitutions and transpositions", () => {
    expect(Levenshtein.distance("foo", "fobr")).toBe(2);
    expect(Levenshtein.distance("foo", "qux")).toBe(3);
    expect(Levenshtein.distance("MARTHA", "MARHTA")).toBe(2);
    expect(Levenshtein.distance("DIXON", "DICKSONX")).toBe(4);
    expect(Levenshtein.distance("kitten", "sitting")).toBe(3);
    expect(Levenshtein.distance("receive", "recieve")).toBe(2);
    expect(Levenshtein.distance("shwo", "show")).toBe(2);
    expect(Levenshtein.distance("ab", "ba")).toBe(2);
  });

  it("counts a non-BMP codepoint as one edit (codepoint iteration)", () => {
    // Ruby's Levenshtein.distance("𝐀", "") == 1
    expect(Levenshtein.distance("\u{1D400}", "")).toBe(1);
    expect(Levenshtein.distance("\u{1D400}", "\u{1D400}")).toBe(0);
    expect(Levenshtein.distance("a\u{1D400}", "a")).toBe(1);
  });

  it("treats accented characters as single codepoints", () => {
    // "café" → "cafe" differs in one codepoint
    expect(Levenshtein.distance("café", "cafe")).toBe(1);
    expect(Levenshtein.distance("café", "café")).toBe(0);
  });
});
