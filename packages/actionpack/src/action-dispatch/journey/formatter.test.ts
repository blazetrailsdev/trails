import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { Ast } from "./ast.js";
import { Pattern } from "./path/pattern.js";
import { Route } from "./route.js";
import { Routes } from "./routes.js";
import { Formatter, MissingRoute, RouteWithParams, UrlGenerationError } from "./formatter.js";

function makePattern(path: string, requirements: Record<string, RegExp> = {}): Pattern {
  const tree = new Parser().parse(path);
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, "/.?", true);
}

function makeRoute(
  name: string,
  path: string,
  opts: {
    defaults?: Record<string, unknown>;
    requirements?: Record<string, RegExp>;
    requiredDefaults?: readonly string[];
    dispatcher?: boolean;
  } = {},
): Route {
  const app = opts.dispatcher ? { dispatcher: () => true } : undefined;
  return new Route({
    name,
    app,
    path: makePattern(path, opts.requirements ?? {}),
    defaults: opts.defaults ?? {},
    requiredDefaults: opts.requiredDefaults,
  });
}

function buildHost(named: Record<string, Route>, routesList: Route[] = Object.values(named)) {
  const routes = new Routes(routesList);
  for (const r of routesList) routes.partitionRoute(r);
  return {
    routes,
    namedRoutes: {
      has: (n: string) => Object.hasOwn(named, n),
      get: (n: string) => named[n],
    },
  };
}

describe("ActionDispatch::Journey::Formatter", () => {
  it("generates a URL for a named route", () => {
    const r = makeRoute("show", "/posts/:id(.:format)");
    const f = new Formatter(buildHost({ show: r }));
    const result = f.generate("show", { id: 7 }, {});
    expect(result).toBeInstanceOf(RouteWithParams);
    expect((result as RouteWithParams).path()).toBe("/posts/7");
  });

  it("preserves extra options as query params (deleting consumed keys)", () => {
    const r = makeRoute("show", "/posts/:id");
    const f = new Formatter(buildHost({ show: r }));
    const result = f.generate("show", { id: 1, page: 2 }, {}) as RouteWithParams;
    expect(result.path()).toBe("/posts/1");
    expect(result.params).toEqual({ page: 2 });
  });

  it("returns MissingRoute when required parts are missing", () => {
    const r = makeRoute("show", "/posts/:id");
    const f = new Formatter(buildHost({ show: r }));
    const result = f.generate("show", {}, {});
    expect(result).toBeInstanceOf(MissingRoute);
    expect((result as MissingRoute).missingKeys).toEqual(["id"]);
  });

  it("MissingRoute#path raises UrlGenerationError", () => {
    const r = makeRoute("show", "/posts/:id");
    const f = new Formatter(buildHost({ show: r }));
    const result = f.generate("show", {}, {}) as MissingRoute;
    expect(() => result.path("post_path")).toThrow(UrlGenerationError);
  });

  it("anonymous lookup only picks dispatcher routes", () => {
    const dispatchable = makeRoute("a", "/a", { dispatcher: true });
    const plain = makeRoute("b", "/b");
    const host = buildHost({}, [dispatchable, plain]);
    const f = new Formatter(host);
    expect(f.generate(null, {}, {})).toBeInstanceOf(RouteWithParams);
  });

  it("anonymous lookup with no dispatcher routes returns MissingRoute", () => {
    const plain = makeRoute("b", "/b");
    const host = buildHost({}, [plain]);
    const f = new Formatter(host);
    expect(f.generate(null, {}, {})).toBeInstanceOf(MissingRoute);
  });

  it("strips trailing parts equal to defaults", () => {
    const r = makeRoute("idx", "/:controller(/:action(/:id))", {
      defaults: { action: "index" },
    });
    const f = new Formatter(buildHost({ idx: r }));
    const result = f.generate(
      "idx",
      { controller: "posts", action: "index" },
      {},
    ) as RouteWithParams;
    expect(result.path()).toBe("/posts");
  });

  it("keeps trailing parts that differ from defaults", () => {
    const r = makeRoute("idx", "/:controller(/:action)", {
      defaults: { action: "index" },
    });
    const f = new Formatter(buildHost({ idx: r }));
    const result = f.generate(
      "idx",
      { controller: "posts", action: "edit" },
      {},
    ) as RouteWithParams;
    expect(result.path()).toBe("/posts/edit");
  });

  it("validates parts against requirements regex (missing_keys)", () => {
    const r = makeRoute("show", "/posts/:id", { requirements: { id: /\d+/ } });
    const f = new Formatter(buildHost({ show: r }));
    const result = f.generate("show", { id: "abc" }, {});
    expect(result).toBeInstanceOf(MissingRoute);
    expect((result as MissingRoute).unmatchedKeys).toContain("id");
  });

  it("clear() and eagerLoadBang() exercise the cache", () => {
    const r = makeRoute("a", "/a", {
      dispatcher: true,
      requiredDefaults: ["controller"],
      defaults: { controller: "x" },
    });
    const f = new Formatter(buildHost({}, [r]));
    f.eagerLoadBang();
    f.clear();
    expect(f.generate(null, { controller: "x" }, {})).toBeInstanceOf(RouteWithParams);
  });

  it("treats falsey-but-present values (0, empty string) as supplied (Ruby semantics)", () => {
    const r = makeRoute("show", "/posts/:id");
    const f = new Formatter(buildHost({ show: r }));
    const zero = f.generate("show", { id: 0 }, {}) as RouteWithParams;
    expect(zero.path()).toBe("/posts/0");
    // Empty string is truthy in Ruby (`unless ""` is false), so it's "supplied".
    const empty = f.generate("show", { id: "" }, {}) as RouteWithParams;
    expect(empty.path()).toBe("/posts/");
  });

  it("pathParams option merges underneath top-level options", () => {
    const r = makeRoute("show", "/posts/:id");
    const f = new Formatter(buildHost({ show: r }));
    const result = f.generate("show", { pathParams: { id: 1 }, q: "x" }, {}) as RouteWithParams;
    expect(result.path()).toBe("/posts/1");
    expect(result.params).toEqual({ q: "x" });
  });
});
