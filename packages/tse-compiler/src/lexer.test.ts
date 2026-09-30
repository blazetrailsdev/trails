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
    expect(left[0].value).toBe("a\n   ");
    expect(left[1].kind).toBe("code");
    const right = tokenize("<% x -%>   \nb");
    expect(right[1].value).toBe("b");
    const literal = (source: string): string[] => tokenize(source).map((t) => t.value);
    expect(literal("<%% %%>")).toEqual(["<% %%>"]);
    expect(literal("a<%% x %>b %%> <%%= y %>\n")).toEqual(["a<% x %>b %%> <%= y %>\n"]);
    expect(literal("  <%% x %>  \nz")).toEqual(["  <% x %>  \nz"]);
    expect(literal("a\n  <%% x -%>\nb")).toEqual(["a\n  <% x -%>\nb"]);
    expect(literal("<%%= a =%>\nb")).toEqual(["<%= a =%>\nb"]);
    expect(literal("x <%% y %> \nz")).toEqual(["x <% y %> \nz"]);
    expect(literal("<%% a %><%% b %>\n")).toEqual(["<% a %><% b %>\n"]);
    expect(tokenize("<%% a %>\n  <% x %>\nq").map((t) => t.value)).toEqual([
      "<% a %>\n",
      " x ",
      "q",
    ]);
    expect(tokenize("<%% a %>  <% x %>\nq").map((t) => t.value)).toEqual([
      "<% a %>  ",
      " x ",
      "\nq",
    ]);
  });

  it("trims like Erubi's trim: true", () => {
    const render = (source: string, trim?: boolean): string =>
      tokenize(source, trim)
        .map((t) => (t.kind === "text" ? t.value : t.kind === "expr" ? `{${t.value.trim()}}` : ""))
        .join("");
    expect(render("<% if (x) { %>\n  hi\n<% } %>\n")).toBe("  hi\n");
    expect(render("  <%# c %>\nq")).toBe("q");
    expect(render("a <% x %>\nb")).toBe("a \nb");
    expect(render("Yes, <%- }) -%>\n")).toBe("Yes, \n");
    expect(render("<%= y -%>\nz")).toBe("{y}z");
    expect(render("<%= y %>\nz")).toBe("{y}\nz");
    expect(render("  <% x %>\nq", false)).toBe("  \nq");
    expect(tokenize("<%-= x %>")[0]).toMatchObject({ kind: "code", value: "= x " });
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

  it("srcLine tracks through escape sequences", () => {
    expect(tokenize("hello<%%world\nsecond<%= x %>")).toEqual([
      { kind: "text", value: "hello<%world\nsecond<%= x %>", srcLine: 0 },
    ]);
    const t = tokenize("hello<%% world %>\nsecond<%= x %>");
    expect(t[0].kind).toBe("text");
    expect(t[0].value).toBe("hello<% world %>\nsecond");
    expect(t[0].srcLine).toBe(0);
    expect(t[1].kind).toBe("expr");
    expect(t[1].srcLine).toBe(1);
  });
});
