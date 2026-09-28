import { describe, expect, it, vi } from "vitest";

import { Constraints, Mapper, Scope, type ConstraintsRequest } from "./mapper.js";
import { RouteSet } from "./route-set.js";
import type { Request } from "../http/request.js";
import { X_CASCADE } from "../constants.js";
import { deprecator } from "../deprecator.js";

function fakeRequest(): ConstraintsRequest & Request {
  return {
    env: { PATH_INFO: "/" },
    pathParameters: { id: "1" },
  } as unknown as ConstraintsRequest & Request;
}

describe("ActionDispatch::Routing::Mapper::Constraints", () => {
  it("invokes a function constraint with the constraint as this", () => {
    const receivers: unknown[] = [];
    const constraint = function (this: unknown) {
      receivers.push(this);
      return true;
    };
    const c = new Constraints({}, [constraint], Constraints.SERVE);
    expect(c.matches(fakeRequest())).toBe(true);
    expect(receivers).toEqual([constraint]);
  });

  it("hands each constraint the arguments its arity asks for", () => {
    const req = fakeRequest();
    const seen: unknown[][] = [];
    const zero = () => (seen.push([]), true);
    const one = (r: unknown) => (seen.push([r]), true);
    const two = (params: unknown, r: unknown) => (seen.push([params, r]), true);
    new Constraints({}, [zero, one, two], Constraints.SERVE).matches(req);
    expect(seen).toEqual([[], [req], [req.pathParameters, req]]);
  });

  it("reads arity off the call method of a call-answering object", () => {
    const req = fakeRequest();
    let args: unknown[] = [];
    const constraint = {
      call(params: unknown, r: unknown) {
        args = [params, r];
        return true;
      },
    };
    new Constraints({}, [constraint], Constraints.SERVE).matches(req);
    expect(args).toEqual([req.pathParameters, req]);
  });

  it("prefers an explicit arity over the callable's own", () => {
    const req = fakeRequest();
    let args: unknown[] = [];
    const constraint = Object.assign((...a: unknown[]) => ((args = a), true), { arity: 1 });
    new Constraints({}, [constraint], Constraints.SERVE).matches(req);
    expect(args).toEqual([req]);
  });

  it("falls back to call when matches? is falsy", () => {
    const constraint = { matches: () => false, call: () => true };
    expect(new Constraints({}, [constraint], Constraints.SERVE).matches(fakeRequest())).toBe(true);
  });

  it("CALL invokes a function app and a call-answering app with env", () => {
    const req = fakeRequest();
    const fn = (env: unknown) => ["fn", env];
    const obj = { call: (env: unknown) => ["obj", env] };
    expect(new Constraints(fn, [], Constraints.CALL).serve(req)).toEqual(["fn", req.env]);
    expect(new Constraints(obj, [], Constraints.CALL).serve(req)).toEqual(["obj", req.env]);
  });

  it("SERVE hands the request to the app's serve and is a dispatcher", () => {
    const req = fakeRequest();
    const app = { serve: (r: unknown) => ["served", r] };
    const serve = new Constraints(app, [], Constraints.SERVE);
    expect(serve.serve(req)).toEqual(["served", req]);
    expect(serve.dispatcher()).toBe(true);
    expect(new Constraints(app, [], Constraints.CALL).dispatcher()).toBe(false);
  });

  it("cascades with X-Cascade: pass when a constraint rejects the request", () => {
    const app = { serve: () => ["served"] };
    const c = new Constraints(app, [() => false], Constraints.SERVE);
    expect(c.serve(fakeRequest())).toEqual([404, { [X_CASCADE]: "pass" }, []]);
  });

  it("unwraps a Constraints app, appending its constraints", () => {
    const app = { serve: () => ["served"] };
    const outer = () => true;
    const inner = () => true;
    const wrapped = new Constraints(
      new Constraints(app, [inner], Constraints.SERVE),
      [outer],
      Constraints.SERVE,
    );
    expect(wrapped.app()).toBe(app);
    expect(wrapped.constraints).toEqual([outer, inner]);
  });
});

