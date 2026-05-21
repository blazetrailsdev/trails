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
});
