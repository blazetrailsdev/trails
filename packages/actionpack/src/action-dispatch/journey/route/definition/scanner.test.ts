import { describe, it, expect } from "vitest";
import { Scanner, type Token } from "../../scanner.js";

function tokens(pattern: string): Token[] {
  const s = new Scanner();
  s.scanSetup(pattern);
  const out: Token[] = [];
  let t: Token | null;
  while ((t = s.nextToken()) !== null) out.push(t);
  return out;
}

describe("ActionDispatch::Journey::Scanner", () => {
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

  for (const [pattern, expected] of CASES) {
    it(`Scanning \`${pattern}\``, () => {
      expect(tokens(pattern)).toEqual(expected);
    });
  }

  it("lastString and lastLiteral expose the last scanned text", () => {
    const s = new Scanner();
    s.scanSetup("/page\\:foo");
    s.nextToken(); // SLASH
    s.nextToken(); // LITERAL (page\:foo)
    expect(s.lastString()).toBe("page\\:foo");
    expect(s.lastLiteral()).toBe("page:foo");
  });

  it("nextToken returns null at end", () => {
    const s = new Scanner();
    s.scanSetup("/");
    expect(s.nextToken()).toBe("SLASH");
    expect(s.nextToken()).toBeNull();
  });
});
