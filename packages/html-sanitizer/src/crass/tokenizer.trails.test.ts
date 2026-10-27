import { describe, expect, it } from "vitest";
import { Tokenizer } from "./tokenizer.js";

describe("Crass::Tokenizer", () => {
  it("tokenizes a{color:red}", () => {
    expect(Tokenizer.tokenize("a{color:red}", { preserveComments: true })).toEqual([
      { node: "ident", pos: 0, raw: "a", value: "a" },
      { node: "{", pos: 1, raw: "{" },
      { node: "ident", pos: 2, raw: "color", value: "color" },
      { node: "colon", pos: 7, raw: ":" },
      { node: "ident", pos: 8, raw: "red", value: "red" },
      { node: "}", pos: 11, raw: "}" },
    ]);
  });
  it('tokenizes #foo .5em -x 10% U+0-7F url( x.png ) /*c*/ "s\\41"', () => {
    expect(
      Tokenizer.tokenize('#foo .5em -x 10% U+0-7F url( x.png ) /*c*/ "s\\41"', {
        preserveComments: true,
      }),
    ).toEqual([
      { node: "hash", pos: 0, raw: "#foo", type: "id", value: "foo" },
      { node: "whitespace", pos: 4, raw: " " },
      {
        node: "dimension",
        pos: 5,
        raw: ".5em",
        repr: ".5",
        type: "number",
        unit: "em",
        value: 0.5,
      },
      { node: "whitespace", pos: 9, raw: " " },
      { node: "ident", pos: 10, raw: "-x", value: "-x" },
      { node: "whitespace", pos: 12, raw: " " },
      { node: "percentage", pos: 13, raw: "10%", repr: "10", type: "integer", value: 10 },
      { node: "whitespace", pos: 16, raw: " " },
      { node: "unicode_range", pos: 17, raw: "U+0-7F", start: 0, end: 127 },
      { node: "whitespace", pos: 23, raw: " " },
      { node: "url", pos: 24, raw: "url( x.png )", value: "x.png" },
      { node: "whitespace", pos: 36, raw: " " },
      { node: "comment", pos: 37, raw: "/*c*/", value: "c" },
      { node: "whitespace", pos: 42, raw: " " },
      { node: "string", pos: 43, raw: '"s\\41"', value: "sA" },
    ]);
  });
  it("tokenizes @media <!-- --> |= ~= ^= $= *= ||", () => {
    expect(
      Tokenizer.tokenize("@media <!-- --> |= ~= ^= $= *= ||", { preserveComments: true }),
    ).toEqual([
      { node: "at_keyword", pos: 0, raw: "@media", value: "media" },
      { node: "whitespace", pos: 6, raw: " " },
      { node: "cdo", pos: 7, raw: "<!--" },
      { node: "whitespace", pos: 11, raw: " " },
      { node: "cdc", pos: 12, raw: "-->" },
      { node: "whitespace", pos: 15, raw: " " },
      { node: "dash_match", pos: 16, raw: "|=" },
      { node: "whitespace", pos: 18, raw: " " },
      { node: "include_match", pos: 19, raw: "~=" },
      { node: "whitespace", pos: 21, raw: " " },
      { node: "prefix_match", pos: 22, raw: "^=" },
      { node: "whitespace", pos: 24, raw: " " },
      { node: "suffix_match", pos: 25, raw: "$=" },
      { node: "whitespace", pos: 27, raw: " " },
      { node: "substring_match", pos: 28, raw: "*=" },
      { node: "whitespace", pos: 30, raw: " " },
      { node: "column", pos: 31, raw: "||" },
    ]);
  });
  it('tokenizes 1e3 +.5 -0 url("q") bad\nstr"x\ny', () => {
    expect(
      Tokenizer.tokenize('1e3 +.5 -0 url("q") bad\nstr"x\ny', { preserveComments: true }),
    ).toEqual([
      { node: "number", pos: 0, raw: "1e3", repr: "1e3", type: "number", value: 1000.0 },
      { node: "whitespace", pos: 3, raw: " " },
      { node: "number", pos: 4, raw: "+.5", repr: "+.5", type: "number", value: 0.5 },
      { node: "whitespace", pos: 7, raw: " " },
      { node: "number", pos: 8, raw: "-0", repr: "-0", type: "integer", value: 0 },
      { node: "whitespace", pos: 10, raw: " " },
      { node: "function", pos: 11, raw: "url(", value: "url" },
      { node: "string", pos: 15, raw: '"q"', value: "q" },
      { node: ")", pos: 18, raw: ")" },
      { node: "whitespace", pos: 19, raw: " " },
      { node: "ident", pos: 20, raw: "bad", value: "bad" },
      { node: "whitespace", pos: 23, raw: "\n" },
      { node: "ident", pos: 24, raw: "str", value: "str" },
      { node: "bad_string", pos: 27, raw: '"x', error: true, value: "x" },
      { node: "whitespace", pos: 29, raw: "\n" },
      { node: "ident", pos: 30, raw: "y", value: "y" },
    ]);
  });
  it('tokenizes u+4?? url(a"b) \\ x/*open', () => {
    expect(Tokenizer.tokenize('u+4?? url(a"b) \\ x/*open', { preserveComments: true })).toEqual([
      { node: "unicode_range", pos: 0, raw: "u+4??", start: 1024, end: 1279 },
      { node: "whitespace", pos: 5, raw: " " },
      { node: "bad_url", pos: 6, raw: 'url(a"b)', error: true, value: "ab" },
      { node: "whitespace", pos: 14, raw: " " },
      { node: "ident", pos: 15, raw: "\\ x", value: " x" },
      { node: "comment", pos: 18, raw: "/*open", value: "open" },
    ]);
  });
});
