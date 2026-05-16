import { describe, it, expect } from "vitest";
import { X_CASCADE } from "../constants.js";
import { Parser } from "./parser.js";
import { Ast } from "./ast.js";
import { Pattern } from "./path/pattern.js";
import { Route, VerbMatchers } from "./route.js";
import { Routes } from "./routes.js";
import { Router, type RouterRequest, type RackishResponse } from "./router.js";

function pat(path: string, requirements: Record<string, RegExp> = {}, anchored = true): Pattern {
  const tree = new Parser().parse(path);
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, "/.?", anchored);
}

function okApp(body: string): { serve: () => RackishResponse } {
  return { serve: () => [200, { "content-type": "text/plain" }, [body]] };
}

function cascadeApp(): { serve: () => RackishResponse } {
  return { serve: () => [404, { [X_CASCADE]: "pass" }, ["pass"]] };
}

function buildRoutes(routes: Route[]): Routes {
  const r = new Routes(routes);
  for (const route of routes) r.partitionRoute(route);
  return r;
}

function req(opts: Partial<RouterRequest> & { pathInfo: string }): RouterRequest {
  return {
    scriptName: "",
    requestMethod: "GET",
    pathParameters: {},
    routeUriPattern: null,
    ...opts,
  };
}

describe("ActionDispatch::Journey::Router", () => {
  it("serve() dispatches to the matching route's app", () => {
    const route = new Route({
      name: "p",
      app: okApp("posts"),
      path: pat("/posts"),
    });
    const router = new Router(buildRoutes([route]));
    const response = router.serve(req({ pathInfo: "/posts" }));
    expect(response[0]).toBe(200);
    expect(response[2]).toEqual(["posts"]);
  });

  it("serve() returns 404 + X-Cascade=pass when no route matches", () => {
    const router = new Router(buildRoutes([]));
    const response = router.serve(req({ pathInfo: "/nope" }));
    expect(response[0]).toBe(404);
    expect(response[1][X_CASCADE]).toBe("pass");
  });

  it("serve() honors X-Cascade=pass and tries the next matching route", () => {
    const passing = new Route({ name: "a", app: cascadeApp(), path: pat("/a"), precedence: 1 });
    const winning = new Route({ name: "b", app: okApp("won"), path: pat("/a"), precedence: 2 });
    const router = new Router(buildRoutes([passing, winning]));
    const r = req({ pathInfo: "/a" });
    const response = router.serve(r);
    expect(response[2]).toEqual(["won"]);
    expect(r.pathParameters).toEqual({});
  });

  it("serve() injects path parameters + defaults onto the request", () => {
    let seen: Record<string, unknown> = {};
    const app = {
      serve: (req: RouterRequest): RackishResponse => {
        seen = { ...req.pathParameters };
        return [200, {}, ["ok"]];
      },
    };
    const route = new Route({
      name: "show",
      app,
      path: pat("/posts/:id"),
      defaults: { controller: "posts" },
    });
    const router = new Router(buildRoutes([route]));
    router.serve(req({ pathInfo: "/posts/42" }));
    expect(seen).toEqual({ controller: "posts", id: "42" });
  });

  it("serve() sets routeUriPattern from the matched route", () => {
    let pattern: string | null | undefined;
    const app = {
      serve: (req: RouterRequest): RackishResponse => {
        pattern = req.routeUriPattern;
        return [200, {}, ["ok"]];
      },
    };
    const route = new Route({ name: "p", app, path: pat("/posts/:id") });
    const router = new Router(buildRoutes([route]));
    router.serve(req({ pathInfo: "/posts/1" }));
    expect(pattern).toContain("/posts");
  });

  it("recognize() yields each matching route + merged defaults", () => {
    const route = new Route({
      name: "show",
      app: okApp("x"),
      path: pat("/posts/:id"),
      defaults: { controller: "posts" },
    });
    const router = new Router(buildRoutes([route]));
    const found: [string, Record<string, unknown>][] = [];
    router.recognize(req({ pathInfo: "/posts/7" }), (r, params) => {
      found.push([r.name, params]);
    });
    expect(found).toEqual([["show", { controller: "posts", id: "7" }]]);
  });

  it("serve() filters by HTTP verb", () => {
    const getRoute = new Route({
      name: "g",
      app: okApp("get"),
      path: pat("/x"),
      requestMethodMatch: [VerbMatchers.for("GET")],
    });
    const postRoute = new Route({
      name: "p",
      app: okApp("post"),
      path: pat("/x"),
      requestMethodMatch: [VerbMatchers.for("POST")],
    });
    const router = new Router(buildRoutes([getRoute, postRoute]));
    expect(router.serve(req({ pathInfo: "/x", requestMethod: "POST" }))[2]).toEqual(["post"]);
    expect(router.serve(req({ pathInfo: "/x", requestMethod: "GET" }))[2]).toEqual(["get"]);
  });

  it("HEAD falls back to GET routes when no HEAD-specific route exists", () => {
    const getRoute = new Route({
      name: "g",
      app: okApp("get"),
      path: pat("/x"),
      requestMethodMatch: [VerbMatchers.for("GET")],
    });
    const router = new Router(buildRoutes([getRoute]));
    expect(router.serve(req({ pathInfo: "/x", requestMethod: "HEAD" }))[0]).toBe(200);
  });

  it("URI-decodes captured parameters", () => {
    let seen: Record<string, unknown> = {};
    const app = {
      serve: (req: RouterRequest): RackishResponse => {
        seen = { ...req.pathParameters };
        return [200, {}, ["ok"]];
      },
    };
    const route = new Route({ name: "show", app, path: pat("/posts/:slug") });
    const router = new Router(buildRoutes([route]));
    router.serve(req({ pathInfo: "/posts/hello%20world" }));
    expect(seen["slug"]).toBe("hello world");
  });

  it("recognize() stops iterating when the block returns true", () => {
    const r1 = new Route({ name: "a", app: okApp("a"), path: pat("/x") });
    const r2 = new Route({ name: "b", app: okApp("b"), path: pat("/x") });
    const router = new Router(buildRoutes([r1, r2]));
    const seen: string[] = [];
    router.recognize(req({ pathInfo: "/x" }), (route) => {
      seen.push(route.name);
      return true;
    });
    expect(seen).toEqual(["a"]);
  });

  it("recognize() continues when the block returns undefined", () => {
    const r1 = new Route({ name: "a", app: okApp("a"), path: pat("/x") });
    const r2 = new Route({ name: "b", app: okApp("b"), path: pat("/x") });
    const router = new Router(buildRoutes([r1, r2]));
    const seen: string[] = [];
    router.recognize(req({ pathInfo: "/x" }), (route) => {
      seen.push(route.name);
    });
    expect(seen).toEqual(["a", "b"]);
  });

  it("recognize() continues when the block returns explicit false", () => {
    const r1 = new Route({ name: "a", app: okApp("a"), path: pat("/x") });
    const r2 = new Route({ name: "b", app: okApp("b"), path: pat("/x") });
    const router = new Router(buildRoutes([r1, r2]));
    const seen: string[] = [];
    router.recognize(req({ pathInfo: "/x" }), (route) => {
      seen.push(route.name);
      return false;
    });
    expect(seen).toEqual(["a", "b"]);
  });

  it("recognize() accepts callbacks that incidentally return non-boolean values", () => {
    // Regression test: an expression-bodied callback like
    // `(r) => arr.push(r.name)` (which returns the new length, a number)
    // must remain type-compatible with the unknown-return block signature.
    const r1 = new Route({ name: "a", app: okApp("a"), path: pat("/x") });
    const r2 = new Route({ name: "b", app: okApp("b"), path: pat("/x") });
    const router = new Router(buildRoutes([r1, r2]));
    const seen: string[] = [];
    router.recognize(req({ pathInfo: "/x" }), (route) => seen.push(route.name));
    expect(seen).toEqual(["a", "b"]);
  });

  it("eagerLoadBang() initializes the simulator without throwing", () => {
    const route = new Route({ name: "p", app: okApp("ok"), path: pat("/x") });
    const router = new Router(buildRoutes([route]));
    expect(() => router.eagerLoadBang()).not.toThrow();
  });
});
