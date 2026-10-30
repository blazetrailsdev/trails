import { describe, expect, it } from "vitest";
import { Chars } from "./multibyte/chars.js";

describe("Mail::Multibyte::Chars", () => {
  it("should upcase", () => {
    const chars = new Chars("Laurent, où sont les tests ?");
    expect(chars.upcase().toS()).toEqual("LAURENT, OÙ SONT LES TESTS ?");
  });

  it("should downcase", () => {
    const chars = new Chars("VĚDA A VÝZKUM");
    expect(chars.downcase().toS()).toEqual("věda a výzkum");
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either"
  it.skip("doesn't mutate input string encoding", () => {});
});
