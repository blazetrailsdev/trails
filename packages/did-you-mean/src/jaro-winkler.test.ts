// Oracle values computed via Ruby 3.3 did_you_mean's
// DidYouMean::Jaro.distance and DidYouMean::JaroWinkler.distance.
import { describe, it, expect } from "vitest";
import { jaroDistance, jaroWinklerDistance } from "./jaro-winkler.js";

const EPS = 1e-9;

function close(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(EPS);
}

describe("jaroDistance", () => {
  it("is 1 for identical strings and 0 for fully disjoint", () => {
    expect(jaroDistance("foo", "foo")).toBe(1);
    expect(jaroDistance("foo", "qux")).toBe(0);
  });

  it("is 0 when either string is empty", () => {
    expect(jaroDistance("", "")).toBe(0);
    expect(jaroDistance("a", "")).toBe(0);
    expect(jaroDistance("", "b")).toBe(0);
  });

  it("matches Ruby oracle values for canonical cases", () => {
    close(jaroDistance("MARTHA", "MARHTA"), 0.9444444444444444);
    close(jaroDistance("DIXON", "DICKSONX"), 0.7666666666666667);
    close(jaroDistance("JELLYFISH", "SMELLYFISH"), 0.8962962962962963);
    close(jaroDistance("foo", "fooo"), 0.9166666666666666);
    close(jaroDistance("foo", "fobr"), 0.7222222222222222);
    close(jaroDistance("abc", "abcd"), 0.9166666666666666);
    close(jaroDistance("abcd", "abc"), 0.9166666666666666);
    close(jaroDistance("kitten", "sitting"), 0.746031746031746);
    close(jaroDistance("receive", "recieve"), 0.9523809523809524);
    close(jaroDistance("shwo", "show"), 0.9166666666666666);
    close(jaroDistance("ab", "ba"), 0);
  });

  it("is symmetric to argument order (Ruby swaps internally)", () => {
    close(jaroDistance("DIXON", "DICKSONX"), jaroDistance("DICKSONX", "DIXON"));
    close(jaroDistance("foo", "fooo"), jaroDistance("fooo", "foo"));
  });

  it("treats accented characters as single codepoints", () => {
    close(jaroDistance("café", "cafe"), 0.8333333333333334);
    expect(jaroDistance("café", "café")).toBe(1);
  });
});

describe("jaroWinklerDistance", () => {
  it("equals Jaro distance when Jaro <= 0.7", () => {
    expect(jaroWinklerDistance("foo", "qux")).toBe(0);
    close(jaroWinklerDistance("kitten", "sitting"), 0.746031746031746);
    // kitten/sitting share no prefix, so JW == Jaro even above the threshold.
  });

  it("applies a prefix bonus when Jaro > 0.7", () => {
    close(jaroWinklerDistance("MARTHA", "MARHTA"), 0.9611111111111111);
    close(jaroWinklerDistance("DIXON", "DICKSONX"), 0.8133333333333332);
    close(jaroWinklerDistance("foo", "fooo"), 0.9416666666666667);
    close(jaroWinklerDistance("foo", "fobr"), 0.7777777777777778);
    close(jaroWinklerDistance("abc", "abcd"), 0.9416666666666667);
    close(jaroWinklerDistance("receive", "recieve"), 0.9666666666666667);
    close(jaroWinklerDistance("shwo", "show"), 0.9333333333333332);
    close(jaroWinklerDistance("café", "cafe"), 0.8833333333333334);
  });

  it("caps prefix bonus at 4 codepoints", () => {
    // JELLYFISH/SMELLYFISH share no common prefix → no bonus.
    close(jaroWinklerDistance("JELLYFISH", "SMELLYFISH"), 0.8962962962962963);
  });
});
