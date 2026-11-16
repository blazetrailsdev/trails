import { describe, it, expect } from "vitest";
import { Parser } from "../../../../lib/action-dispatch/journey/parser.js";
import { Ast } from "../../../../lib/action-dispatch/journey/nodes/node.js";
import { Symbol as SymbolNode } from "../../../../lib/action-dispatch/journey/nodes/node.js";
import { Pattern } from "../../../../lib/action-dispatch/journey/path/pattern.js";

const SEPARATORS = "/.?";

function buildPath(
  path: string,
  requirements: Record<string, RegExp | RegExp[]> = {},
  separators: string = SEPARATORS,
  anchored = true,
): Pattern {
  const tree = new Parser().parse(path)!;
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, separators, anchored);
}

describe("ActionDispatch::Journey::Path::Pattern — anchored to_regexp", () => {
  const x = "(?-ims:.+)";
  const cases: Array<[string, string]> = [
    ["/:controller(/:action)", `^/(${x})(?:/([^/.?]+))?(?=\\n?$)`],
    ["/:controller/foo", `^/(${x})/foo(?=\\n?$)`],
    ["/:controller/:action", `^/(${x})/([^/.?]+)(?=\\n?$)`],
    ["/:controller", `^/(${x})(?=\\n?$)`],
    ["/:controller(/:action(/:id))", `^/(${x})(?:/([^/.?]+)(?:/([^/.?]+))?)?(?=\\n?$)`],
    ["/:controller/:action.xml", `^/(${x})/([^/.?]+)\\.xml(?=\\n?$)`],
    ["/:controller.:format", `^/(${x})\\.([^/.?]+)(?=\\n?$)`],
    ["/:controller(.:format)", `^/(${x})(?:\\.([^/.?]+))?(?=\\n?$)`],
    ["/:controller/*foo", `^/(${x})/(.+)(?=\\n?$)`],
    ["/:controller/*foo/bar", `^/(${x})/(.+)/bar(?=\\n?$)`],
    ["/:foo|*bar", `^/(?:([^/.?]+)|(.+))(?=\\n?$)`],
  ];
  for (const [path, expected] of cases) {
    it(`to_regexp ${path}`, () => {
      const p = buildPath(path, { controller: /.+/ }, SEPARATORS, true);
      expect(p.toRegexp().source).toBe(new RegExp(expected).source);
    });
  }
});

describe("ActionDispatch::Journey::Path::Pattern — unanchored to_regexp", () => {
  const x = "(?-ims:.+)";
  const cases: Array<[string, string]> = [
    ["/:controller(/:action)", `^/(${x})(?:/([^/.?]+))?(?:\\b|(?=\\n?$)|/)`],
    ["/:controller/foo", `^/(${x})/foo(?:\\b|(?=\\n?$)|/)`],
    ["/:controller", `^/(${x})(?:\\b|(?=\\n?$)|/)`],
    ["/:controller/*foo", `^/(${x})/(.+)(?:\\b|(?=\\n?$)|/)`],
    ["/:foo|*bar", `^/(?:([^/.?]+)|(.+))(?:\\b|(?=\\n?$)|/)`],
  ];
  for (const [path, expected] of cases) {
    it(`to_non_anchored_regexp ${path}`, () => {
      const p = buildPath(path, { controller: /.+/ }, SEPARATORS, false);
      expect(p.toRegexp().source).toBe(new RegExp(expected).source);
    });
  }
});

describe("ActionDispatch::Journey::Path::Pattern — names", () => {
  const cases: Array<[string, string[]]> = [
    ["/:controller(/:action)", ["controller", "action"]],
    ["/:controller/foo", ["controller"]],
    ["/:controller/:action", ["controller", "action"]],
    ["/:controller", ["controller"]],
    ["/:controller(/:action(/:id))", ["controller", "action", "id"]],
    ["/:controller.:format", ["controller", "format"]],
    ["/:controller(.:format)", ["controller", "format"]],
    ["/:controller/*foo", ["controller", "foo"]],
  ];
  for (const [path, expected] of cases) {
    it(`names ${path}`, () => {
      const p = buildPath(path, { controller: /.+/ }, SEPARATORS, true);
      expect(p.names).toEqual(expected);
    });
  }
});

