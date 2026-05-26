import { describe, expect, it } from "vitest";
import {
  createTsePlugin,
  TseLocalsSignatureError,
  virtualizeTse,
  virtualizeTseWithDeltas,
} from "./tse.js";
import { diagnose } from "./tse-diagnose.js";

describe("createTsePlugin", () => {
  it("claims the .tse extension", () => {
    const plugin = createTsePlugin();
    expect(plugin.name).toBe("tse");
    expect(plugin.extensions).toEqual([".tse"]);
  });

  it("virtualizes through the host hook", () => {
    const plugin = createTsePlugin();
    const out = plugin.virtualize("/x/show.html.tse", "<h1><%= 1 %></h1>");
    expect(out?.ts).toContain("export default function render(");
    expect(out?.ts).toContain('_ob.safeAppend("<h1>");');
    expect(out?.ts).toContain("_ob.append(1);");
  });

  it("emits an error shim instead of throwing when virtualization fails", () => {
    const plugin = createTsePlugin();
    // Unbalanced brackets in the locals signature would otherwise raise
    // and crash the host's `tsc` invocation.
    const out = plugin.virtualize("/x/bad.tse", "<%# locals: (a: (1, 2) %>");
    expect(out?.ts).toContain("/x/bad.tse");
    expect(out?.ts).toContain(".tse virtualization failed");
    // The shim is itself a valid TS source that produces a clear
    // diagnostic when tsc compiles it.
    const diags = diagnose(out!.ts);
    expect(diags.length).toBeGreaterThan(0);
  });
});

