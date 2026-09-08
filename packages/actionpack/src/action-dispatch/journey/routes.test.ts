import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { Ast } from "./ast.js";
import { Pattern } from "./path/pattern.js";
import { Route } from "./route.js";
import { Routes, type Mapping } from "./routes.js";
import { RouteSet } from "../routing/route-set.js";
import { ArgumentError } from "@blazetrails/activemodel";

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
  it("clear", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    expect(routes.isEmpty()).toBe(false);
    expect(routes.length).toBe(1);
    routes.clear();
    expect(routes.isEmpty()).toBe(true);
    expect(routes.length).toBe(0);
  });

  it("ast", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    const ast = routes.ast;
    routes.addRoute("gorby", mappingFor("/foo(/:id)"));
    expect(routes.ast).not.toBe(ast);
  });

  it("simulator changes", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    const sim = routes.simulator;
    routes.addRoute("gorby", mappingFor("/foo(/:id)"));
    expect(routes.simulator).not.toBe(sim);
  });

  it("partition route", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo(/:id)"));
    expect(routes.anchoredRoutes.length).toBe(1);
    expect(routes.customRoutes.length).toBe(0);

    routes.addRoute("bar", mappingFor("/not_anchored/hello/:who-notanchored", false));
    expect(routes.customRoutes.length).toBe(1);
    expect(routes.anchoredRoutes.length).toBe(1);
  });

  it("custom anchored not partition route", () => {
    const routes = new Routes();
    routes.addRoute("aaron", mappingFor("/foo/:bar"));
    expect(routes.anchoredRoutes.length).toBe(1);

    routes.addRoute("bar", mappingFor("/:user/:repo", true, { repo: /[\w.]+/ }));
    expect(routes.anchoredRoutes.length).toBe(2);
    expect(routes.customRoutes.length).toBe(0);
  });

  it("first name wins", () => {
    const routeSet = new RouteSet();
    routeSet.draw((mapper) => {
      mapper.get("/hello", { to: "foo#bar", as: "aaron" });
    });
    expect(() =>
      routeSet.draw((mapper) => {
        mapper.get("/aaron", { to: "foo#bar", as: "aaron" });
      }),
    ).toThrow(ArgumentError);
  });
});
