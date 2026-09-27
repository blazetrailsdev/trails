import { describe, it, expect, vi } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { RouteSet, StaticDispatcher } from "./route-set.js";
import { Constraints } from "./mapper.js";
import { X_CASCADE } from "../constants.js";
import type { Request } from "../http/request.js";

describe("ActionDispatch::Routing::RouteSet generation", () => {
  it("trims a trailing part that restates the route default", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts(/:page)", { to: "posts#index", as: "posts", defaults: { page: "1" } });
    });
    expect(routes.generate("posts", { page: "1" }).path(null)).toBe("/posts");
    expect(routes.generate("posts", { page: "2" }).path(null)).toBe("/posts/2");
  });

  it("never trims a required part that restates the route default", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:page", { to: "posts#index", as: "posts", defaults: { page: "1" } });
    });
    expect(routes.generate("posts", { page: "1" }).path(null)).toBe("/posts/1");
  });

  it("keeps a trailing part named only by the enclosing scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ page: "1" }, (m) => {
        m.get("/posts(/:page)", { to: "posts#index", as: "posts" });
      });
    });
    expect(routes.generate("posts", {}, { page: "3" }).path(null)).toBe("/posts/3");
  });
});

describe("ActionDispatch::Routing::Mapper::Mapping#app", () => {
  it("wraps the dispatcher in Constraints(SERVE) for a route under a constraints block", () => {
    const routes = new RouteSet();
    const constraint = (req: Request) => req.path === "/posts";
    routes.draw((r) => {
      r.constraints(constraint, () => {
        r.get("/posts", { to: "posts#index" });
      });
      r.get("/comments", { to: "comments#index" });
    });
    const [posts, comments] = routes.getRoutes();
    expect(posts.app).toBeInstanceOf(Constraints);
    expect((posts.app as Constraints).dispatcher()).toBe(true);
    expect((posts.app as Constraints).constraints).toEqual([constraint]);
    expect(comments.app).not.toBeInstanceOf(Constraints);
  });

  it("cascades when the constraints block rejects the request", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.constraints(
        () => false,
        () => {
          r.get("/posts", { to: "posts#index" });
        },
      );
    });
    const [status, headers] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts",
      HTTP_HOST: "example.org",
      "rack.url_scheme": "http",
    } as never);
    expect(status).toBe(404);
    expect(headers[X_CASCADE]).toBe("pass");
  });

  it("wraps resource routes in Constraints(SERVE) under a constraints block", () => {
    const routes = new RouteSet();
    const constraint = () => true;
    routes.draw((r) => {
      r.constraints(constraint, () => {
        r.resources("posts", { only: ["index", "show"] });
      });
    });
    const apps = routes.getRoutes().map((route) => route.app);
    expect(apps).toHaveLength(2);
    for (const app of apps) {
      expect(app).toBeInstanceOf(Constraints);
      expect((app as Constraints).constraints).toEqual([constraint]);
    }
  });

  it("dispatches a mounted app answering action through StaticDispatcher", () => {
    const routes = new RouteSet();
    const app = { action: () => app, call: () => [200, {}, []] };
    routes.draw((r) => {
      r.mount(app as never, { at: "/static" });
    });
    expect(routes.getRoutes()[0].app).toBeInstanceOf(StaticDispatcher);
  });

  it("merges nested Hash scope constraints onto a matched route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ constraints: { subdomain: "api" } }, () => {
        r.scope({ constraints: { id: /\d+/ } }, () => {
          r.get("/posts/:id", { to: "posts#show", constraints: { format: "json" } });
        });
      });
    });
    const [route] = routes.getRoutes();
    expect(route.constraints).toEqual({ subdomain: "api" });
    expect(route.path.requirements).toEqual({ id: /\d+/, format: "json" });
  });

  it("raises for a constraint answering neither call nor matches?", () => {
    const routes = new RouteSet();
    expect(() =>
      routes.draw((r) => {
        r.get("/posts", { to: "posts#index", constraints: 1 as never });
      }),
    ).toThrow("Invalid constraint: 1 must respond to :call or :matches?");
  });
});

