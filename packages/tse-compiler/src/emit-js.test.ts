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

  it("emits block-expr with capture wrapper so inner writes go to capture buffer", () => {
    // `_ob.append(` and `forEach(` stay open; `context.capture(() => {` wraps
    // inner content so inner writes use `context.outputBuffer` (the swapped buf).
    // `})` from template closes the capture arrow + `context.capture(`.
    // Emitter appends `));` to close `forEach(` and `_ob.append(` → `})));`.
    const src = "<%= forEach(items, (item) => { %><li><%= item %></li><% }) %>";
    const { code } = compileJs(src);
    expect(code).toBe(
      [
        "export default function render(context, locals) {",
        "  const _ob = context.outputBuffer;",
        "  _ob.append(forEach(items, (item) =>",
        "  context.capture(() => {",
        '  context.outputBuffer.safeAppend("<li>");',
        "  context.outputBuffer.append(item);",
        '  context.outputBuffer.safeAppend("</li>");',
        "  })));",
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
    expect(lines).toContain("  _ob.append(outer((x) =>");
    // inner blockExpr uses context.outputBuffer since it is inside outer capture
    expect(lines).toContain("  context.outputBuffer.append(inner((y) =>");
    expect(lines.filter((l) => l === "  })));")).toHaveLength(2);
  });

  it("does not close blockExpr on inner code braces", () => {
    // `<% if (x) { %>...<% } %>` inside a blockExpr body must not consume the
    // blockExpr closer — the inner `}` increments/decrements innerDepth only.
    const src = "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } %><% }) %>";
    const { code } = compileJs(src);
    const lines = code.split("\n");
    expect(lines).toContain("  _ob.append(forEach(items, (item) =>");
    expect(lines.some((l) => l.includes("if (x) {"))).toBe(true);
    expect(lines).toContain("  })));");
    expect(lines.filter((l) => l === "  })));")).toHaveLength(1);
  });

  it("tracks } else { as net-zero brace delta so the blockExpr closer is recognised", () => {
    const src =
      "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } else { %><%= other %><% } %><% }) %>";
    const { code } = compileJs(src);
    const lines = code.split("\n");
    expect(lines).toContain("  _ob.append(forEach(items, (item) =>");
    expect(lines.filter((l) => l === "  })));")).toHaveLength(1);
  });

  it("closes correctly when the blockExpr has no wrapping helper call (zero callExpr parens)", () => {
    // `(x) => {` leaves 0 unclosed parens in callExpr, so only 2 emitter-owned
    // parens need closing (bufRef.append + context.capture), not 3.
    const src = "<%= (x) => { %><span><%= x %></span><% } %>";
    const { code } = compileJs(src);
    const lines = code.split("\n");
    expect(lines).toContain("  _ob.append((x) =>");
    expect(lines).toContain("  context.capture(() => {");
    // Closer `}` has 0 existing `)`, so suffix = "));" → "}))" → "}));"
    expect(lines).toContain("  }));");
  });

  it("throws a clear error for function-form blockExpr (arrow syntax required)", () => {
    // function(x) { cannot be capture-wrapped correctly — the closer only closes
    // context.capture(() => {, leaving the function body { unclosed (invalid JS).
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
    expect(code).toContain("_ob.safeExprAppend(fn((x) =>");
    expect(code).toContain("})));");
  });

  describe("strict locals", () => {
    it("emits locals destructuring with defaults when a locals signature is present", () => {
      const { code } = compileJs('<%# locals: (count: 0, name: "x") %><%= name %>');
      expect(code).toContain('const { count = 0, name = "x" } = locals;');
    });

    it("emits no destructuring when there are no declared locals (empty parens)", () => {
      const { code } = compileJs("<%# locals: () %><p>hi</p>");
      expect(code).not.toContain("const {");
    });

    it("emits a runtime strict-locals check when a locals signature is present", () => {
      const { code } = compileJs("<%# locals: (count:) %><%= count %>");
      expect(code).toContain("StrictLocalsMismatch");
      expect(code).toContain('["count"]');
      expect(code).toContain("__extraKeys");
    });

    it("emits a runtime check for empty locals that rejects any key", () => {
      const { code } = compileJs("<%# locals: () %><p>hi</p>");
      expect(code).toContain("StrictLocalsMismatch");
      expect(code).toContain("__allowedKeys = []");
    });

    it("does not emit a runtime check when no locals signature is present", () => {
      const { code } = compileJs("<p>hi</p>");
      expect(code).not.toContain("StrictLocalsMismatch");
      expect(code).not.toContain("__allowedKeys");
    });

    it("suppresses the runtime check when raiseOnStrictLocalsMismatch is false", () => {
      const { code } = compileJs("<%# locals: (count:) %>", {
        raiseOnStrictLocalsMismatch: false,
      });
      expect(code).not.toContain("StrictLocalsMismatch");
      expect(code).toContain("const { count } = locals;");
    });

    it("imports StrictLocalsMismatch from @blazetrails/actionview/strict-locals", () => {
      const { code } = compileJs("<%# locals: (count:) %>");
      expect(code).toContain(
        'import { StrictLocalsMismatch } from "@blazetrails/actionview/strict-locals";',
      );
    });
  });

  describe("source map", () => {
    it("emits one mapping per output line for a multi-line code tag", () => {
      // `<%` opens on src line 1; value has two code lines on src lines 2-3.
      const src = "before\n<%\nconst a = 1;\nconst b = 2;\n%>after";
      const { code, sourceMap } = compileJs(src, {
        fileName: "t.tse.js",
        sourceFileName: "t.tse",
      });
      expect(sourceMap).not.toBeNull();
      const codeLines = code.split("\n");
      const segs = sourceMap!.mappings.split(";");
      // Find the exact genLines where the code-tag body lands in the output.
      const genLineA = codeLines.findIndex((l) => l.includes("const a = 1;"));
      const genLineB = codeLines.findIndex((l) => l.includes("const b = 2;"));
      expect(genLineA).toBeGreaterThan(-1);
      expect(genLineB).toBe(genLineA + 1);
      // Both output lines must have a defined, non-empty source-map segment.
      expect(segs.length).toBeGreaterThan(genLineB);
      expect(segs[genLineA]).toBeTruthy();
      expect(segs[genLineB]).toBeTruthy();
    });

    it("maps each code-tag output line to its actual source line (not the opener line)", () => {
      // Template with only a multi-line code tag — no preceding text node so
      // srcLine deltas in the VLQ segments are predictable.
      // src line 0: `<%`
      // src line 1: `const x = 1;`
      // src line 2: `const y = 2;`
      // src line 3: `%>`
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
      // Segment format: genCol(0) + srcIdx(0) + srcLineDelta + srcCol(0) = "AA<delta>A"
      // genLineX maps to srcLine 1 (delta from prevSrc=0 → +1 → VLQ "C") → "AACA"
      // genLineY maps to srcLine 2 (delta from prevSrc=1 → +1 → VLQ "C") → "AACA"
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
