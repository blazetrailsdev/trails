import { beforeEach, describe, expect, it } from "vitest";

import { Tokenizer } from "./tokenizer.js";

describe("Nokogiri::CSS::TestTokenizer", () => {
  let scanner: Tokenizer;

  beforeEach(() => {
    scanner = new Tokenizer();
  });

  function assertTokens(tokens: [string, string][]) {
    const toks: [string, string][] = [];
    let tok: [string, string] | undefined;
    while ((tok = scanner.nextToken())) toks.push(tok);
    expect(toks).toEqual(tokens);
  }

  it("has", () => {
    scanner.scanSetup("a:has(b)");
    assertTokens([
      ["IDENT", "a"],
      [":", ":"],
      ["HAS", "has("],
      ["IDENT", "b"],
      ["RPAREN", ")"],
    ]);
  });

  it("unicode", () => {
    scanner.scanSetup("a日本語");
    assertTokens([["IDENT", "a日本語"]]);
  });

  it("tokenize bad single quote", () => {
    scanner.scanSetup("'");
    assertTokens([["'", "'"]]);
  });

  it("not equal", () => {
    scanner.scanSetup("h1[a!='Tender Lovemaking']");
    assertTokens([
      ["IDENT", "h1"],
      ["LSQUARE", "["],
      ["IDENT", "a"],
      ["NOT_EQUAL", "!="],
      ["STRING", "'Tender Lovemaking'"],
      ["RSQUARE", "]"],
    ]);
  });

  it("negation", () => {
    scanner.scanSetup("p:not(.a)");
    assertTokens([
      ["IDENT", "p"],
      ["NOT", ":not("],
      [".", "."],
      ["IDENT", "a"],
      ["RPAREN", ")"],
    ]);
  });

  it("function", () => {
    scanner.scanSetup("script comment()");
    assertTokens([
      ["IDENT", "script"],
      ["S", " "],
      ["FUNCTION", "comment("],
      ["RPAREN", ")"],
    ]);
  });

  it("preceding selector", () => {
    scanner.scanSetup("E ~ F");
    assertTokens([
      ["IDENT", "E"],
      ["TILDE", " ~ "],
      ["IDENT", "F"],
    ]);
  });

  it("scan attribute string", () => {
    scanner.scanSetup("h1[a='Tender Lovemaking']");
    assertTokens([
      ["IDENT", "h1"],
      ["LSQUARE", "["],
      ["IDENT", "a"],
      ["EQUAL", "="],
      ["STRING", "'Tender Lovemaking'"],
      ["RSQUARE", "]"],
    ]);
    scanner.scanSetup('h1[a="Tender Lovemaking"]');
    assertTokens([
      ["IDENT", "h1"],
      ["LSQUARE", "["],
      ["IDENT", "a"],
      ["EQUAL", "="],
      ["STRING", '"Tender Lovemaking"'],
      ["RSQUARE", "]"],
    ]);
  });

  it("scan id", () => {
    scanner.scanSetup("#foo");
    assertTokens([["HASH", "#foo"]]);
  });

  it("scan pseudo", () => {
    scanner.scanSetup("a:visited");
    assertTokens([
      ["IDENT", "a"],
      [":", ":"],
      ["IDENT", "visited"],
    ]);
  });

  it("scan star", () => {
    scanner.scanSetup("*");
    assertTokens([["*", "*"]]);
  });

  it("scan class", () => {
    scanner.scanSetup("x.awesome");
    assertTokens([
      ["IDENT", "x"],
      [".", "."],
      ["IDENT", "awesome"],
    ]);
  });

  it("scan greater", () => {
    scanner.scanSetup("x > y");
    assertTokens([
      ["IDENT", "x"],
      ["GREATER", " > "],
      ["IDENT", "y"],
    ]);
  });

  it("scan slash", () => {
    scanner.scanSetup("x/y");
    assertTokens([
      ["IDENT", "x"],
      ["SLASH", "/"],
      ["IDENT", "y"],
    ]);
  });

  it("scan doubleslash", () => {
    scanner.scanSetup("x//y");
    assertTokens([
      ["IDENT", "x"],
      ["DOUBLESLASH", "//"],
      ["IDENT", "y"],
    ]);
  });

  it("scan function selector", () => {
    scanner.scanSetup("x:eq(0)");
    assertTokens([
      ["IDENT", "x"],
      [":", ":"],
      ["FUNCTION", "eq("],
      ["NUMBER", "0"],
      ["RPAREN", ")"],
    ]);
  });

  it("scan nth", () => {
    scanner.scanSetup("x:nth-child(5n+3)");
    assertTokens([
      ["IDENT", "x"],
      [":", ":"],
      ["FUNCTION", "nth-child("],
      ["NUMBER", "5"],
      ["IDENT", "n"],
      ["PLUS", "+"],
      ["NUMBER", "3"],
      ["RPAREN", ")"],
    ]);

    scanner.scanSetup("x:nth-child(5n + 3)");
    assertTokens([
      ["IDENT", "x"],
      [":", ":"],
      ["FUNCTION", "nth-child("],
      ["NUMBER", "5"],
      ["IDENT", "n"],
      ["PLUS", " + "],
      ["NUMBER", "3"],
      ["RPAREN", ")"],
    ]);

    scanner.scanSetup("x:nth-child(-1n+3)");
    assertTokens([
      ["IDENT", "x"],
      [":", ":"],
      ["FUNCTION", "nth-child("],
      ["NUMBER", "-1"],
      ["IDENT", "n"],
      ["PLUS", "+"],
      ["NUMBER", "3"],
      ["RPAREN", ")"],
    ]);

    scanner.scanSetup("x:nth-child(-n+3)");
    assertTokens([
      ["IDENT", "x"],
      [":", ":"],
      ["FUNCTION", "nth-child("],
      ["IDENT", "-n"],
      ["PLUS", "+"],
      ["NUMBER", "3"],
      ["RPAREN", ")"],
    ]);
  });

  it("significant space", () => {
    scanner.scanSetup("x :first-child [a] [b]");
    assertTokens([
      ["IDENT", "x"],
      ["S", " "],
      [":", ":"],
      ["IDENT", "first-child"],
      ["S", " "],
      ["LSQUARE", "["],
      ["IDENT", "a"],
      ["RSQUARE", "]"],
      ["S", " "],
      ["LSQUARE", "["],
      ["IDENT", "b"],
      ["RSQUARE", "]"],
    ]);
  });

  it("xpath attributes", () => {
    scanner.scanSetup("a/@href");
    assertTokens([
      ["IDENT", "a"],
      ["SLASH", "/"],
      ["@", "@"],
      ["IDENT", "href"],
    ]);
  });

  it("xpath functions", () => {
    scanner.scanSetup("a/text()");
    assertTokens([
      ["IDENT", "a"],
      ["SLASH", "/"],
      ["FUNCTION", "text("],
      ["RPAREN", ")"],
    ]);
  });
});
