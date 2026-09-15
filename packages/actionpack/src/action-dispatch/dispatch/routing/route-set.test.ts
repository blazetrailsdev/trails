import { beforeAll, describe, it, expect } from "vitest";
import { MockRequest } from "@blazetrails/rack";
import { controllerConstants } from "../../http/request.js";
import type { DispatchableControllerClass } from "../../routing/dispatcher.js";
import { RouteSet } from "../../routing/route-set.js";
import { Route } from "../../routing/route.js";
import { escapeSegment } from "../../journey/router/utils.js";

class StubController {}

beforeAll(() => {
  controllerConstants.set("posts", StubController as unknown as DispatchableControllerClass);
});

describe("RouteSetTest", () => {
  it("not being empty when route is added", () => {
    const routes = new RouteSet();
    expect(routes.getRoutes().length).toBe(0);
    routes.draw((r) => {
      r.get("/foo", { to: "foo#index" });
    });
    expect(routes.getRoutes().length).toBeGreaterThan(0);
  });

  it("URL helpers are added when route is added", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo", { to: "foo#index", as: "foo" });
    });
    expect(routes.pathFor({}, "foo")).toBe("/foo");
    expect(() => routes.pathFor({}, "bar")).toThrow();
  });

  it("URL helpers are updated when route is updated", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/bar", { to: "bar#index", as: "bar" });
    });
    expect(routes.pathFor({}, "bar")).toBe("/bar");
  });

  it("find a route for the given requirements", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("foo");
      r.resources("bar");
    });
    const m = routes.recognize("GET", "/bar");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("bar");
    expect(m!.route.action).toBe("index");
  });

  it("find a route for the given requirements returns nil for no match", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("foo");
    });
    expect(routes.recognize("GET", "/baz")).toBeNull();
  });

  it("URL helpers are removed when route is removed", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo", { to: "foo#index", as: "foo" });
    });
    expect(routes.pathFor({}, "foo")).toBe("/foo");
    routes.clear();
    expect(() => routes.pathFor({}, "foo")).toThrow();
    expect(routes.getRoutes().length).toBe(0);
  });

  it("only_path: true with *_url and no :host option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor({ id: 1, onlyPath: true }, "post")).toBe("/posts/1");
  });

  it("only_path: false with *_url and no :host option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.urlFor({ id: 1, onlyPath: false }, "post")).toThrow(/Missing host/);
  });

  it("only_path: false with *_url and local :host option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor({ id: 1, host: "example.com" }, "post")).toBe(
      "http://example.com/posts/1",
    );
  });

  it("only_path: false with *_url and global :host option", () => {
    const routes = new RouteSet();
    routes.setDefaultUrlOptions({ host: "example.org" });
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor({ id: 1 }, "post")).toBe("http://example.org/posts/1");
  });

  it("explicit keys win over implicit keys", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: 42 }, "post")).toBe("/posts/42");
  });

  it("having an optional scope with resources", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts");
    });
    expect(routes.recognize("GET", "/posts")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1")).not.toBeNull();
  });

  it("implicit path components consistently return the same result", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor({ id: 1 }, "post")).toBe("/posts/1");
    expect(routes.pathFor({ id: 1 }, "post")).toBe("/posts/1");
  });

  it("escape new line for dynamic params", () => {
    expect(escapeSegment("hello\nworld")).toBe("hello%0Aworld");
  });

  it("escape new line for wildcard params", () => {
    expect(escapeSegment("a\nb")).toBe("a%0Ab");
  });

  it("isEmpty and clearBang", () => {
    const routes = new RouteSet();
    expect(routes.isEmpty()).toBe(true);
    routes.draw((r) => r.get("/x", { to: "x#i", as: "x" }));
    expect(routes.isEmpty()).toBe(false);
    routes.clearBang();
    expect(routes.isEmpty()).toBe(true);
    expect(routes.getNamedRoutes().has("x")).toBe(false);
  });

  it("append/finalizeBang and prepend/clearBang", () => {
    const routes = new RouteSet();
    routes.append((r) => r.get("/late", { to: "late#i" }));
    routes.finalizeBang();
    expect(routes.recognize("GET", "/late")).not.toBeNull();
    routes.prepend((r) => r.get("/seed", { to: "seed#i" }));
    routes.clearBang();
    expect(routes.recognize("GET", "/seed")).not.toBeNull();
  });

  it("addRoute rejects invalid names", () => {
    const routes = new RouteSet();
    expect(() => routes.addRoute(new Route("GET", "/x", "x", "i"), "9bad")).toThrow(
      /Invalid route name/,
    );
  });

  it("recognizePathWithRequest merges defaults+params+extras and raise/no-raise", () => {
    const routes = new RouteSet();
    routes.draw((r) => r.get("/posts/:id", { to: "posts#show" }));
    expect(
      routes.recognizePathWithRequest(
        routes.makeRequest(MockRequest.envFor("/posts/42")),
        "/posts/42",
        { from: "test" },
      ),
    ).toMatchObject({ controller: "posts", action: "show", id: "42", from: "test" });
    expect(() =>
      routes.recognizePathWithRequest(routes.makeRequest(MockRequest.envFor("/nope")), "/nope", {}),
    ).toThrow(/No route matches/);
    expect(
      routes.recognizePathWithRequest(
        routes.makeRequest(MockRequest.envFor("/nope")),
        "/nope",
        {},
        { raiseOnMissing: false },
      ),
    ).toBeUndefined();
  });

  it("findScriptName, isOptimizeRoutesGeneration, extraKeys", () => {
    const routes = new RouteSet();
    const opts: Record<string, unknown> = { scriptName: "/app", x: 1 };
    expect(routes.findScriptName(opts)).toBe("/app");
    expect(opts).toEqual({ x: 1 });
    expect(routes.isOptimizeRoutesGeneration()).toBe(true);
    routes.setDefaultUrlOptions({ host: "ex.com" });
    expect(routes.isOptimizeRoutesGeneration()).toBe(false);
    routes.draw((r) => r.get("/posts/:id", { to: "posts#show", as: "post" }));
    expect(routes.extraKeys({ controller: "posts", action: "show", id: 1, page: 2 })).toEqual([
      "page",
    ]);
  });
});
