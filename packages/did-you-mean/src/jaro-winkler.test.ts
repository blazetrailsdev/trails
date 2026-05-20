// Oracle values computed via Ruby 3.3 did_you_mean's
// DidYouMean::Jaro.distance and DidYouMean::JaroWinkler.distance.
import { describe, it, expect } from "vitest";
import { Jaro, JaroWinkler } from "./jaro-winkler.js";

const EPS = 1e-9;

function close(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(EPS);
}

describe("Jaro.distance", () => {
  it("is 1 for identical strings and 0 for fully disjoint", () => {
    expect(Jaro.distance("foo", "foo")).toBe(1);
    expect(Jaro.distance("foo", "qux")).toBe(0);
  });

  it("is 0 when either string is empty", () => {
    expect(Jaro.distance("", "")).toBe(0);
    expect(Jaro.distance("a", "")).toBe(0);
    expect(Jaro.distance("", "b")).toBe(0);
  });

  it("matches Ruby oracle values for canonical cases", () => {
    close(Jaro.distance("MARTHA", "MARHTA"), 0.9444444444444444);
    close(Jaro.distance("DIXON", "DICKSONX"), 0.7666666666666667);
    close(Jaro.distance("JELLYFISH", "SMELLYFISH"), 0.8962962962962963);
    close(Jaro.distance("foo", "fooo"), 0.9166666666666666);
    close(Jaro.distance("foo", "fobr"), 0.7222222222222222);
    close(Jaro.distance("abc", "abcd"), 0.9166666666666666);
    close(Jaro.distance("abcd", "abc"), 0.9166666666666666);
    close(Jaro.distance("kitten", "sitting"), 0.746031746031746);
    close(Jaro.distance("receive", "recieve"), 0.9523809523809524);
    close(Jaro.distance("shwo", "show"), 0.9166666666666666);
    close(Jaro.distance("ab", "ba"), 0);
  });

  it("is symmetric to argument order (Ruby swaps internally)", () => {
    close(Jaro.distance("DIXON", "DICKSONX"), Jaro.distance("DICKSONX", "DIXON"));
    close(Jaro.distance("foo", "fooo"), Jaro.distance("fooo", "foo"));
  });

  it("treats accented characters as single codepoints", () => {
    close(Jaro.distance("café", "cafe"), 0.8333333333333334);
    expect(Jaro.distance("café", "café")).toBe(1);
  });
});

describe("JaroWinkler.distance", () => {
  it("equals Jaro distance when Jaro <= 0.7", () => {
    expect(JaroWinkler.distance("foo", "qux")).toBe(0);
    close(JaroWinkler.distance("kitten", "sitting"), 0.746031746031746);
    // kitten/sitting share no prefix, so JW == Jaro even above the threshold.
  });

  it("applies a prefix bonus when Jaro > 0.7", () => {
    close(JaroWinkler.distance("MARTHA", "MARHTA"), 0.9611111111111111);
    close(JaroWinkler.distance("DIXON", "DICKSONX"), 0.8133333333333332);
    close(JaroWinkler.distance("foo", "fooo"), 0.9416666666666667);
    close(JaroWinkler.distance("foo", "fobr"), 0.7777777777777778);
    close(JaroWinkler.distance("abc", "abcd"), 0.9416666666666667);
    close(JaroWinkler.distance("receive", "recieve"), 0.9666666666666667);
    close(JaroWinkler.distance("shwo", "show"), 0.9333333333333332);
    close(JaroWinkler.distance("café", "cafe"), 0.8833333333333334);
  });

  it("caps prefix bonus at 4 codepoints", () => {
    // JELLYFISH/SMELLYFISH share no common prefix → no bonus.
    close(JaroWinkler.distance("JELLYFISH", "SMELLYFISH"), 0.8962962962962963);
  });
});