describe("Mapper#nested under a singleton resource", () => {
  it("constrains the nested param as SingletonResource#nested_param names it", () => {
    const set = new RouteSet();
    const m = new Mapper(set);
    let nestedConstraints: unknown;
    m.resource("session", { constraints: { id: /\d+/ } }, () => {
      m.resources("infos");
      m.nested(() => {
        nestedConstraints = m._scope.get("constraints");
      });
    });
    const index = set.routes.routes.find(
      (r) => r.defaults.action === "index" && String(r.defaults.controller).endsWith("infos"),
    );
    expect(index?.path.spec.toString()).toBe("/session/infos(.:format)");
    expect(index?.name).toBe("session_infos");
    expect((nestedConstraints as Record<string, unknown>)["session_id"]).toEqual(/\d+/);
  });
});

describe("Mapper#match hash form and multi-path arms", () => {
  it("takes the route path from the one key that is not a Symbol", () => {
    const set = new RouteSet();
    new Mapper(set).match({ "/foo": "posts#index", ":via": "get" });
    const [route] = set.routes.routes;
    expect(route.path.spec.toString()).toBe("/foo(.:format)");
    expect(route.defaults.controller).toBe("posts");
    expect(route.defaults.action).toBe("index");
  });

  it("keys a multi-word Symbol option by its camelCase name", () => {
    const m = new Mapper(new RouteSet());
    let received: unknown;
    vi.spyOn(m, "mapMatch").mockImplementation((_paths, options) => void (received = options));
    m.match({ "/foo": "posts#index", ":via": "get", ":path_names": { new: "nuevo" } });
    expect(received).toEqual({
      via: "get",
      pathNames: { new: "nuevo" },
      to: "posts#index",
    });
  });

  it("leaves a second String key as it is", () => {
    const m = new Mapper(new RouteSet());
    let received: unknown;
    vi.spyOn(m, "mapMatch").mockImplementation((_paths, options) => void (received = options));
    m.match({ "/foo": "posts#index", extra: "x", ":via": "get" });
    expect(received).toEqual({ extra: "x", via: "get", to: "posts#index" });
  });

  it("raises when no route path is specified", () => {
    expect(() => new Mapper(new RouteSet()).match({ ":to": "posts#index", ":via": "get" })).toThrow(
      "Route path not specified",
    );
  });

  it("maps a Symbol to onto :action and a String to without # onto :controller", () => {
    const set = new RouteSet();
    const m = new Mapper(set);
    m.controller("posts", () => m.match({ "/all": ":index", ":via": "get" }));
    m.match({ "/comments/:action": "comments", ":via": "get" });
    const [all, comments] = set.routes.routes;
    expect([all.defaults.controller, all.defaults.action]).toEqual(["posts", "index"]);
    expect(comments.defaults.controller).toBe("comments");
  });

  it("maps every path of the multi-path form and warns that it is deprecated", () => {
    const set = new RouteSet();
    const warnings: string[] = [];
    const m = new Mapper(set);
    const dep = deprecator();
    const previous = dep.behavior;
    dep.behavior = (message: unknown) => void warnings.push(String(message));
    try {
      m.match("/one", "/two", { to: "posts#index", via: "get" });
    } finally {
      dep.behavior = previous;
    }
    expect(set.routes.routes.map((r) => r.path.spec.toString())).toEqual([
      "/one(.:format)",
      "/two(.:format)",
    ]);
    expect(warnings[0]).toContain("Mapping a route with multiple paths is deprecated");
  });
});

describe("Mapper HTTP verb helpers forward args through map_method", () => {
  it("draws the hash form through match's hash arm", () => {
    const set = new RouteSet();
    const m = new Mapper(set);
    expect(m.get({ "/foo": "posts#index" })).toBe(m);
    const [route] = set.routes.routes;
    expect(route.path.spec.toString()).toBe("/foo(.:format)");
    expect(route.verb).toBe("GET");
    expect([route.defaults.controller, route.defaults.action]).toEqual(["posts", "index"]);
  });

  it("maps every path of the multi-path form", () => {
    const set = new RouteSet();
    const m = new Mapper(set);
    const dep = deprecator();
    const previous = dep.behavior;
    dep.behavior = () => {};
    try {
      m.post("/one", "/two", { to: "posts#create" });
    } finally {
      dep.behavior = previous;
    }
    expect(set.routes.routes.map((r) => [r.verb, r.path.spec.toString()])).toEqual([
      ["POST", "/one(.:format)"],
      ["POST", "/two(.:format)"],
    ]);
  });

  it("connect maps GET and CONNECT", () => {
    const set = new RouteSet();
    new Mapper(set).connect("/live", { to: "live#index" });
    expect(set.routes.routes[0].verb).toBe("GET|CONNECT");
  });
});

