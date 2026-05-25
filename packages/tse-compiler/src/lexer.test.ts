import { describe, it, expect } from "vitest";
import { tokenize, TseSyntaxError } from "./lexer.js";

describe("tokenize", () => {
  it("splits text and recognizes every tag indicator", () => {
    const t = tokenize("a<% x %>b<%= e %><%== r %><%# c %><%! types: T !%>");
    expect(t.map((x) => x.kind)).toEqual([
      "text",
      "code",
      "text",
      "expr",
      "rawExpr",
      "comment",
      "typesMagic",
    ]);
  });

  it("honors <%- and -%> trim modes and <%% / %%> literals", () => {
    const left = tokenize("a\n   <%- x %>b");
    expect(left[0].value).toBe("a\n");
    expect(left[1].trimLeft).toBe(true);
    const right = tokenize("<% x -%>   \nb");
    expect(right[1].value).toBe("b");
    expect(tokenize("<%% %%>")[0].value).toBe("<% %>");
  });

  it("throws on unterminated tags", () => {
    expect(() => tokenize("<% never closed")).toThrow(TseSyntaxError);
    expect(() => tokenize("<%! never closed")).toThrow(TseSyntaxError);
  });

  it("classifies block-expr tags as blockExpr, not expr", () => {
    expect(tokenize("<%= forEach(items, (item) => { %>")[0].kind).toBe("blockExpr");
    expect(tokenize("<%= items.map((x) => { %>")[0].kind).toBe("blockExpr");
    expect(tokenize("<%= fn(x) do %>")[0].kind).toBe("blockExpr");
    expect(tokenize("<%= fn(x) do |y| %>")[0].kind).toBe("blockExpr");
    expect(tokenize("<%= fn() { |x| %>")[0].kind).toBe("blockExpr");
  });

  it("keeps plain expressions as expr", () => {
    expect(tokenize("<%= name %>")[0].kind).toBe("expr");
    expect(tokenize("<%= x + 1 %>")[0].kind).toBe("expr");
  });
});
