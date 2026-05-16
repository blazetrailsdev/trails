import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";
import { Ast } from "../ast.js";
import { Pattern } from "./pattern.js";

const SEPARATORS = "/.?";

function buildPath(
  path: string,
  requirements: Record<string, RegExp | RegExp[]> = {},
  separators: string = SEPARATORS,
  anchored = true,
): Pattern {
  const tree = new Parser().parse(path);
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, separators, anchored);
}

const pathFromString = (p: string) => buildPath(p);

describe("ActionDispatch::Journey::Path::Pattern — anchored to_regexp", () => {
  const x = ".+";
  const cases: Array<[string, string]> = [
    ["/:controller(/:action)", `^/(${x})(?:/([^/.?]+))?$`],
    ["/:controller/foo", `^/(${x})/foo$`],
    ["/:controller/:action", `^/(${x})/([^/.?]+)$`],
    ["/:controller", `^/(${x})$`],
    ["/:controller(/:action(/:id))", `^/(${x})(?:/([^/.?]+)(?:/([^/.?]+))?)?$`],
    ["/:controller/:action.xml", `^/(${x})/([^/.?]+)\\.xml$`],
    ["/:controller.:format", `^/(${x})\\.([^/.?]+)$`],
    ["/:controller(.:format)", `^/(${x})(?:\\.([^/.?]+))?$`],
    ["/:controller/*foo", `^/(${x})/(.+)$`],
    ["/:controller/*foo/bar", `^/(${x})/(.+)/bar$`],
    ["/:foo|*bar", `^/(?:([^/.?]+)|(.+))$`],
  ];
  for (const [path, expected] of cases) {
    it(`to_regexp ${path}`, () => {
      const p = buildPath(path, { controller: /.+/ }, SEPARATORS, true);
      expect(p.toRegexp().source).toBe(new RegExp(expected).source);
    });
  }
});

