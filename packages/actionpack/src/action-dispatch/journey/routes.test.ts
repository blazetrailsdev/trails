import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { Ast } from "./ast.js";
import { Pattern } from "./path/pattern.js";
import { Route } from "./route.js";
import { Routes, type Mapping } from "./routes.js";

function makePattern(
  path: string,
  requirements: Record<string, RegExp> = {},
  anchored = true,
): Pattern {
  const tree = new Parser().parse(path);
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, "/.?", anchored);
}

function mappingFor(
  path: string,
  anchored = true,
  requirements: Record<string, RegExp> = {},
): Mapping {
  return {
    makeRoute: (name) => new Route({ name, path: makePattern(path, requirements, anchored) }),
  };
}

describe("ActionDispatch::Journey::Routes", () => {
  it("test_clear", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    expect(routes.isEmpty()).toBe(false);
    expect(routes.length).toBe(1);
    routes.clear();
    expect(routes.isEmpty()).toBe(true);
    expect(routes.length).toBe(0);
  });

  it("test_ast (clears cache when a route is added)", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    const ast = routes.ast;
    routes.addRoute("gorby", mappingFor("/foo(/:id)"));
    expect(routes.ast).not.toBe(ast);
  });

  it("test_simulator_changes", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    const sim = routes.simulator;
    routes.addRoute("gorby", mappingFor("/foo(/:id)"));
    expect(routes.simulator).not.toBe(sim);
  });

  it("test_partition_route (anchored vs custom)", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    expect(routes.anchoredRoutes.length).toBe(1);
    expect(routes.customRoutes.length).toBe(0);

    // anchor: false → custom_routes
    routes.addRoute("bar", mappingFor("/not_anchored/hello/:who-notanchored", false));
    expect(routes.customRoutes.length).toBe(1);
    expect(routes.anchoredRoutes.length).toBe(1);
  });

  it("test_custom_anchored_not_partition_route", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo/:bar"));
    expect(routes.anchoredRoutes.length).toBe(1);

    routes.addRoute("bar", mappingFor("/:user/:repo", true, { repo: /[\w.]+/ }));
    expect(routes.anchoredRoutes.length).toBe(2);
    expect(routes.customRoutes.length).toBe(0);
  });

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
