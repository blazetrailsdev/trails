import { describe, it, expect } from "vitest";
import { Parser } from "../../../lib/action-dispatch/journey/parser.js";
import { Ast } from "../../../lib/action-dispatch/journey/nodes/node.js";
import { Pattern } from "../../../lib/action-dispatch/journey/path/pattern.js";
import { Route } from "../../../lib/action-dispatch/journey/route.js";
import { Routes, type Mapping } from "../../../lib/action-dispatch/journey/routes.js";

function makePattern(path: string): Pattern {
  const tree = new Parser().parse(path)!;
  const ast = new Ast(tree, true);
  return new Pattern(ast, {}, "/.?", true);
}

function mappingFor(path: string): Mapping {
  return {
    makeRoute: (name) => new Route({ name, path: makePattern(path) }),
  };
}

describe("ActionDispatch::Journey::Routes", () => {
  it("iterates routes via for..of", () => {
    const routes = new Routes();
    routes.addRoute("a", mappingFor("/a"));
    routes.addRoute("b", mappingFor("/b"));
    const names = [...routes].map((r) => r.name);
    expect(names).toEqual(["a", "b"]);
  });

  it("size === length and last returns the last-added route", () => {
    const routes = new Routes();
    routes.addRoute("a", mappingFor("/a"));
    const second = routes.addRoute("b", mappingFor("/b"));
    expect(routes.size).toBe(2);
    expect(routes.length).toBe(2);
    expect(routes.last).toBe(second);
  });
});