describe("ActionDispatch::Journey::Path::Pattern — unanchored to_regexp", () => {
  const x = ".+";
  const cases: Array<[string, string]> = [
    ["/:controller(/:action)", `^/(${x})(?:/([^/.?]+))?(?:\\b|$|/)`],
    ["/:controller/foo", `^/(${x})/foo(?:\\b|$|/)`],
    ["/:controller", `^/(${x})(?:\\b|$|/)`],
    ["/:controller/*foo", `^/(${x})/(.+)(?:\\b|$|/)`],
    ["/:foo|*bar", `^/(?:([^/.?]+)|(.+))(?:\\b|$|/)`],
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
  it("test_to_regexp_match_non_optional", () => {
    const p = buildPath("/:name", { name: /\d+/ });
    expect(p.isMatch("/123")).toBe(true);
    expect(p.isMatch("/")).toBe(false);
  });

  it("test_to_regexp_with_group", () => {
    const p = buildPath("/page/:name", { name: /(tender|love)/ });
    expect(p.isMatch("/page/tender")).toBe(true);
    expect(p.isMatch("/page/love")).toBe(true);
    expect(p.isMatch("/page/loving")).toBe(false);
  });

  it("test_match_data_with_group", () => {
    const p = buildPath("/page/:name", { name: /(tender|love)/ });
    const match = p.match("/page/tender")!;
    expect(match.at(1)).toBe("tender");
    expect(match.length).toBe(2);
  });

  it("test_match_data_with_multi_group", () => {
    const p = buildPath("/page/:name/:id", { name: /t(((ender|love)))()/ });
    const match = p.match("/page/tender/10")!;
    expect(match.at(1)).toBe("tender");
    expect(match.at(2)).toBe("10");
    expect(match.length).toBe(3);
    expect([...match.captures]).toEqual(["tender", "10"]);
  });

  it("test_star_with_custom_re", () => {
    const p = buildPath("/page/*foo", { foo: /\d+/ });
    expect(p.toRegexp().source).toBe(new RegExp(`^/page/(\\d+)$`).source);
  });

  it("test_insensitive_regexp_with_group", () => {
    // /i flags on requirement regexes are lifted to the compiled
    // Pattern regex. Rails inline-scopes flags via Regexp.union (impossible
    // in JS), so the flag leaks to the whole pattern — practical impact is
    // limited because the surrounding regex is mostly non-letter.
    const p = buildPath("/page/:name/aaron", { name: /(tender|love)/i });
    expect(p.isMatch("/page/TENDER/aaron")).toBe(true);
    expect(p.isMatch("/page/loVE/aaron")).toBe(true);
  });

  it("does not lift /m flag — would break ^/$ anchoring", () => {
    // If /m leaked to the outer regex, ^/$ would become line-anchors.
    // Use a USED requirement so the flag is actually a candidate.
    const p = buildPath("/page/:name", { name: /foo/m });
    expect(p.isMatch("xxx\n/page/foo")).toBe(false);
    expect(p.isMatch("/page/foo")).toBe(true);
  });

  it("does not lift flags from unused requirements", () => {
    // {ignored: /x/i} would have made the whole pattern case-insensitive
    // before the names-filter landed. With it, the unused requirement is
    // ignored entirely.
    const p = buildPath("/Page", { ignored: /x/i });
    expect(p.isMatch("/Page")).toBe(true);
    expect(p.isMatch("/page")).toBe(false);
  });

  it("escapes char-class metacharacters in separators", () => {
    // Separators containing `]`, `-`, `^`, or `\` would have produced
    // invalid regex / unintended ranges before escapeCharClass landed.
    expect(() => buildPath("/:foo", { foo: /.+/ }, "]^-\\", true)).not.toThrow();
  });

  it("propagates /u flag so Unicode property escapes compile", () => {
    // \p{Letter} requires the /u flag — would throw without flag lifting.
    const p = buildPath("/page/:name", { name: /\p{Letter}+/u });
    expect(p.isMatch("/page/Größe")).toBe(true);
    expect(p.isMatch("/page/123")).toBe(false);
  });

  it("MatchData.at(0) returns the full match", () => {
    const p = buildPath("/page/:name", { name: /\d+/ });
    const m = p.match("/page/42")!;
    expect(m.at(0)).toBe("/page/42");
  });

  it("MatchData.at(negative) returns undefined", () => {
    const p = buildPath("/page/:name", { name: /\d+/ });
    const m = p.match("/page/42")!;
    expect(m.at(-1)).toBeUndefined();
  });

  it("test_to_regexp_defaults", () => {
    const p = pathFromString("/:controller(/:action(/:id))");
    expect(p.toRegexp().source).toBe(
      new RegExp(`^/([^/.?]+)(?:/([^/.?]+)(?:/([^/.?]+))?)?$`).source,
    );
  });

  it("test_failed_match", () => {
    const p = pathFromString("/:controller(/:action(/:id(.:format)))");
    expect(p.match("content")).toBeUndefined();
  });

  it("test_match_controller", () => {
    const p = pathFromString("/:controller(/:action(/:id(.:format)))");
    const m = p.match("/content")!;
    expect(m.names).toEqual(["controller", "action", "id", "format"]);
    expect(m.at(1)).toBe("content");
    expect(m.at(2)).toBeUndefined();
    expect(m.at(3)).toBeUndefined();
    expect(m.at(4)).toBeUndefined();
  });

  it("test_match_controller_action", () => {
    const p = pathFromString("/:controller(/:action(/:id(.:format)))");
    const m = p.match("/content/list")!;
    expect(m.at(1)).toBe("content");
    expect(m.at(2)).toBe("list");
    expect(m.at(3)).toBeUndefined();
  });

  it("test_match_controller_action_id", () => {
    const p = pathFromString("/:controller(/:action(/:id(.:format)))");
    const m = p.match("/content/list/10")!;
    expect(m.at(1)).toBe("content");
    expect(m.at(2)).toBe("list");
    expect(m.at(3)).toBe("10");
  });

  it("test_match_literal", () => {
    const p = pathFromString("/books(/:action(.:format))");
    const m = p.match("/books")!;
    expect(m.names).toEqual(["action", "format"]);
    expect(m.at(1)).toBeUndefined();
    expect(m.at(2)).toBeUndefined();
  });

  it("test_match_literal_with_action", () => {
    const p = pathFromString("/books(/:action(.:format))");
    const m = p.match("/books/list")!;
    expect(m.at(1)).toBe("list");
    expect(m.at(2)).toBeUndefined();
  });

  it("test_match_literal_with_action_and_format", () => {
    const p = pathFromString("/books(/:action(.:format))");
    const m = p.match("/books/list.rss")!;
    expect(m.at(1)).toBe("list");
    expect(m.at(2)).toBe("rss");
  });

  it("test_named_captures", () => {
    const p = pathFromString("/books(/:action(.:format))");
    const m = p.match("/books/list.rss")!;
    expect(m.namedCaptures).toEqual({ action: "list", format: "rss" });
  });
});

describe("ActionDispatch::Journey::Path::Pattern — optional names", () => {
  it("test_optional_names", () => {
    const cases: Array<[string, string[]]> = [
      ["/:foo(/:bar(/:baz))", ["bar", "baz"]],
      ["/:foo(/:bar)", ["bar"]],
      ["/:foo(/:bar)/:lol(/:baz)", ["bar", "baz"]],
    ];
    for (const [pattern, list] of cases) {
      const p = pathFromString(pattern);
      expect([...p.optionalNames].sort()).toEqual([...list].sort());
    }
  });
});

describe("ActionDispatch::Journey::Path::Pattern — requirements", () => {
  it("test_requirements_for_missing_keys_check", () => {
    const nameRegex = /test/;
    const p = buildPath("/page/:name", { name: nameRegex });
    const transformed = p.requirementsForMissingKeysCheck["name"]!;
    expect(transformed.source).toBe(new RegExp(`^(?:test)$`).source);
  });

  it("anchors the union as a single alternation, not split anchors", () => {
    // /^a|b$/ parses as /(^a)|(b$)/. Verify the (?:…) wrapping by
    // checking that neither branch leaks past its anchor.
    const p = buildPath("/page/:name", { name: [/foo/, /bar/] });
    const re = p.requirementsForMissingKeysCheck["name"]!;
    expect(re.test("foo")).toBe(true);
    expect(re.test("bar")).toBe(true);
    expect(re.test("xfooy")).toBe(false);
    expect(re.test("xbary")).toBe(false);
  });

  it("test_requirements_for_missing_keys_check_memoization", () => {
    const p = buildPath("/page/:name", { name: /test/ });
    expect(p.requirementsForMissingKeysCheck).toBe(p.requirementsForMissingKeysCheck);
  });
});
