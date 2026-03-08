import { describe, it, expect } from "vitest";
import { RouteSet } from "./route-set.js";
import type { RackEnv } from "@rails-ts/rack";

// ==========================================================================
// Controller routing integration tests
// ==========================================================================
describe("Controller routing integration", () => {
  it("dispatches GET / to root route", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.root("pages#home"); });
    const match = routes.recognize("GET", "/");
    expect(match).not.toBeNull();
    expect(match!.route.controller).toBe("pages");
    expect(match!.route.action).toBe("home");
  });

  it("dispatches resource routes to correct actions", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.resources("posts"); });

    expect(routes.recognize("GET", "/posts")!.route.action).toBe("index");
    expect(routes.recognize("POST", "/posts")!.route.action).toBe("create");
    expect(routes.recognize("GET", "/posts/1")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/posts/1")!.params.id).toBe("1");
    expect(routes.recognize("PUT", "/posts/1")!.route.action).toBe("update");
    expect(routes.recognize("PATCH", "/posts/1")!.route.action).toBe("update");
    expect(routes.recognize("DELETE", "/posts/1")!.route.action).toBe("destroy");
  });

  it("path params include route parameters", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/posts/:id", { to: "posts#show" }); });
    const match = routes.recognize("GET", "/posts/42");
    expect(match!.params.id).toBe("42");
  });

  it("named route generates path", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/posts/:id", { to: "posts#show", as: "post" }); });
    expect(routes.pathFor("post", { id: "5" })).toBe("/posts/5");
  });

  it("named route generates full URL", () => {
    const routes = new RouteSet();
    routes.setDefaultUrlOptions({ host: "example.com" });
    routes.draw((map) => { map.get("/posts/:id", { to: "posts#show", as: "post" }); });
    expect(routes.urlFor("post", { id: "5" })).toBe("http://example.com/posts/5");
  });

  it("first matching route wins", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts/special", { to: "posts#special", as: "special_post" });
      map.get("/posts/:id", { to: "posts#show" });
    });
    const match = routes.recognize("GET", "/posts/special");
    expect(match!.route.action).toBe("special");
  });

  it("unmatched route returns null", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/posts", { to: "posts#index" }); });
    expect(routes.recognize("GET", "/users")).toBeNull();
  });

  it("wrong method returns null", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/posts", { to: "posts#index" }); });
    expect(routes.recognize("POST", "/posts")).toBeNull();
  });

  it("namespace prefixes path and controller", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.namespace("admin", (admin) => { admin.resources("posts"); });
    });
    const match = routes.recognize("GET", "/admin/posts");
    expect(match).not.toBeNull();
    expect(match!.route.controller).toBe("admin/posts");
    expect(match!.route.action).toBe("index");
  });

  it("scope with module option", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.scope("/api", { module: "api" }, (scope) => {
        scope.get("/posts", { to: "posts#index" });
      });
    });
    const match = routes.recognize("GET", "/api/posts");
    expect(match!.route.controller).toBe("api/posts");
  });

  it("constraints filter routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/posts/123")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/abc")).toBeNull();
  });

  it("multiple draw calls append routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/a", { to: "posts#index" }); });
    routes.draw((map) => { map.get("/b", { to: "pages#home" }); });
    expect(routes.recognize("GET", "/a")).not.toBeNull();
    expect(routes.recognize("GET", "/b")).not.toBeNull();
  });

  it("clear removes all routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/posts", { to: "posts#index" }); });
    routes.clear();
    expect(routes.recognize("GET", "/posts")).toBeNull();
  });

  it("nested resources generate correct paths", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", {}, (posts) => {
        posts.resources("comments");
      });
    });
    const match = routes.recognize("GET", "/posts/1/comments");
    expect(match).not.toBeNull();
    expect(match!.params.post_id).toBe("1");
    expect(match!.route.action).toBe("index");

    const show = routes.recognize("GET", "/posts/1/comments/2");
    expect(show).not.toBeNull();
    expect(show!.params.post_id).toBe("1");
    expect(show!.params.id).toBe("2");
  });

  it("member routes within resources", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", {}, (posts) => {
        posts.member((m) => { m.post("/publish", { to: "posts#publish" }); });
      });
    });
    const match = routes.recognize("POST", "/posts/1/publish");
    expect(match).not.toBeNull();
    expect(match!.params.id).toBe("1");
  });

  it("collection routes within resources", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", {}, (posts) => {
        posts.collection((c) => { c.get("/search", { to: "posts#search" }); });
      });
    });
    const match = routes.recognize("GET", "/posts/search");
    expect(match).not.toBeNull();
    expect(match!.route.action).toBe("search");
  });

  it("singular resource routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.resource("session"); });
    expect(routes.recognize("GET", "/session")).not.toBeNull();
    expect(routes.recognize("POST", "/session")).not.toBeNull();
    expect(routes.recognize("DELETE", "/session")).not.toBeNull();
    expect(routes.recognize("GET", "/session")!.route.action).toBe("show");
  });

  it("route defaults are merged into params", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index", defaults: { format: "json" } });
    });
    const route = routes.recognize("GET", "/posts");
    expect(route).not.toBeNull();
    expect(route!.route.defaults?.format).toBe("json");
  });

  it("call returns 404 for unmatched", async () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.get("/posts", { to: "posts#index" }); });
    const [status] = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/nope" });
    expect(status).toBe(404);
  });

  it("call sets path parameters in env", async () => {
    const routes = new RouteSet();
    let capturedEnv: RackEnv = {};
    routes.setDispatcher(async (_ctrl, _action, _params, env) => {
      capturedEnv = env;
      return [200, {}, []] as any;
    });
    routes.draw((map) => { map.get("/posts/:id", { to: "posts#show" }); });
    await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/posts/42" });
    const pathParams = capturedEnv["action_dispatch.request.path_parameters"] as Record<string, string>;
    expect(pathParams.id).toBe("42");
    expect(pathParams.controller).toBe("posts");
    expect(pathParams.action).toBe("show");
  });

  it("route inspector lists all routes", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index", as: "posts" });
      map.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.getRoutes().length).toBe(2);
  });

  it("named routes map", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.get("/posts", { to: "posts#index", as: "posts" });
      map.get("/about", { to: "pages#about", as: "about" });
    });
    const named = routes.getNamedRoutes();
    expect(named.has("posts")).toBe(true);
    expect(named.has("about")).toBe(true);
  });

  it("pathFor throws on missing named route", () => {
    const routes = new RouteSet();
    expect(() => routes.pathFor("nonexistent", {})).toThrow();
  });

  it("shallow nested resources", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.resources("posts", { shallow: true }, (posts) => {
        posts.resources("comments");
      });
    });
    const index = routes.recognize("GET", "/posts/1/comments");
    expect(index).not.toBeNull();
    expect(index!.params.post_id).toBe("1");

    const show = routes.recognize("GET", "/comments/5");
    expect(show).not.toBeNull();
    expect(show!.params.id).toBe("5");
  });

  it("resources with only option", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.resources("posts", { only: ["index", "show"] }); });
    expect(routes.recognize("GET", "/posts")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1")).not.toBeNull();
    expect(routes.recognize("POST", "/posts")).toBeNull();
    expect(routes.recognize("DELETE", "/posts/1")).toBeNull();
  });

  it("resources with except option", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.resources("posts", { except: ["destroy"] }); });
    expect(routes.recognize("GET", "/posts")).not.toBeNull();
    expect(routes.recognize("DELETE", "/posts/1")).toBeNull();
  });

  it("deeply nested namespace", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.namespace("api", (api) => {
        api.namespace("v1", (v1) => { v1.resources("posts"); });
      });
    });
    const match = routes.recognize("GET", "/api/v1/posts");
    expect(match).not.toBeNull();
    expect(match!.route.controller).toBe("api/v1/posts");
  });

  it("resources generate named routes for path generation", () => {
    const routes = new RouteSet();
    routes.draw((map) => { map.resources("posts"); });
    expect(routes.pathFor("posts", {})).toBe("/posts");
    expect(routes.pathFor("post", { id: "3" })).toBe("/posts/3");
    expect(routes.pathFor("new_post", {})).toBe("/posts/new");
    expect(routes.pathFor("edit_post", { id: "3" })).toBe("/posts/3/edit");
  });

  it("match with multiple verbs", () => {
    const routes = new RouteSet();
    routes.draw((map) => {
      map.match("/login", { to: "sessions#create", via: ["get", "post"] });
    });
    expect(routes.recognize("GET", "/login")).not.toBeNull();
    expect(routes.recognize("POST", "/login")).not.toBeNull();
    expect(routes.recognize("PUT", "/login")).toBeNull();
  });
});
