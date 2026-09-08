import { describe, it, expect } from "vitest";
import { UrlGenerationError } from "../../action-controller/metal/exceptions.js";
import { RouteSet } from "../routing/route-set.js";
import type { RouterRequest } from "./router.js";

function railsEnv(env: Partial<RouterRequest> & { pathInfo?: string }): RouterRequest {
  return {
    requestMethod: "GET",
    pathInfo: "/content",
    scriptName: "",
    pathParameters: {},
    ...env,
  };
}

function _generate(
  routeSet: RouteSet,
  routeName: string | null,
  options: Record<string, unknown>,
  recall: Record<string, unknown>,
): [string, Record<string, string>] {
  const path = routeSet.generate(routeName, options, recall);
  const captures = new Set<string>();
  for (const route of routeSet.getRoutes()) {
    for (const name of route.pathParamNames) captures.add(name);
  }
  const params: Record<string, string> = {};
  for (const [key, val] of Object.entries(options)) {
    if (captures.has(key) || key === "controller" || key === "action") continue;
    if (val == null) continue;
    params[key] = String(val);
  }
  return [path, params];
}

describe("TestRouter", () => {
  it("dashes", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo-bar-baz", { to: "foo#bar" });
    });

    const env = railsEnv({ pathInfo: "/foo-bar-baz" });
    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it("unicode", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/ほげ", { to: "foo#bar" });
    });

    const env = railsEnv({ pathInfo: "/%E3%81%BB%E3%81%92" });
    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it("regexp first precedence", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/whois/:domain", { constraints: { domain: /\w+\.[\w.]+/ }, to: "foo#bar" });
      r.get("/whois/:id(.:format)", { to: "foo#baz" });
    });

    const env = railsEnv({ pathInfo: "/whois/example.com" });

    const list: { path: { spec: unknown } }[] = [];
    routeSet.journeyRouter.recognize(env, (r) => {
      list.push(r as unknown as { path: { spec: unknown } });
    });
    expect(list.length).toEqual(2);

    const r = list[0];

    expect(String(r.path.spec)).toEqual("/whois/:domain(.:format)");
  });

  it("required parts verified are anchored", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo/:id", { constraints: { id: /\d/ }, anchor: false, to: "foo#bar" });
    });

    expect(() => routeSet.generate(null, { controller: "foo", action: "bar", id: "10" })).toThrow(
      UrlGenerationError,
    );
  });

  it("required parts are verified when building", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo/:id", { constraints: { id: /\d+/ }, anchor: false, to: "foo#bar" });
    });

    const [path] = _generate(routeSet, null, { controller: "foo", action: "bar", id: "10" }, {});
    expect(path).toEqual("/foo/10");

    expect(() => _generate(routeSet, null, { id: "aa" }, {})).toThrow(UrlGenerationError);
  });

  it("only required parts are verified", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo(/:id)", { constraints: { id: /\d/ }, to: "foo#bar" });
    });

    let [path] = _generate(routeSet, null, { controller: "foo", action: "bar", id: "10" }, {});
    expect(path).toEqual("/foo/10");

    [path] = _generate(routeSet, null, { controller: "foo", action: "bar" }, {});
    expect(path).toEqual("/foo");

    [path] = _generate(routeSet, null, { controller: "foo", action: "bar", id: "aa" }, {});
    expect(path).toEqual("/foo/aa");
  });

  it("knows what parts are missing from named route", () => {
    const routeName = "gorby_thunderhorse";
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo/:id", { as: routeName, constraints: { id: /\d+/ }, to: "foo#bar" });
    });

    let error: Error | undefined;
    expect(() => {
      try {
        _generate(routeSet, routeName, {}, {});
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(UrlGenerationError);

    expect(error!.message).toMatch(/missing required keys: \[:id\]/);
  });

  it("does not include missing keys message", () => {
    const routeName = "gorby_thunderhorse";
    const routeSet = new RouteSet();

    let error: Error | undefined;
    expect(() => {
      try {
        _generate(routeSet, routeName, {}, {});
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(UrlGenerationError);

    expect(error!.message).not.toMatch(/missing required keys: \[\]/);
  });

  it("x cascade", async () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/messages(.:format)", { to: "foo#bar" });
    });
    const resp = await routeSet.journeyRouter.serve(
      railsEnv({ requestMethod: "GET", pathInfo: "/lol" }),
    );
    expect(resp[2]).toEqual(["Not Found"]);
    expect(resp[1]["x-cascade"]).toEqual("pass");
    expect(resp[0]).toEqual(404);
  });

  it("clear trailing slash from script name on root unanchored routes", async () => {
    const app = () => [200, {}, ["success!"]] as const;
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/weblog", { to: app });
    });

    const env = railsEnv({ scriptName: "", pathInfo: "/weblog" });
    const resp = await routeSet.journeyRouter.serve(env);
    expect(resp[2]).toEqual(["success!"]);
    expect(env.scriptName).toEqual("");
  });

  it("defaults merge correctly", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo(/:id)", { to: "foo#bar", defaults: { id: null } });
    });

    let env = railsEnv({ pathInfo: "/foo/10" });
    routeSet.journeyRouter.recognize(env, (_r, params) => {
      expect(params).toEqual({ id: "10", controller: "foo", action: "bar" });
    });

    env = railsEnv({ pathInfo: "/foo" });
    routeSet.journeyRouter.recognize(env, (_r, params) => {
      expect(params).toEqual({ id: null, controller: "foo", action: "bar" });
    });
  });

  it("recognize with unbound regexp", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo", { anchor: false, to: "foo#bar" });
    });

    const env = railsEnv({ pathInfo: "/foo/bar" });

    routeSet.journeyRouter.recognize(env, () => {});

    expect(env.scriptName).toEqual("/foo");
    expect(env.pathInfo).toEqual("/bar");
  });

  it("bound regexp keeps path info", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo", { to: "foo#bar" });
    });

    const env = railsEnv({ pathInfo: "/foo" });

    const before = env.scriptName;

    routeSet.journeyRouter.recognize(env, () => {});

    expect(env.scriptName).toEqual(before);
    expect(env.pathInfo).toEqual("/foo");
  });

  it("path not found", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      for (const path of [
        "/messages(.:format)",
        "/messages/new(.:format)",
        "/messages/:id/edit(.:format)",
        "/messages/:id(.:format)",
      ]) {
        r.get(path, { to: "foo#bar" });
      }
    });
    const env = railsEnv({ pathInfo: "/messages/unknown/path" });
    let yielded = false;

    routeSet.journeyRouter.recognize(env, () => {
      yielded = true;
    });
    expect(yielded).toBeFalsy();
  });

  it("required part in recall", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/messages/:a/:b", { to: "foo#bar" });
    });

    const [path] = _generate(
      routeSet,
      null,
      { controller: "foo", action: "bar", a: "a" },
      { b: "b" },
    );
    expect(path).toEqual("/messages/a/b");
  });

  it("splat in recall", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/*path", { to: "foo#bar" });
    });

    const [path] = _generate(routeSet, null, { controller: "foo", action: "bar" }, { path: "b" });
    expect(path).toEqual("/b");
  });

  it("recall should be used when scoring", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/messages/:action(/:id(.:format))", { to: "foo#bar" });
      r.get("/messages/:id(.:format)", { to: "bar#baz" });
    });

    const [path] = _generate(routeSet, null, { controller: "foo", id: 10 }, { action: "index" });
    expect(path).toEqual("/messages/index/10");
  });

  it("nil path parts are ignored", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action(.:format))", { to: "tasks#lol" });
    });

    const params = { controller: "tasks", format: null };
    const extras = { action: "lol" };

    const [path] = _generate(routeSet, null, params, extras);
    expect(path).toEqual("/tasks/index");
  });

  it("generate slash", () => {
    const params: Record<string, string> = { controller: "tasks", action: "show" };
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/", params);
    });

    const [path] = _generate(routeSet, null, params, {});
    expect(path).toEqual("/");
  });

  it("generate id", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action)", { to: "foo#bar" });
    });

    const [path, params] = _generate(
      routeSet,
      null,
      { id: 1, controller: "tasks", action: "show" },
      {},
    );
    expect(path).toEqual("/tasks/show");
    expect(params).toEqual({ id: "1" });
  });

  it("generate escapes", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action)", { to: "foo#bar" });
    });

    const [path] = _generate(routeSet, null, { controller: "tasks", action: "a/b c+d" }, {});
    expect(path).toEqual("/tasks/a%2Fb%20c+d");
  });

  it("generate escapes with namespaced controller", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action)", { to: "foo#bar" });
    });

    const [path] = _generate(routeSet, null, { controller: "admin/tasks", action: "a/b c+d" }, {});
    expect(path).toEqual("/admin/tasks/a%2Fb%20c+d");
  });

  it("generate extra params", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action)", { to: "foo#bar" });
    });

    const [path, params] = _generate(
      routeSet,
      null,
      { id: 1, controller: "tasks", action: "show", relative_url_root: null },
      {},
    );
    expect(path).toEqual("/tasks/show");
    expect(params).toEqual({ id: "1" });
  });

  it("generate missing keys no matches different format keys", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller/:action/:name", { to: "foo#bar" });
    });
    const primaryParameters = {
      id: 1,
      controller: "tasks",
      action: "show",
      relative_url_root: null,
    };
    const redirectionParameters = { action: "show" };
    const missingKey = "name";
    const missingParameters = { [missingKey]: "task_1" };
    const requestParameters = {
      ...primaryParameters,
      ...redirectionParameters,
      ...missingParameters,
    };

    const message = `No route matches {:action=>"show", :controller=>"tasks"}, missing required keys: [:${missingKey}]`;

    let error: Error | undefined;
    expect(() => {
      try {
        _generate(routeSet, null, { ...requestParameters, name: null }, requestParameters);
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(UrlGenerationError);
    expect(error!.message).toEqual(message);
  });

  it("generate uses recall if needed", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action(/:id))", { to: "foo#bar" });
    });

    const [path, params] = _generate(
      routeSet,
      null,
      { controller: "tasks", id: 10 },
      { action: "index" },
    );
    expect(path).toEqual("/tasks/index/10");
    expect(params).toEqual({});
  });

  it("generate with name", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action)", { to: "foo#bar", as: "tasks" });
    });

    const [path, params] = _generate(
      routeSet,
      "tasks",
      { controller: "tasks" },
      { controller: "tasks", action: "index" },
    );
    expect(path).toEqual("/tasks/index");
    expect(params).toEqual({});
  });

  it("namespaced controller", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/:controller(/:action(/:id))", { constraints: { controller: /.+?/ } });
    });
    const route = [...routeSet.journeyRouter.routes][0];

    const env = railsEnv({ pathInfo: "/admin/users/show/10" });
    let called = false;
    const expected = {
      controller: "admin/users",
      action: "show",
      id: "10",
    };

    routeSet.journeyRouter.recognize(env, (r, params) => {
      expect(r).toEqual(route);
      expect(params).toEqual(expected);
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it("recognize literal", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/books(/:action(.:format))", { controller: "books" });
    });
    const route = [...routeSet.journeyRouter.routes][0];

    const env = railsEnv({ pathInfo: "/books/list.rss" });
    const expected = { controller: "books", action: "list", format: "rss" };
    let called = false;
    routeSet.journeyRouter.recognize(env, (r, params) => {
      expect(r).toEqual(route);
      expect(params).toEqual(expected);
      called = true;
    });

    expect(called).toBeTruthy();
  });

  it("recognize head route", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.match("/books(/:action(.:format))", { via: "head", to: "foo#bar" });
    });

    const env = railsEnv({
      pathInfo: "/books/list.rss",
      requestMethod: "HEAD",
    });

    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });

    expect(called).toBeTruthy();
  });

  it("recognize head request as get route", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/books(/:action(.:format))", { to: "foo#bar" });
    });

    const env = railsEnv({ pathInfo: "/books/list.rss", requestMethod: "HEAD" });

    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });

    expect(called).toBeTruthy();
  });

  it("recognize cares about get verbs", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.match("/books(/:action(.:format))", { to: "foo#bar", via: "get" });
    });

    const env = railsEnv({ pathInfo: "/books/list.rss", requestMethod: "POST" });

    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });

    expect(called).toBeFalsy();
  });

  it("recognize cares about post verbs", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.match("/books(/:action(.:format))", { to: "foo#bar", via: "post" });
    });

    const env = railsEnv({ pathInfo: "/books/list.rss", requestMethod: "POST" });

    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });

    expect(called).toBeTruthy();
  });

  it("multi verb recognition", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.match("/books(/:action(.:format))", { to: "foo#bar", via: ["post", "get"] });
    });

    for (const verb of ["POST", "GET"]) {
      const env = railsEnv({ pathInfo: "/books/list.rss", requestMethod: verb });

      let called = false;
      routeSet.journeyRouter.recognize(env, () => {
        called = true;
      });

      expect(called).toBeTruthy();
    }

    const env = railsEnv({ pathInfo: "/books/list.rss", requestMethod: "PUT" });

    let called = false;
    routeSet.journeyRouter.recognize(env, () => {
      called = true;
    });

    expect(called).toBeFalsy();
  });

  it("eager load with routes", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/foo-bar", { to: "foo#bar" });
    });
    expect(routeSet.journeyRouter.eagerLoadBang()).toBeUndefined();
  });

  it("eager load without routes", () => {
    const routeSet = new RouteSet();
    expect(routeSet.journeyRouter.eagerLoadBang()).toBeUndefined();
  });
});
