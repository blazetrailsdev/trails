import { describe, expect, it } from "vitest";
import {
  TseLocalsSignatureError,
  transpileTse,
  virtualizeTse,
  virtualizeTseWithDeltas,
} from "./tse.js";
import { diagnose } from "./tse-diagnose.js";

describe("virtualizeTse", () => {
  it("defaults to Record<string, unknown> when no locals declared", () => {
    const ts = virtualizeTse("<p>hi</p>");
    expect(ts).toContain("locals: Record<string, unknown>");
    expect(ts).not.toContain("const {");
    expect(ts).not.toContain("NoExtraKeys");
  });

  it("types empty `<%# locals: () %>` as NoExtraKeys<Record<string, never>> (Rails **nil parity)", () => {
    const out = virtualizeTse("<%# locals: () %><p>hi</p>");
    expect(out).toContain("locals: NoExtraKeys<Record<string, never>>");
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
    expect(lines[head.lineCount - 1]).toContain("const _ob");
    expect(lines[foot.insertedAtLine + 1]).toContain("return _ob");
  });

  it("counts multi-line `<% %>` chunks as multiple virtual lines for the footer offset", () => {
    const { ts, deltas } = virtualizeTseWithDeltas("<% const x = 1;\nconst y = 2; %>hi");
    const [, foot] = deltas;
    const lines = ts.split("\n");
    expect(lines[foot.insertedAtLine + 1]).toContain("return _ob");
  });

  it("throws on unbalanced brackets in the locals signature", () => {
    expect(() => virtualizeTse("<%# locals: (a: (1, 2) %>")).toThrow(TseLocalsSignatureError);
  });

  it("throws on an unterminated string in the locals signature", () => {
    expect(() => virtualizeTse('<%# locals: (a: "oops) %>')).toThrow(TseLocalsSignatureError);
  });

  it("throws on mismatched bracket types", () => {
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

  it("leaves positional and block parameters to Template#compile's non-keyword check", () => {
    const out = virtualizeTse("<%# locals: (user, count = {a: 1}, *rest, &block) %>");
    expect(out).not.toContain("} = locals;");
  });

  it("still rejects a locals entry compile would not read as a parameter", () => {
    expect(() => virtualizeTse("<%# locals: (foo bar) %>")).toThrow(TseLocalsSignatureError);
    expect(() => virtualizeTse("<%# locals: (user user:) %>")).toThrow(/invalid local name/);
  });

  it("types a reserved-word keyword local without binding it", () => {
    const out = virtualizeTse("<%# locals: (class:, context:) %>");
    expect(out).toContain("locals: NoExtraKeys<{ class: unknown; context: unknown }>");
    expect(out).not.toContain("} = locals;");
  });

  it("collects a named keyrest local with an object rest", () => {
    const out = virtualizeTse("<%# locals: (message: 'Hi', **kwargs) %>");
    expect(out).toContain("const { message = 'Hi', ...kwargs } = locals;");
    expect(out).toContain("locals: { message?: unknown; [key: string]: unknown }");
  });

  it("dispatches expression sites and preserves code chunks raw", () => {
    const out = virtualizeTse("<% if (n > 0) { %><%= n %><%== raw %><% } %>");
    expect(out).toContain("if (n > 0) {");
    expect(out).toContain("_ob.append(await (n));");
    expect(out).toContain("_ob.safeExprAppend(await (raw));");
    expect(out).toContain("}");
  });

  it("virtualizes a blockExpr with deferred append close", () => {
    const out = virtualizeTse("<%= forEach(items, (item) => { %><li><%= item %></li><% }) %>");
    const lines = out.split("\n");
    expect(lines).toContain("  _ob.append(await (forEach(items, (item) => {");
    expect(lines).toContain('  context.outputBuffer.safeAppend("<li>");');
    expect(lines).toContain("  context.outputBuffer.append(item);");
    expect(lines).toContain('  context.outputBuffer.safeAppend("</li>");');
    expect(lines).toContain("  })));");
  });

  it("virtualizes nested blockExprs and closes each in order", () => {
    const out = virtualizeTse("<%= outer((x) => { %><%= inner((y) => { %><% }) %><% }) %>");
    const lines = out.split("\n");
    expect(lines).toContain("  _ob.append(await (outer((x) => {");
    expect(lines).toContain("  context.outputBuffer.append(inner((y) => {");
    expect(lines.filter((l) => l === "  }));")).toHaveLength(1);
    expect(lines.filter((l) => l === "  })));")).toHaveLength(1);
  });

  it("does not consume a blockExpr closer on inner code braces including } else {", () => {
    const out = virtualizeTse(
      "<%= forEach(items, (item) => { %><% if (x) { %><%= item %><% } else { %><%= other %><% } %><% }) %>",
    );
    const lines = out.split("\n");
    expect(lines).toContain("  _ob.append(await (forEach(items, (item) => {");
    expect(lines.filter((l) => l === "  })));")).toHaveLength(1);
  });

  it("ignores braces inside strings when tracking block and function depth", () => {
    const inBlock = virtualizeTse('<%= f((x) => { %><% const s = "{"; %><%= x %><% }) %>');
    expect(inBlock.split("\n")).toContain("  })));");
    const inFn = virtualizeTse('<% items.forEach((i) => { %><% const s = "}"; %><%= i %><% }) %>');
    expect(inFn).toContain("  _ob.append(i);");
  });

  it("closes a blockExpr on a })) closer as compileJs does", () => {
    const out = virtualizeTse("<%= f(g((x) => { %>y<% })) %>").split("\n");
    expect(out).toContain("  }))));");
  });

  it("rejects a function-form blockExpr as compileJs does", () => {
    expect(() => virtualizeTse("<%= each(items, function (item) { %>x<% }) %>")).toThrow(
      /must use arrow syntax/,
    );
  });

  it("throws a clear error when a blockExpr is never closed in virtualization", () => {
    expect(() => virtualizeTse("<%= forEach(items, (item) => { %>no closer")).toThrow(
      /block-expr.*never closed/,
    );
  });

  it("wraps named locals type in NoExtraKeys so variable-typed excess keys are rejected", () => {
    const out = virtualizeTse("<%# locals: (count:) %><%= count %>");
    expect(out).toContain("locals: NoExtraKeys<{ count: unknown }>");
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

    it("binds a bare yield to context.yield, with or without a section", () => {
      const out = virtualizeTse(
        '<main><%= yield %></main><%= yield "sidebar" %><%= yield("footer") %><%== yield %>',
      );
      expect(out).toContain("_ob.append(await (context.yield()));");
      expect(out).toContain('_ob.append(await (context.yield("sidebar")));');
      expect(out).toContain('_ob.append(await (context.yield("footer")));');
      expect(out).toContain("_ob.safeExprAppend(await (context.yield()));");
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

  describe("view scope", () => {
    const scope = {
      view: "{ readingTime(this: { x: 1 }, words: number): string; posts: string[] }",
      locals: "{ post: { title: string | null } }",
    };

    it("declares each name the body references, not property names or bindings", () => {
      const out = virtualizeTse(
        "<% const n = 1 %><%= readingTime(n) %><%= f({ model: post }, (form) => form.x) %>",
        scope,
      );
      expect(out).toContain("  this: View,");
      expect(out).toContain(
        '  let readingTime = __lookup("readingTime", true) as Scope<"readingTime">;',
      );
      expect(out).toContain('  let post = __lookup("post", true) as Scope<"post">;');
      expect(out).not.toContain('Scope<"n">');
      expect(out).not.toContain('Scope<"model">');
      expect(out).not.toContain('Scope<"x">');
    });

    it("types a helper call through the view, so its parameter types reach the checker", () => {
      const out = virtualizeTse("<p><%= readingTime(post.title) %></p>", scope);
      expect(diagnose(out).join("\n")).toMatch(
        /'string \| null' is not assignable to parameter of type 'number'/,
      );
      expect(diagnose(virtualizeTse("<%= readingTime(this.posts.length) %>", scope))).toEqual([]);
    });

    it("keeps every overload of a this-typed helper callable bare", () => {
      const overloaded = {
        view: `{ ${["a: string", "a: number, b: boolean", "a: 1, b: 2, c: 3", "a: [], b: [], c: [], d: []", "a: null"].map((params, i) => `tag(this: { x: 1 }, ${params}): ${i}`).join("; ")}; posts: string[] }`,
      };
      const calls = 'tag("p")|tag(2, true)|tag(1, 2, 3)|tag([], [], [], [])|tag(null)'.split("|");
      const body = calls.map((call, i) => `<% const r${i}: ${i} = ${call} %>`).join("");
      expect(diagnose(virtualizeTse(body + "<%= posts.length %>", overloaded))).toEqual([]);
      expect(diagnose(virtualizeTse("<%= tag(2) %>", overloaded))).not.toEqual([]);
      const single = diagnose(virtualizeTse("<%= readingTime(post.title) %>", scope)).join("\n");
      expect(single).not.toMatch(/No overload matches this call/);
    });

    it("leaves an unknown name `any` without strict locals and `never` with them", () => {
      expect(diagnose(virtualizeTse("<%= mystery.anything() %>", scope))).toEqual([]);
      const strict = virtualizeTse("<%# locals: () %><%= mystery.anything() %>", scope);
      expect(diagnose(strict).join("\n")).toMatch(/does not exist on type 'never'/);
    });

    it("makes an unknown name `never` once every render site is resolved", () => {
      const resolved = virtualizeTse("<%= psot.title %>", { ...scope, resolved: true });
      expect(resolved).toContain("      : never;");
      expect(diagnose(resolved).join("\n")).toMatch(/'title' does not exist on type 'never'/);
      expect(diagnose(virtualizeTse("<%= post.title %>", { ...scope, resolved: true }))).toEqual(
        [],
      );
    });

    it("maps each body line to the .tse line its node starts on", () => {
      const src = '<div id="<%= a %>">\n  <p>\n    <%= b %>\n  </p>\n<% if (c) {\n  d(); } %>';
      const { ts, mappings } = virtualizeTseWithDeltas(src, scope);
      const lines = ts.split("\n");
      const srcLineOf = (needle: string): number | undefined =>
        mappings.find((m) => lines[m.genLine].includes(needle))?.srcLine;
      expect(srcLineOf("_ob.append(await (a))")).toBe(0);
      expect(srcLineOf("_ob.append(await (b))")).toBe(2);
      expect(srcLineOf("if (c)")).toBe(4);
      expect(srcLineOf("d();")).toBe(5);
    });

    it("maps a one-character expression past the emitted append prefix", () => {
      const src = "<p><%= a %><%= b %><%= o %></p>";
      const { ts, mappings } = virtualizeTseWithDeltas(src, scope);
      const lines = ts.split("\n");
      for (const name of ["a", "b", "o"]) {
        const m = mappings.find((x) => lines[x.genLine].includes(`_ob.append(await (${name}))`))!;
        expect(lines[m.genLine].slice(m.genCol)).toBe(`${name}));`);
        expect(src[m.srcCol!]).toBe(name);
      }
    });

    it("maps a yielded section to its column inside the tag", () => {
      const src = '<p><%= yield("sidebar") %></p>';
      const { ts, mappings } = virtualizeTseWithDeltas(src, scope);
      const lines = ts.split("\n");
      const m = mappings.find((x) => lines[x.genLine].includes("context.yield"))!;
      expect(lines[m.genLine].slice(m.genCol)).toMatch(/^"sidebar"/);
      expect(src.slice(m.srcCol)).toMatch(/^"sidebar"/);
    });
  });
});

describe("virtualizeTse free-name lookup", () => {
  const scope = { view: "{}" };
  const lookups = (source: string): string[] =>
    [
      ...virtualizeTse(source, scope).matchAll(
        /^ {2}let (\w+) = __lookup\(("\w+"(?:, true)?)\)/gmu,
      ),
    ].map((m) => `${m[1]}:${m[2]}`);
  const run = async (source: string, view: object = {}): Promise<string> => {
    const { outputText } = transpileTse(virtualizeTse(source, scope));
    const exports: { default?: (...a: unknown[]) => Promise<unknown> } = {};
    const modules: Record<string, unknown> = {
      "@blazetrails/actionview": { TopLevel: {} },
      "@blazetrails/activesupport": { htmlSafe: (s: string) => s },
    };
    new Function("exports", "require", outputText)(exports, (id: string) => modules[id]);
    const out: string[] = [];
    const context = Object.assign(Object.create(view), {
      outputBuffer: {
        append(v: unknown) {
          out.push(String(v));
        },
        safeAppend(v: unknown) {
          out.push(String(v));
        },
        toString: () => out.join(""),
      },
    });
    await exports.default!.call(context, context, {});
    return out.join("");
  };

  it("does not look up a block parameter or a const declared in a code tag", () => {
    expect(lookups("<% [1].forEach((n) => { %><%= n %><% }) %>")).toEqual([]);
    expect(lookups("<% { const inner = 1; %><%= inner %><% } %>")).toEqual([]);
  });

  it("does not look up a var hoisted out of a nested block or a named function expression", () => {
    expect(lookups("<% if (true) { var v = 1; } %><%= v %>")).toEqual([]);
    expect(lookups("<% const f = function g() { return g; }; %>")).toEqual([]);
  });

  it("binds every free name without raising at the header", () => {
    expect(lookups("<%= secret %>")).toEqual(['secret:"secret", true']);
  });

  it("raises ReferenceError when an undeclared name is used", async () => {
    await expect(run("<%= doesnt_exist.name %>")).rejects.toThrow(
      new ReferenceError("doesnt_exist is not defined"),
    );
    await expect(run("<%= typeof secret %><%= secret %>")).rejects.toThrow(
      new ReferenceError("secret is not defined"),
    );
    for (const use of ['x ?? "d"', 'x || ""', "!x", "x == null", "x ? 1 : 2", "{ x }"]) {
      await expect(run(`<%= ${use} %>`)).rejects.toThrow(new ReferenceError("x is not defined"));
    }
  });

  it("reads an undeclared name under typeof as undefined", async () => {
    expect(await run("<%= typeof secret %>")).toBe("undefined");
    expect(
      await run('<%= typeof secret !== "undefined" && secret != null ? secret : "one" %>'),
    ).toBe("one");
  });

  it("reads a name the template assigns from its binding", async () => {
    expect(await run("<% x = 1 %><%= x %>")).toBe("1");
  });

  it("raises only where the undeclared name is reached", async () => {
    expect(
      await run('<%= (() => { try { return customer.name; } catch { return "Anonymous"; } })() %>'),
    ).toBe("Anonymous");
  });
});
