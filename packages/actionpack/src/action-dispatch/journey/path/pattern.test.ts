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
  const tree = new Parser().parse(path)!;
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, separators, anchored);
}

const pathFromString = (p: string) => buildPath(p, {}, "/.?", true);

describe("TestPattern", () => {
  it("to regexp with extended group", () => {
    const path = buildPath("/page/:name", { name: /(tender|love)/ }, SEPARATORS, true);
    expect("/page/tender").toMatch(path.toRegexp());
    expect("/page/love").toMatch(path.toRegexp());
    expect("/page/loving").not.toMatch(path.toRegexp());
  });

  it("optional names", () => {
    const cases: Array<[string, string[]]> = [
      ["/:foo(/:bar(/:baz))", ["bar", "baz"]],
      ["/:foo(/:bar)", ["bar"]],
      ["/:foo(/:bar)/:lol(/:baz)", ["bar", "baz"]],
    ];
    for (const [pattern, list] of cases) {
      const path = pathFromString(pattern);
      expect([...path.optionalNames].sort()).toEqual([...list].sort());
    }
  });

  it("to regexp match non optional", () => {
    const path = buildPath("/:name", { name: /\d+/ }, SEPARATORS, true);
    expect("/123").toMatch(path.toRegexp());
    expect("/").not.toMatch(path.toRegexp());
  });

  it("to regexp with group", () => {
    const path = buildPath("/page/:name", { name: /(tender|love)/ }, SEPARATORS, true);
    expect("/page/tender").toMatch(path.toRegexp());
    expect("/page/love").toMatch(path.toRegexp());
    expect("/page/loving").not.toMatch(path.toRegexp());
  });

  it("match data with group", () => {
    const path = buildPath("/page/:name", { name: /(tender|love)/ }, SEPARATORS, true);
    const match = path.match("/page/tender")!;
    expect(match.at(1)).toBe("tender");
    expect(match.length).toBe(2);
  });

  it("match data with multi group", () => {
    const path = buildPath("/page/:name/:id", { name: /t(((ender|love)))()/ }, SEPARATORS, true);
    const match = path.match("/page/tender/10")!;
    expect(match.at(1)).toBe("tender");
    expect(match.at(2)).toBe("10");
    expect(match.length).toBe(3);
    expect([...match.captures]).toEqual(["tender", "10"]);
  });

  it("star with custom re", () => {
    const z = /\d+/;
    const path = buildPath("/page/*foo", { foo: z }, SEPARATORS, true);
    expect(path.toRegexp().source).toBe(new RegExp(`^/page/(${z.source})$`).source);
  });

  it("insensitive regexp with group", () => {
    const path = buildPath("/page/:name/aaron", { name: /(tender|love)/i }, SEPARATORS, true);
    expect("/page/TENDER/aaron").toMatch(path.toRegexp());
    expect("/page/loVE/aaron").toMatch(path.toRegexp());
    expect("/page/loVE/AAron").not.toMatch(path.toRegexp());
  });

  it("to regexp with strexp", () => {
    const path = buildPath("/:controller", {}, SEPARATORS, true);
    const x = /^\/([^/.?]+)$/;

    expect(path.source).toBe(x.source);
  });

  it("to regexp defaults", () => {
    const path = pathFromString("/:controller(/:action(/:id))");
    const expected = /^\/([^/.?]+)(?:\/([^/.?]+)(?:\/([^/.?]+))?)?$/;
    expect(path.toRegexp().source).toBe(expected.source);
  });

  it("failed match", () => {
    const path = pathFromString("/:controller(/:action(/:id(.:format)))");
    const uri = "content";

    expect(path.match(uri)).toBeFalsy();
  });

  it("match controller", () => {
    const path = pathFromString("/:controller(/:action(/:id(.:format)))");
    const uri = "/content";

    const match = path.match(uri)!;
    expect(match.names).toEqual(["controller", "action", "id", "format"]);
    expect(match.at(1)).toBe("content");
    expect(match.at(2)).toBeUndefined();
    expect(match.at(3)).toBeUndefined();
    expect(match.at(4)).toBeUndefined();
  });

  it("match controller action", () => {
    const path = pathFromString("/:controller(/:action(/:id(.:format)))");
    const uri = "/content/list";

    const match = path.match(uri)!;
    expect(match.names).toEqual(["controller", "action", "id", "format"]);
    expect(match.at(1)).toBe("content");
    expect(match.at(2)).toBe("list");
    expect(match.at(3)).toBeUndefined();
    expect(match.at(4)).toBeUndefined();
  });

  it("match controller action id", () => {
    const path = pathFromString("/:controller(/:action(/:id(.:format)))");
    const uri = "/content/list/10";

    const match = path.match(uri)!;
    expect(match.names).toEqual(["controller", "action", "id", "format"]);
    expect(match.at(1)).toBe("content");
    expect(match.at(2)).toBe("list");
    expect(match.at(3)).toBe("10");
    expect(match.at(4)).toBeUndefined();
  });

  it("match literal", () => {
    const path = pathFromString("/books(/:action(.:format))");

    const uri = "/books";
    const match = path.match(uri)!;
    expect(match.names).toEqual(["action", "format"]);
    expect(match.at(1)).toBeUndefined();
    expect(match.at(2)).toBeUndefined();
  });

  it("match literal with action", () => {
    const path = pathFromString("/books(/:action(.:format))");

    const uri = "/books/list";
    const match = path.match(uri)!;
    expect(match.names).toEqual(["action", "format"]);
    expect(match.at(1)).toBe("list");
    expect(match.at(2)).toBeUndefined();
  });

  it("match literal with action and format", () => {
    const path = pathFromString("/books(/:action(.:format))");

    const uri = "/books/list.rss";
    const match = path.match(uri)!;
    expect(match.names).toEqual(["action", "format"]);
    expect(match.at(1)).toBe("list");
    expect(match.at(2)).toBe("rss");
  });

  it("named captures", () => {
    const path = pathFromString("/books(/:action(.:format))");

    const uri = "/books/list.rss";
    const match = path.match(uri)!;
    const namedCaptures = { action: "list", format: "rss" };
    expect(match.namedCaptures).toEqual(namedCaptures);
  });

  it("requirements for missing keys check", () => {
    const nameRegex = /test/;

    const path = buildPath("/page/:name", { name: nameRegex }, SEPARATORS, true);

    const transformedRegex = path.requirementsForMissingKeysCheck["name"];
    expect(transformedRegex).toBeDefined();
    expect(transformedRegex.source).toBe(new RegExp(`^(?:${nameRegex.source})$`).source);
  });

  it("requirements for missing keys check memoization", () => {
    const path = buildPath("/page/:name", { name: /test/ }, SEPARATORS, true);

    const firstCall = path.requirementsForMissingKeysCheck;
    const secondCall = path.requirementsForMissingKeysCheck;

    expect(firstCall).toBe(secondCall);
  });
});
