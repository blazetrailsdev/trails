import { describe, it, expect, beforeEach } from "vitest";
import { Scanner, type Token } from "../../scanner.js";

describe("ActionDispatch::Journey::Scanner", () => {
  let scanner: Scanner;

  beforeEach(() => {
    scanner = new Scanner();
  });

  const CASES: Array<[string, Token[]]> = [
    ["/", ["SLASH"]],
    ["*omg", ["STAR"]],
    ["/page", ["SLASH", "LITERAL"]],
    ["/page!", ["SLASH", "LITERAL"]],
    ["/page$", ["SLASH", "LITERAL"]],
    ["/page&", ["SLASH", "LITERAL"]],
    ["/page'", ["SLASH", "LITERAL"]],
    ["/page*", ["SLASH", "LITERAL"]],
    ["/page+", ["SLASH", "LITERAL"]],
    ["/page,", ["SLASH", "LITERAL"]],
    ["/page;", ["SLASH", "LITERAL"]],
    ["/page=", ["SLASH", "LITERAL"]],
    ["/page@", ["SLASH", "LITERAL"]],
    ["/page\\:", ["SLASH", "LITERAL"]],
    ["/page\\(", ["SLASH", "LITERAL"]],
    ["/page\\)", ["SLASH", "LITERAL"]],
    ["/~page", ["SLASH", "LITERAL"]],
    ["/pa-ge", ["SLASH", "LITERAL"]],
    ["/:page", ["SLASH", "SYMBOL"]],
    ["/:page|*foo", ["SLASH", "SYMBOL", "OR", "STAR"]],
    ["/(:page)", ["SLASH", "LPAREN", "SYMBOL", "RPAREN"]],
    ["(/:action)", ["LPAREN", "SLASH", "SYMBOL", "RPAREN"]],
    ["(())", ["LPAREN", "LPAREN", "RPAREN", "RPAREN"]],
    ["(.:format)", ["LPAREN", "DOT", "SYMBOL", "RPAREN"]],
    ["/sort::sort", ["SLASH", "LITERAL", "LITERAL", "SYMBOL"]],
  ];

  function assertTokens(expectedTokens: Token[], scanner: Scanner, pattern: string): void {
    const actualTokens: Token[] = [];
    let token: Token | null;
    while ((token = scanner.nextToken()) !== null) {
      actualTokens.push(token);
    }
    expect(actualTokens, `Wrong tokens for \`${pattern}\``).toEqual(expectedTokens);
  }

  for (const [pattern, expectedTokens] of CASES) {
    it(`Scanning \`${pattern}\``, () => {
      scanner.scanSetup(pattern);
      assertTokens(expectedTokens, scanner, pattern);
    });
  }
});
