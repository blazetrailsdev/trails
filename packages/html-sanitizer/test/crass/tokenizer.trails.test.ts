import { describe, expect, it } from "vitest";

import { Tokenizer } from "../../lib/crass/tokenizer.js";

describe("Crass::Tokenizer", () => {
  it("marks a \\ that starts no valid escape as an error delim, as tokenizer.rb does", () => {
    expect(Tokenizer.tokenize("a\\\nx")[1]).toEqual({
      node: "delim",
      pos: 1,
      raw: "\\",
      error: true,
      value: "\\",
    });
  });

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

  it("reads digits and url after a non-ASCII code point as one name, as consume_name does", () => {
    expect(Tokenizer.tokenize("\u00d71")).toEqual([
      { node: "ident", pos: 0, raw: "\u00d71", value: "\u00d71" },
    ]);
    expect(Tokenizer.tokenize("\u00d7url(x)")).toEqual([
      { node: "function", pos: 0, raw: "\u00d7url(", value: "\u00d7url" },
      { node: "ident", pos: 5, raw: "x", value: "x" },
      { node: ")", pos: 6, raw: ")" },
    ]);
  });

  it("keeps the IE * hack inside a non-ASCII name, as consume_name does", () => {
    expect(Tokenizer.tokenize("\u00d7*x", { preserveHacks: true })).toEqual([
      { node: "ident", pos: 0, raw: "\u00d7*x", value: "\u00d7x" },
    ]);
    expect(Tokenizer.tokenize("\u00d7\\61*x", { preserveHacks: true })).toEqual([
      { node: "ident", pos: 0, raw: "\u00d7\\61*x", value: "\u00d7ax" },
    ]);
  });

  it("keeps its scanner in step past a bad url and a non-ASCII ident with an escape", () => {
    expect(Tokenizer.tokenize("url(a b\\)c) x")).toEqual([
      { node: "bad_url", pos: 0, raw: "url(a b\\)c)", value: "ab)c" },
      { node: "whitespace", pos: 11, raw: " " },
      { node: "ident", pos: 12, raw: "x", value: "x" },
    ]);
    expect(Tokenizer.tokenize('a:url(a"b) é\\41 c')).toEqual([
      { node: "ident", pos: 0, raw: "a", value: "a" },
      { node: "colon", pos: 1, raw: ":" },
      { node: "bad_url", pos: 2, raw: 'url(a"b)', error: true, value: "ab" },
      { node: "whitespace", pos: 10, raw: " " },
      { node: "ident", pos: 11, raw: "é\\41 c", value: "éAc" },
    ]);
  });

  it("reads a negative zero as 0, as convert_string_to_number's Rationals do", () => {
    const values = Tokenizer.tokenize("-0.0 -0e5 -.0 -0").map((token) => token.value);
    expect(
      values.filter((value) => value !== undefined).map((value) => Object.is(value, -0)),
    ).toEqual([false, false, false, false]);
  });

  it("replaces a lone surrogate with U+FFFD, as preprocess's encode does", () => {
    expect(Tokenizer.tokenize("a\ud800b")[0]).toEqual({
      node: "ident",
      pos: 0,
      raw: "a\ufffdb",
      value: "a\ufffdb",
    });
  });
});
