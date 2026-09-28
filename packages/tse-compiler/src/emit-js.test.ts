import { describe, it, expect } from "vitest";
import { compileJs } from "./emit-js.js";

describe("compileJs", () => {
  it("emits a render function with the Rails-shaped dispatch", () => {
    const { code } = compileJs("<h1><%= name %></h1>");
    expect(code).toBe(
      [
        "export default function render(context, locals) { const _ob = context.outputBuffer;" +
          ' _ob.safeAppend("<h1>"); _ob.append( name ); _ob.safeAppend("</h1>");',
        "return _ob;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("emits each template line's code on the same line of the compiled source", () => {
    const { code } = compileJs("first line\n<%= boom() %>\n<% if (x) { %>\n<% } %>last\n");
    const lines = code.split("\n");
    expect(lines[1]).toContain("_ob.append( boom() );");
    expect(lines[2]).toContain("if (x) {");
    expect(lines[3]).toContain('_ob.safeAppend("last\\n");');
  });

  it("keeps a tag body's newline-crossing whitespace on the template's lines", () => {
    const { code } = compileJs("<%=\n  boom()\n%>after\n");
    const lines = code.split("\n");
    expect(lines[0]).toMatch(/_ob\.append\($/);
    expect(lines[1]).toBe("  boom()");
    expect(lines[2]).toContain('); _ob.safeAppend("after\\n");');
  });

  it("dispatches expression sites by escape mode and indicator", () => {
    expect(compileJs("<%= n %>").code).toContain("_ob.append( n );");
    expect(compileJs("<%= n %>", { escapeIgnore: true }).code).toContain(
      "_ob.safeExprAppend( n );",
    );
    expect(compileJs("<%== n %>").code).toContain("_ob.safeExprAppend( n );");
    expect(compileJs("<% const x = 1 %>").code).toContain(" const x = 1 ;");
  });

  it("awaits top-level expression sites of an async render, but not inside a function", () => {
    const { code } = compileJs(
      "<% if (x) { %><%= yield %><% } %><% items.forEach((i) => { %><%= i %><% }) %><%== y %>",
      { async: true },
    );
    expect(code).toContain("export default async function render(context, locals) {");
    expect(code).toContain("_ob.append(await ( (await yield) ));");
    expect(code).toContain("_ob.append( i );");
    expect(code).toContain("_ob.safeExprAppend(await ( y ));");
  });

  it("does not count braces inside string literals when deciding what an async render awaits", () => {
    const { code } = compileJs('<% const s = "a{b"; const t = `}`; %><%= yield %>', {
      async: true,
    });
    expect(code).toContain("_ob.append(await ( (await yield) ));");
  });

  it("awaits a flow read at the read, whatever expression surrounds it", () => {
    const { code } = compileJs(
      '<%= _layoutFor("unknown") || "." %><% if (isContentFor("a")) { %><%= contentFor("a").length %><% } %>',
      { async: true },
    );
    expect(code).toContain('_ob.append(await ( (await _layoutFor("unknown")) || "." ));');
    expect(code).toContain('if ((await isContentFor("a"))) {');
    expect(code).toContain('_ob.append(await ( (await contentFor("a")).length ));');
  });

  it("does not await a flow read inside a function literal of an async render", () => {
    const { code } = compileJs('<%= items.map((i) => contentFor(i)).join(_layoutFor("s")) %>', {
      async: true,
    });
    expect(code).toContain(
      '_ob.append(await ( items.map((i) => contentFor(i)).join((await _layoutFor("s"))) ));',
    );
  });

  it("does not count braces inside regex literals when deciding what an async render awaits", () => {
    const { code } = compileJs("<% const re = /}/; %><%= yield %>", { async: true });
    expect(code).toContain("_ob.append(await ( (await yield) ));");
  });

  it("does not count braces inside regex literals when closing a block-expr", () => {
    const src = "<%= forEach(items, (item) => { %><% const re = /{/; %><%= item %><% }) %>after";
    const { code } = compileJs(src);
    expect(code).toContain('_ob.safeAppend("after");');
  });

  it("emits block-expr with capture wrapper so inner writes go to capture buffer", () => {
    const src = "<%= forEach(items, (item) => { %><li><%= item %></li><% }) %>";
    const { code } = compileJs(src);
    expect(code).toBe(
      [
        "export default function render(context, locals) { const _ob = context.outputBuffer;" +
          " _ob.append( forEach(items, (item) => { " +
          ' context.outputBuffer.safeAppend("<li>"); context.outputBuffer.append( item );' +
          ' context.outputBuffer.safeAppend("</li>");  }) );',
        "return _ob;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("handles nested block expressions", () => {
    const src = "<%= outer((x) => { %><%= inner((y) => { %><% }) %><% }) %>";
    const { code } = compileJs(src);
    expect(code).toContain("_ob.append( outer((x) =>");
    expect(code).toContain("context.outputBuffer.append( inner((y) =>");
    expect(code.split("}) );")).toHaveLength(3);
  });

  it("does not close blockExpr on inner code braces", () => {
    const src = "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } %><% }) %>";
    const { code } = compileJs(src);
    expect(code).toContain("_ob.append( forEach(items, (item) =>");
    expect(code).toContain("if (x) {");
    expect(code.split("}) );")).toHaveLength(2);
  });

  it("tracks } else { as net-zero brace delta so the blockExpr closer is recognised", () => {
    const src =
      "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } else { %><%= other %><% } %><% }) %>";
    const { code } = compileJs(src);
    expect(code).toContain("_ob.append( forEach(items, (item) =>");
    expect(code.split("}) );")).toHaveLength(2);
  });

  it("closes correctly when the blockExpr has no wrapping helper call (zero callExpr parens)", () => {
    const src = "<%= (x) => { %><span><%= x %></span><% } %>";
    const { code } = compileJs(src);
    expect(code).toContain("_ob.append( (x) =>");
    expect(code).not.toContain("context.capture");
    expect(code).toContain("} );");
  });

  it("throws a clear error for function-form blockExpr (arrow syntax required)", () => {
    expect(() => compileJs("<%= helper(function(x) { %><li><%= x %></li><% }) %>")).toThrow(
      /block-expr.*arrow syntax/,
    );
  });

  it("throws a clear error when a blockExpr is never closed", () => {
    expect(() => compileJs("<%= forEach(items, (item) => { %>missing closer")).toThrow(
      /block-expr.*never closed/,
    );
  });

  it("respects escapeIgnore for block-expr", () => {
    const src = "<%= fn((x) => { %><% }) %>";
    const { code } = compileJs(src, { escapeIgnore: true });
    expect(code).toContain("_ob.safeExprAppend( fn((x) =>");
    expect(code).toContain("}) );");
  });

  describe("strict locals", () => {
    it("leaves the locals signature to ActionView::Template", () => {
      const { code, localsSignature } = compileJs("<%# locals: (count: 0) %><%= count %>");
      expect(localsSignature).toBe("count: 0");
      expect(code).not.toContain("StrictLocalsError");
      expect(code).not.toContain("import ");
      expect(code).not.toContain("= locals");
    });
  });

  describe("source map", () => {
    it("emits one mapping per output line for a multi-line code tag", () => {
      const src = "before\n<%\nconst a = 1;\nconst b = 2;\n%>after";
      const { code, sourceMap } = compileJs(src, {
        fileName: "t.tse.js",
        sourceFileName: "t.tse",
      });
      expect(sourceMap).not.toBeNull();
      const codeLines = code.split("\n");
      const segs = sourceMap!.mappings.split(";");
      const genLineA = codeLines.findIndex((l) => l.includes("const a = 1;"));
      const genLineB = codeLines.findIndex((l) => l.includes("const b = 2;"));
      expect(genLineA).toBeGreaterThan(-1);
      expect(genLineB).toBe(genLineA + 1);
      expect(segs.length).toBeGreaterThan(genLineB);
      expect(segs[genLineA]).toBeTruthy();
      expect(segs[genLineB]).toBeTruthy();
    });

    it("maps each code-tag output line to its actual source line (not the opener line)", () => {
      const src = "<%\nconst x = 1;\nconst y = 2;\n%>";
      const { code, sourceMap } = compileJs(src, {
        fileName: "t.tse.js",
        sourceFileName: "t.tse",
      });
      expect(sourceMap).not.toBeNull();
      const codeLines = code.split("\n");
      const segs = sourceMap!.mappings.split(";");
      const genLineX = codeLines.findIndex((l) => l.includes("const x = 1;"));
      const genLineY = codeLines.findIndex((l) => l.includes("const y = 2;"));
      expect(segs[genLineX]).toBe("AACA");
      expect(segs[genLineY]).toBe("AACA");
    });
  });

  describe("preamble / postamble", () => {
    it("emits preamble immediately after const _ob line", () => {
      const { code } = compileJs("<p>hi</p>", {
        preamble: "_ob.safeAppend('<!-- BEGIN -->');",
        postamble: "_ob.safeAppend('<!-- END -->');",
      });
      expect(code).toContain("const _ob = context.outputBuffer; _ob.safeAppend('<!-- BEGIN -->');");
    });

    it("emits postamble immediately before return _ob", () => {
      const { code } = compileJs("<p>hi</p>", {
        preamble: "_ob.safeAppend('<!-- BEGIN -->');",
        postamble: "_ob.safeAppend('<!-- END -->');",
      });
      expect(code).toContain("_ob.safeAppend('<!-- END -->'); return _ob;");
    });

    it("emits nothing extra when preamble/postamble are omitted", () => {
      const { code } = compileJs("<p>hi</p>");
      expect(code).not.toContain("BEGIN");
      expect(code).not.toContain("END");
    });
  });
});