describe("virtualizeTse", () => {
  it("defaults to Record<string, unknown> when no locals declared", () => {
    const ts = virtualizeTse("<p>hi</p>");
    expect(ts).toContain("locals: Record<string, unknown>");
    expect(ts).not.toContain("const {");
    // NoExtraKeys is not imported when unused — avoids noUnusedLocals diagnostics.
    expect(ts).not.toContain("NoExtraKeys");
  });

  it("types empty `<%# locals: () %>` as NoExtraKeys<Record<string, never>> (Rails **nil parity)", () => {
    const out = virtualizeTse("<%# locals: () %><p>hi</p>");
    expect(out).toContain("locals: NoExtraKeys<Record<string, never>>");
    // Confirm via tsc: passing `{ extra: 1 }` is a type error.
    const probe = out + "\nrender({} as RenderContext, { extra: 1 });";
    expect(diagnose(probe).join("\n")).toMatch(/not assignable|extra/i);
  });

  it("destructures locals and types them as unknown when no types block", () => {
    const ts = virtualizeTse("<%# locals: (user:, count: 0) %><%= user %>");
    expect(ts).toContain("locals: NoExtraKeys<{ user: unknown; count?: unknown }>");
    expect(ts).toContain("const { user, count = 0 } = locals;");
  });

  it("lifts the types annotation verbatim (no NoExtraKeys wrapper when types block present)", () => {
    const ts = virtualizeTse(
      "<%# locals: (user:) %><%! types: { user: { name: string } } !%><%= user.name %>",
    );
    expect(ts).toContain("locals: { user: { name: string } }");
    expect(ts).toContain("const { user } = locals;");
  });

  it("splits locals on top-level commas only", () => {
    const ts = virtualizeTse("<%# locals: (a: f(1, 2), b: [1, 2]) %>");
    expect(ts).toContain("const { a = f(1, 2), b = [1, 2] } = locals;");
  });

  it("does not split commas inside string or template literals", () => {
    const ts = virtualizeTse("<%# locals: (a: \"x, y\", b: 'p, q', c: `t, ${x}, u`) %>");
    expect(ts).toContain("const { a = \"x, y\", b = 'p, q', c = `t, ${x}, u` } = locals;");
  });

  it("throws on a malformed locals entry (no colon)", () => {
    expect(() => virtualizeTse("<%# locals: (user) %>")).toThrow(TseLocalsSignatureError);
  });

  it("shields unused destructured locals with `void name;`", () => {
    const out = virtualizeTse("<%# locals: (user:, count: 0) %><p>hi</p>");
    expect(out).toContain("const { user, count = 0 } = locals;");
    expect(out).toContain("void user; void count;");
  });

  it("reports LineDeltas covering header and footer so diagnostics remap back to .tse", () => {
    const { ts, deltas } = virtualizeTseWithDeltas("<h1><%= 1 %></h1>");
    expect(deltas).toHaveLength(2);
    const [head, foot] = deltas;
    expect(head?.insertedAtLine).toBe(-1);
    const lines = ts.split("\n");
    expect(lines[head!.lineCount - 1]).toContain("const _ob");
    // Footer delta marks the line BEFORE the trailing `return _ob;`
    // (remapLine treats `injectedStart` as exclusive); the footer
    // block then spans `lineCount` lines starting at injectedStart+1.
    expect(lines[foot!.insertedAtLine + 1]).toContain("return _ob");
  });

  it("counts multi-line `<% %>` chunks as multiple virtual lines for the footer offset", () => {
    const { ts, deltas } = virtualizeTseWithDeltas("<% const x = 1;\nconst y = 2; %>hi");
    const [, foot] = deltas;
    const lines = ts.split("\n");
    // The footer's `return _ob;` should sit immediately after the
    // body, regardless of how many node-array entries the body has.
    expect(lines[foot!.insertedAtLine + 1]).toContain("return _ob");
  });

  it("throws on unbalanced brackets in the locals signature", () => {
    expect(() => virtualizeTse("<%# locals: (a: (1, 2) %>")).toThrow(TseLocalsSignatureError);
  });

  it("throws on an unterminated string in the locals signature", () => {
    expect(() => virtualizeTse('<%# locals: (a: "oops) %>')).toThrow(TseLocalsSignatureError);
  });

  it("throws on mismatched bracket types", () => {
    // Outer parens are required by the locals regex; the mismatch is
    // inside (a square closer for a curly opener).
    expect(() => virtualizeTse("<%# locals: (a: {1, 2]) %>")).toThrow(/mismatched/);
  });

  it("accepts mixed named kwargs + `**nil` sentinel (Rails parity)", () => {
    const out = virtualizeTse("<%# locals: (user:, **nil) %><%= user %>");
    expect(out).toContain("const { user } = locals;");
    expect(out).toContain("locals: NoExtraKeys<{ user: unknown }>");
  });

  it("throws on an empty / invalid local name", () => {
    expect(() => virtualizeTse("<%# locals: (: 1) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (1bad: 1) %>")).toThrow(/invalid local name/);
  });

  it("throws on duplicate local names", () => {
    expect(() => virtualizeTse("<%# locals: (count:, count: 0) %>")).toThrow(
      /duplicate local name/,
    );
  });

  it("rejects TS reserved words as local names", () => {
    expect(() => virtualizeTse("<%# locals: (default: 1) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (await: 1) %>")).toThrow(/invalid local name/);
    // eval/arguments are restricted in strict mode — `const { eval } = x;` is a syntax error in ESM.
    expect(() => virtualizeTse("<%# locals: (eval:) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (arguments:) %>")).toThrow(/invalid local name/);
  });

  it("rejects emitter-reserved names that would produce duplicate-declaration SyntaxErrors", () => {
    // These are render() parameters or internal bindings in the emitted output.
    expect(() => virtualizeTse("<%# locals: (context:) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (locals:) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (_ob:) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (__allowedKeys:) %>")).toThrow(/invalid local name/);
    expect(() => virtualizeTse("<%# locals: (__extraKeys:) %>")).toThrow(/invalid local name/);
  });

  it("dispatches expression sites and preserves code chunks raw", () => {
    const out = virtualizeTse("<% if (n > 0) { %><%= n %><%== raw %><% } %>");
    expect(out).toContain("if (n > 0) {");
    expect(out).toContain("_ob.append(n);");
    expect(out).toContain("_ob.safeExprAppend(raw);");
    expect(out).toContain("}");
  });

  it("virtualizes a blockExpr with deferred append close", () => {
    const out = virtualizeTse("<%= forEach(items, (item) => { %><li><%= item %></li><% }) %>");
    const lines = out.split("\n");
    expect(lines).toContain("  _ob.append(forEach(items, (item) => {");
    expect(lines).toContain('  _ob.safeAppend("<li>");');
    expect(lines).toContain("  _ob.append(item);");
    expect(lines).toContain('  _ob.safeAppend("</li>");');
    expect(lines).toContain("  }));");
  });

  it("virtualizes nested blockExprs and closes each in order", () => {
    const out = virtualizeTse("<%= outer((x) => { %><%= inner((y) => { %><% }) %><% }) %>");
    const lines = out.split("\n");
    expect(lines).toContain("  _ob.append(outer((x) => {");
    expect(lines).toContain("  _ob.append(inner((y) => {");
    expect(lines.filter((l) => l === "  }));")).toHaveLength(2);
  });

  it("does not consume a blockExpr closer on inner code braces including } else {", () => {
    const out = virtualizeTse(
      "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } else { %><%= other %><% } %><% }) %>",
    );
    const lines = out.split("\n");
    expect(lines).toContain("  _ob.append(forEach(items, (item) => {");
    expect(lines.filter((l) => l === "  }));")).toHaveLength(1);
  });

  it("throws a clear error when a blockExpr is never closed in virtualization", () => {
    expect(() => virtualizeTse("<%= forEach(items, (item) => { %>no closer")).toThrow(
      /block-expr.*never closed/,
    );
  });

  it("wraps named locals type in NoExtraKeys so variable-typed excess keys are rejected", () => {
    // Without NoExtraKeys, a pre-built variable with excess keys would pass tsc.
    const out = virtualizeTse("<%# locals: (count:) %><%= count %>");
    expect(out).toContain("locals: NoExtraKeys<{ count: unknown }>");
    // Variable with excess key — without NoExtraKeys this would pass tsc.
    const probe =
      out +
      "\nconst l: { count: number; extra: string } = { count: 1, extra: 'x' };" +
      "\nrender({} as RenderContext, l);";
    expect(diagnose(probe).join("\n")).toMatch(/not assignable|extra/i);
  });

  it("emits TS that type-checks against the declared locals", () => {
    const source =
      "<%# locals: (user:) %><%! types: { user: { name: string } } !%>" +
      "<h1>Hello <%= user.name %></h1>";
    const out = virtualizeTse(source);
    expect(diagnose(out)).toEqual([]);
  });

  it("reports a tsc error when an expression mismatches the locals type", () => {
    const source =
      "<%# locals: (user:) %><%! types: { user: { name: string } } !%>" + "<%= user.missingProp %>";
    const out = virtualizeTse(source);
    const diags = diagnose(out);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.join("\n")).toMatch(/missingProp/);
  });

  describe("render() conditional locals generic", () => {
    const registryStub = [
      "export type NoExtraKeys<T> = T & { [K in Exclude<string, keyof T>]?: never };",
      "export interface TemplateRegistry {",
      '  "users/user": { name: string };',
      '  "shared/empty": {};',
      "}",
      "export type TemplateLocals<T> = T;",
    ].join("\n");

    it("requires locals for a known partial with required properties", () => {
      const out = virtualizeTse("<%= context.render({ partial: 'users/user' }) %>");
      const diags = diagnose(out, { customStub: registryStub });
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.join("\n")).toMatch(/locals|name/i);
    });

    it("accepts omitted locals when all properties are optional", () => {
      const out = virtualizeTse("<%= context.render({ partial: 'shared/empty' }) %>");
      expect(diagnose(out, { customStub: registryStub })).toEqual([]);
    });

    it("falls back to optional Record<string, unknown> for unknown partials", () => {
      const out = virtualizeTse("<%= context.render({ partial: 'unknown/thing' }) %>");
      expect(diagnose(out, { customStub: registryStub })).toEqual([]);
    });

    it("rejects wrong-shape locals for a known partial", () => {
      const out = virtualizeTse(
        "<%= context.render({ partial: 'users/user', locals: { wrong: 1 } }) %>",
      );
      const diags = diagnose(out, { customStub: registryStub });
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.join("\n")).toMatch(/not assignable|wrong/i);
    });
  });

  describe("RenderContext ↔ TseRenderContext sync", () => {
    it("virtualizer RenderContext has every TseRenderContext member", () => {
      const ts = virtualizeTse("<h1>hi</h1>");
      const ifaceMatch = ts.match(/interface RenderContext \{([\s\S]*?)\n\}/);
      expect(ifaceMatch).not.toBeNull();
      const body = ifaceMatch![1];
      const memberNames = [...body.matchAll(/^\s+(?:readonly\s+)?(\w+)\s*[(<[:?]/gm)]
        .map((m) => m[1])
        .filter((n) => n !== undefined && n[0] === n[0].toLowerCase());
      const canonical = [
        "outputBuffer",
        "capture",
        "concat",
        "raw",
        "yield",
        "contentFor",
        "render",
      ];
      for (const name of canonical) {
        expect(memberNames, `missing "${name}" in virtualizer RenderContext`).toContain(name);
      }
      const named = memberNames.filter((n) => n !== undefined);
      for (const name of named) {
        expect(
          canonical,
          `extra "${name}" in virtualizer RenderContext not in TseRenderContext`,
        ).toContain(name);
      }
    });
  });

  describe("TseRenderContext method signatures on context param", () => {
    it("accepts context.capture/raw/yield calls", () => {
      const out = virtualizeTse(
        "<%= context.capture(() => {}) %><%= context.raw('hi') %><%= context.yield() %>",
      );
      expect(diagnose(out)).toEqual([]);
    });

    it("accepts context.concat and context.contentFor calls", () => {
      const out = virtualizeTse("<% context.concat('x'); context.contentFor('nav', () => {}); %>");
      expect(diagnose(out)).toEqual([]);
    });

    it("rejects calls on index-signature properties (unknown is not callable)", () => {
      const out = virtualizeTse("<%= context.nonExistentMethod() %>");
      const diags = diagnose(out);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.join("\n")).toMatch(/not callable|is of type 'unknown'/i);
    });
  });
});