describe("ActionDispatch::Routing::RouteSet::NamedRouteCollection::UrlHelper.optimize_helper?", () => {
  function helperGoesThroughUrlFor(
    draw: (r: Parameters<Parameters<RouteSet["draw"]>[0]>[0]) => void,
    ...args: unknown[]
  ): boolean {
    const routes = new RouteSet();
    routes.draw(draw);
    const spy = vi.spyOn(routes, "urlFor");
    (routes.urlHelpers() as unknown as Record<string, (...a: unknown[]) => string>).fooPath(
      ...args,
    );
    return spy.mock.calls.length > 0;
  }

  it("optimizes a route whose path carries no requirements", () => {
    expect(
      helperGoesThroughUrlFor((r) => r.get("/foo/:id", { to: "foo#show", as: "foo" }), 1),
    ).toBe(false);
  });

  it("uses the generic helper for a format: true route", () => {
    expect(
      helperGoesThroughUrlFor(
        (r) => r.get("/foo", { to: "foo#index", as: "foo", format: true }),
        "json",
      ),
    ).toBe(true);
  });

  it("uses the generic helper when a :controller requirement is not a path segment", () => {
    expect(
      helperGoesThroughUrlFor(
        (r) => r.get("/foo/:id", { to: "foo#show", as: "foo", constraints: { controller: /foo/ } }),
        1,
      ),
    ).toBe(true);
  });
});

describe("ActionDispatch::Routing::RouteSet::Config", () => {
  it("is a positional struct of relative_url_root, api_only and default_scope", () => {
    const config = new RouteSet.Config("/app", true, { module: "admin" });
    expect([config.relativeUrlRoot, config.apiOnly, config.defaultScope]).toEqual([
      "/app",
      true,
      { module: "admin" },
    ]);
    expect(new RouteSet.Config().apiOnly).toBeNull();
  });

  it("new_with_config copies only the keys the config responds to", () => {
    const routes = RouteSet.newWithConfig({ apiOnly: true });
    expect(routes.isApiOnly()).toBe(true);
    expect(routes.relativeUrlRoot).toBeNull();
    expect(RouteSet.DEFAULT_CONFIG.apiOnly).toBe(false);
  });

  it("each route set gets its own copy of DEFAULT_CONFIG", () => {
    const routes = new RouteSet();
    routes.defaultScope = { module: "admin" };
    expect(RouteSet.DEFAULT_CONFIG.defaultScope).toBeNull();
    expect(new RouteSet().defaultScope).toBeNull();
  });
});

describe("ActionDispatch::Routing::RouteSet#default_env", () => {
  function envFor(defaultUrlOptions: Record<string, unknown>) {
    const routes = new RouteSet();
    routes.defaultUrlOptions = defaultUrlOptions;
    const env = routes.defaultEnv();
    return [env["HTTPS"], env["rack.url_scheme"], env["HTTP_HOST"], env["SCRIPT_NAME"]];
  }

  it("defaults to http://example.org", () => {
    expect(envFor({})).toEqual(["off", "http", "example.org", ""]);
  });

  it("normalizes the protocol through Http::URL.full_url_for", () => {
    expect(envFor({ protocol: "https://" })).toEqual(["on", "https", "example.org", ""]);
  });

  it("drops the port only when it is the scheme's default", () => {
    expect(envFor({ protocol: "https", port: 443 })).toEqual(["on", "https", "example.org", ""]);
    expect(envFor({ port: 8080 })).toEqual(["off", "http", "example.org:8080", ""]);
    expect(envFor({ host: "example.com:3000" })).toEqual(["off", "http", "example.com:3000", ""]);
  });

  it("applies subdomain and script_name", () => {
    expect(envFor({ host: "example.com", subdomain: "api", scriptName: "/app/" })).toEqual([
      "off",
      "http",
      "api.example.com",
      "/app",
    ]);
  });
});

describe("ActionDispatch::Routing::RouteSet#generate_url_helpers", () => {
  it("includes a copy of the module into an includer whose _routes is another route set", () => {
    const a = new RouteSet();
    const b = new RouteSet();
    const helpers = a.urlHelpers();
    class Parent {
      declare static _routes: unknown;
    }
    include(Parent, helpers);
    expect(Parent._routes).toBe(a);

    class Child extends Parent {}
    include(Child, b.urlHelpers());
    expect(Child._routes).toBe(b);

    include(Child, helpers);
    expect(Child._routes).toBe(a);
    expect(helpers._dupForReinclude).toBeDefined();
  });

  it("gives an includer the default_url_options class attribute", () => {
    class Host {
      declare static defaultUrlOptions: Record<string, unknown>;
    }
    include(Host, new RouteSet().urlHelpers());
    expect(Host.defaultUrlOptions).toEqual({});
  });
});
