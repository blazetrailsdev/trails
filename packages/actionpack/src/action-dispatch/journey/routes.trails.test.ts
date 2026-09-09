import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { Ast } from "./ast.js";
import { Pattern } from "./path/pattern.js";
import { Route } from "./route.js";
import { Routes, type Mapping } from "./routes.js";

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