describe("Mapper::Scope", () => {
  it("root is the ROOT sentinel; isRoot reports children of ROOT", () => {
    expect(Scope.ROOT.isNull()).toBe(false);
    const child = new Scope({ path: "/admin" });
    expect(child.isRoot()).toBe(true);
    expect(child.isNull()).toBe(false);
  });

  it("newChild merges over parent frame and inherits scopeLevel", () => {
    const a = new Scope({ path: "/admin", as: "admin" }, Scope.ROOT, "resources");
    const b = a.new({ as: "users" });
    expect(b.get("path")).toBe("/admin");
    expect(b.get("as")).toBe("users");
    expect(b.scopeLevel).toBe("resources");
    expect(b.parent).toBe(a);
  });

  it("newLevel preserves frame, changes scopeLevel", () => {
    const a = new Scope({ path: "/admin" }, Scope.ROOT, "resources");
    const b = a.newLevel("nested");
    expect(b.get("path")).toBe("/admin");
    expect(b.scopeLevel).toBe("nested");
    expect(b.isNested()).toBe(true);
  });

  it("scope-level predicates match Rails RESOURCE_SCOPES / RESOURCE_METHOD_SCOPES", () => {
    expect(new Scope({}, Scope.ROOT, "resource").isResourceScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "resources").isResourceScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "member").isResourceScope()).toBe(false);
    expect(new Scope({}, Scope.ROOT, "collection").isResourceMethodScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "member").isResourceMethodScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "new").isResourceMethodScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "nested").isResourceMethodScope()).toBe(false);
  });

  it("actionName returns Rails-ordered tuples per scope level", () => {
    const s = (lvl: Parameters<Scope["newLevel"]>[0]) => new Scope({}, Scope.ROOT, lvl);
    expect(s("nested").actionName("np", "pre", "coll", "mem")).toEqual(["np", "pre"]);
    expect(s("collection").actionName("np", "pre", "coll", "mem")).toEqual(["pre", "np", "coll"]);
    expect(s("new").actionName("np", "pre", "coll", "mem")).toEqual(["pre", "new", "np", "mem"]);
    expect(s("member").actionName("np", "pre", "coll", "mem")).toEqual(["pre", "np", "mem"]);
    expect(s("root").actionName("np", "pre", "coll", "mem")).toEqual(["np", "coll", "pre"]);
    expect(s(null).actionName("np", "pre", "coll", "mem")).toEqual(["np", "mem", "pre"]);
  });

  it("each yields each frame up to (not including) ROOT", () => {
    const a = new Scope({ path: "/a" });
    const b = a.new({ as: "b" });
    const c = b.new({ controller: "c" });
    const nodes: Scope[] = [];
    c.each((node) => nodes.push(node));
    expect(nodes).toEqual([c, b, a]);
    expect([...c]).toEqual([c, b, a]);
    expect([...Scope.ROOT]).toEqual([]);
  });
});

describe("ActionDispatch::Routing::Mapper::Resources inflection", () => {
  it("singularizes resources :people through the ActiveSupport inflector (mapper.rb:1228-1230)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("people");
    });
    expect(routes.namedRoutes.isKey("person")).toBe(true);
    expect(routes.namedRoutes.isKey("people")).toBe(true);
    expect(routes.namedRoutes.isKey("edit_person")).toBe(true);
    expect(routes.namedRoutes.isKey("people_index")).toBe(false);
    expect(routes.fromRequirements({ controller: "people", action: "index" })?.name).toBe("people");
  });

  it("pluralizes a singleton resource's controller through the ActiveSupport inflector (mapper.rb:1298-1300)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("person");
    });
    expect(routes.fromRequirements({ controller: "people", action: "show" })?.name).toBe("person");
  });
});