describe("ActionDispatch::Journey::Path::Pattern — matching", () => {
  it("does not lift /m flag — would break ^/$ anchoring", () => {
    const p = buildPath("/page/:name", { name: /foo/m });
    expect(p.isMatch("xxx\n/page/foo")).toBe(false);
    expect(p.isMatch("/page/foo")).toBe(true);
  });

  it("does not lift flags from unused requirements", () => {
    const p = buildPath("/Page", { ignored: /x/i });
    expect(p.isMatch("/Page")).toBe(true);
    expect(p.isMatch("/page")).toBe(false);
  });

  it("escapes char-class metacharacters in separators", () => {
    expect(() => buildPath("/:foo", { foo: /.+/ }, "]^-\\", true)).not.toThrow();
  });

  it("propagates /u flag so Unicode property escapes compile", () => {
    const p = buildPath("/page/:name", { name: /\p{Letter}+/u });
    expect(p.isMatch("/page/Größe")).toBe(true);
    expect(p.isMatch("/page/123")).toBe(false);
  });
});

describe("ActionDispatch::Journey::Path::Pattern — requirements", () => {
  it("carries a unicode requirement's u flag to the missing-keys check", () => {
    const p = buildPath("/page/:name", { name: /\p{Letter}+/u });
    expect(p.requirementsForMissingKeysCheck["name"].test("Größe")).toBe(true);
  });

  it("Pattern pushes RegExp requirements into the SymbolNode for GTG widening", () => {
    const tree = new Parser().parse("/posts/:filename")!;
    const ast = new Ast(tree, true);
    new Pattern(ast, { filename: /(.+)/ }, "/.?", true);
    const symbol = ast.terminals.find(
      (n): n is SymbolNode => n instanceof SymbolNode && n.name === "filename",
    );
    expect(symbol).toBeInstanceOf(SymbolNode);
    expect(symbol!.regexp.source).toBe("(.+)");
  });
});

describe("ActionDispatch::Journey::Path::Pattern — leading-optional normalization", () => {
  it("drops a duplicate top-level SLASH when followed by an optional group starting with SLASH", () => {
    const p = buildPath("/(/:locale)/posts");
    expect(p.match("/posts")).toBeDefined();
    expect(p.match("/en/posts")).toBeDefined();
  });

  it("keeps the top-level SLASH but drops the inner SLASH of the first group for all-optional paths", () => {
    const p = buildPath("/(/:locale)(/:platform)");
    expect(p.match("/")).toBeDefined();
    expect(p.match("/en")).toBeDefined();
    expect(p.match("/en/us")).toBeDefined();
  });

  it("handles all-optional paths with non-`/:` second group (e.g. `(.:format)`)", () => {
    const p = buildPath("/(/:locale)(.:format)");
    expect(p.match("/")).toBeDefined();
    expect(p.match("/en")).toBeDefined();
    expect(p.match("/en.json")).toBeDefined();
  });

  it("leaves paths whose second top-level node isn't a SLASH-led Group alone", () => {
    const p = buildPath("/posts/:id");
    expect(p.toRegexp().source).toBe("^\\/posts\\/([^/.?]+)(?=\\n?$)");
  });

  it("handles the single-group all-optional shape `/(/:locale)`", () => {
    const p = buildPath("/(/:locale)");
    expect(p.match("/")).toBeDefined();
    expect(p.match("/en")).toBeDefined();
  });

  it("doesn't rewrite when the second top-level Group's body is just a SLASH", () => {
    const p = buildPath("/(/)/foo");
    expect(p.toRegexp()).toBeInstanceOf(RegExp);
  });
});

describe("ActionDispatch::Journey::Path::Pattern — flags of unused requirements", () => {
  it("does not take flags from a requirement the path does not name", () => {
    const pattern = buildPath("/:id", { other: /x/u });
    expect(pattern.toRegexp().flags).toBe("");
  });
});

describe("ActionDispatch::Journey::Path::Pattern — \\Z anchor", () => {
  it("a missing-keys requirement matches before one trailing newline, as Ruby's \\Z does", () => {
    const path = buildPath("/page/:name", { name: /test/ });
    const re = path.requirementsForMissingKeysCheck["name"];
    expect(re.test("test\n")).toBe(true);
    expect(re.test("test\n\n")).toBe(false);
  });
});
