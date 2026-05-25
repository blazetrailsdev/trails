import { describe, it, expect } from "vitest";
import { compileJs } from "./emit-js.js";

describe("compileJs", () => {
  it("emits a render function with the Rails-shaped dispatch", () => {
    const { code } = compileJs("<h1><%= name %></h1>");
    expect(code).toBe(
      [
        "export default function render(context, locals) {",
        "  const _ob = context.outputBuffer;",
        '  _ob.safeAppend("<h1>");',
        "  _ob.append(name);",
        '  _ob.safeAppend("</h1>");',
        "  return _ob;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("dispatches expression sites by escape mode and indicator", () => {
    expect(compileJs("<%= n %>").code).toContain("_ob.append(n);");
    expect(compileJs("<%= n %>", { escapeIgnore: true }).code).toContain("_ob.safeExprAppend(n);");
    expect(compileJs("<%== n %>").code).toContain("_ob.safeExprAppend(n);");
    expect(compileJs("<% const x = 1 %>").code).toContain("const x = 1;");
  });

  it("emits block-expr without closing paren, closed by matching code closer", () => {
    // `_ob.append(` stays open; `})` from template closes arrow body + forEach;
    // emitter appends `);` to close the append call → `}));`
    const src = "<%= forEach(items, (item) => { %><li><%= item %></li><% }) %>";
    const { code } = compileJs(src);
    expect(code).toBe(
      [
        "export default function render(context, locals) {",
        "  const _ob = context.outputBuffer;",
        "  _ob.append(forEach(items, (item) => {",
        '  _ob.safeAppend("<li>");',
        "  _ob.append(item);",
        '  _ob.safeAppend("</li>");',
        "  }));",
        "  return _ob;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("handles nested block expressions", () => {
    const src = "<%= outer((x) => { %><%= inner((y) => { %><% }) %><% }) %>";
    const { code } = compileJs(src);
    const lines = code.split("\n");
    expect(lines).toContain("  _ob.append(outer((x) => {");
    expect(lines).toContain("  _ob.append(inner((y) => {");
    expect(lines.filter((l) => l === "  }));")).toHaveLength(2);
  });

  it("does not close blockExpr on inner code braces", () => {
    // `<% if (x) { %>...<% } %>` inside a blockExpr body must not consume the
    // blockExpr closer — the inner `}` increments/decrements innerDepth only.
    const src = "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } %><% }) %>";
    const { code } = compileJs(src);
    const lines = code.split("\n");
    expect(lines).toContain("  _ob.append(forEach(items, (item) => {");
    expect(lines.some((l) => l.includes("if (x) {"))).toBe(true);
    expect(lines).toContain("  }));");
    expect(lines.filter((l) => l === "  }));")).toHaveLength(1);
  });

  it("tracks } else { as net-zero brace delta so the blockExpr closer is recognised", () => {
    const src =
      "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } else { %><%= other %><% } %><% }) %>";
    const { code } = compileJs(src);
    const lines = code.split("\n");
    expect(lines).toContain("  _ob.append(forEach(items, (item) => {");
    expect(lines.filter((l) => l === "  }));")).toHaveLength(1);
  });

  it("throws a clear error when a blockExpr is never closed", () => {
    expect(() => compileJs("<%= forEach(items, (item) => { %>missing closer")).toThrow(
      /block-expr.*never closed/,
    );
  });

  it("respects escapeIgnore for block-expr", () => {
    const src = "<%= fn((x) => { %><% }) %>";
    const { code } = compileJs(src, { escapeIgnore: true });
    expect(code).toContain("_ob.safeExprAppend(fn((x) => {");
    expect(code).toContain("}));");
  });

  describe("preamble / postamble", () => {
    it("emits preamble immediately after const _ob line", () => {
      const { code } = compileJs("<p>hi</p>", {
        preamble: "_ob.safeAppend('<!-- BEGIN -->');",
        postamble: "_ob.safeAppend('<!-- END -->');",
      });
      const lines = code.split("\n");
      const obIdx = lines.findIndex((l) => l.includes("const _ob"));
      const preIdx = lines.findIndex((l) => l.includes("<!-- BEGIN -->"));
      expect(preIdx).toBe(obIdx + 1);
    });

    it("emits postamble immediately before return _ob", () => {
      const { code } = compileJs("<p>hi</p>", {
        preamble: "_ob.safeAppend('<!-- BEGIN -->');",
        postamble: "_ob.safeAppend('<!-- END -->');",
      });
      const lines = code.split("\n");
      const postIdx = lines.findIndex((l) => l.includes("<!-- END -->"));
      const returnIdx = lines.findIndex((l) => l.trim() === "return _ob;");
      expect(postIdx).toBe(returnIdx - 1);
    });

    it("emits nothing extra when preamble/postamble are omitted", () => {
      const { code } = compileJs("<p>hi</p>");
      expect(code).not.toContain("BEGIN");
      expect(code).not.toContain("END");
    });
  });
});
