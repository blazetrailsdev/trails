import { describe, expect, it } from "vitest";

import { Tokenizer } from "./tokenizer.js";

describe("Crass::Tokenizer", () => {
  it("reads a bad url as consume_url / consume_bad_url do", () => {
    expect(Tokenizer.tokenize('url(a b"c)')[0]).toMatchObject({ error: true, value: "a bc" });
    expect(Tokenizer.tokenize('url(\\41 "x)')[0]).toMatchObject({ error: true, value: "Ax" });
    const bad = Tokenizer.tokenize("url(a b\\41 c)")[0];
    expect(bad).toMatchObject({ node: "bad_url", value: "abAc" });
    expect(bad).not.toHaveProperty("error");
  });

  it("keeps the IE * hack on a function token", () => {
    expect(Tokenizer.tokenize("*zoom(", { preserveHacks: true })[0]).toEqual({
      node: "function",
      pos: 0,
      raw: "*zoom(",
      value: "zoom",
    });
  });
});
