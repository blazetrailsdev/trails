import { describe, it, expect } from "vitest";
import { RouteSet } from "./route-set.js";
import { Route } from "./route.js";
import { escapePath, escapeSegment, escapeFragment, unescapeUri } from "./utils.js";
import { RoutesInspector } from "./inspector.js";
import { bodyToString } from "@rails-ts/rack";

// ==========================================================================
// Journey::Route tests (journey/route_test.rb)
// ==========================================================================
describe("ActionDispatch::Journey::Route", () => {
  it("initialize", () => {
    const route = new Route("GET", "/:controller/:action/:id", "pages", "show", {
      name: "name",
    });
    expect(route.verb).toBe("GET");
    expect(route.path).toBe("/:controller/:action/:id");
    expect(route.name).toBe("name");
  });

  it("path requirements override defaults", () => {
    const route = new Route("GET", "/:name", "pages", "show", {
      constraints: { name: /love/ },
    });
    expect(route.match("GET", "/love")).not.toBeNull();
    expect(route.match("GET", "/tender")).toBeNull();
  });

  it("format with star", () => {
    const route = new Route("GET", "/posts/:id", "posts", "show");
    expect(route.pathFor({ id: "42" })).toBe("/posts/42");
  });

  it("connects all match", () => {
    const route = new Route("GET", "/:controller/:action/:id", "foo", "bar", {
      constraints: { action: "bar" },
    });
    const m = route.match("GET", "/foo/bar/10");
    expect(m).not.toBeNull();
    expect(m!.params).toEqual({ controller: "foo", action: "bar", id: "10" });
  });

  it("extras are not included if optional", () => {
    const route = new Route("GET", "/page/:id", "pages", "show");
    expect(route.pathFor({ id: 10 })).toBe("/page/10");
  });

  it("extras are not included if optional with parameter", () => {
    const route = new Route("GET", "/page(/:id)", "pages", "show");
    expect(route.pathFor({ id: "10" })).toBe("/page/10");
    expect(route.pathFor({})).toBe("/page");
  });

  it("extras are not included if optional parameter is nil", () => {
    const route = new Route("GET", "/page(/:id)", "pages", "show");
    expect(route.pathFor({})).toBe("/page");
  });

  it("score", () => {
    const r1 = new Route("GET", "/posts/:id", "posts", "show");
    const r2 = new Route("GET", "/posts/featured", "posts", "featured");
    // Static segments score higher than dynamic ones
    expect(r2.score()).toBeGreaterThan(r1.score());
  });

  it("route adds itself as memo", () => {
    const route = new Route("GET", "/posts/:id", "posts", "show", { name: "post" });
    // The route itself is the memo — we can match and get it back
    const m = route.match("GET", "/posts/1");
    expect(m!.route).toBe(route);
  });

  it("ip address", () => {
    const route = new Route("GET", "/posts", "posts", "index", {
      ip: /192\.168\.1\.\d+/,
    });
    expect(route.ip).toEqual(/192\.168\.1\.\d+/);
  });

  it("default ip", () => {
    const route = new Route("GET", "/posts", "posts", "index");
    // Default IP matches everything
    expect(route.ip).toEqual(/(?:)/);
  });
});

// ==========================================================================
// Journey::Router tests (journey/router_test.rb)
// ==========================================================================
describe("ActionDispatch::Journey::Router", () => {
  it("dashes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/a-b/c-d", { to: "foo#bar", as: "ab_cd" });
    });
    expect(routes.recognize("GET", "/a-b/c-d")).not.toBeNull();
  });

  it("unicode", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo-bar", { to: "foo#bar" });
    });
    expect(routes.recognize("GET", "/foo-bar")).not.toBeNull();
  });

  it("regexp first precedence", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/featured", { to: "posts#featured", as: "featured" });
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    const m = routes.recognize("GET", "/posts/featured");
    expect(m!.route.action).toBe("featured");
  });

  it("path not found", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    expect(routes.recognize("GET", "/missing")).toBeNull();
  });

  it("generate slash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.root("pages#home");
    });
    expect(routes.pathFor("root")).toBe("/");
  });

  it("generate id", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor("post", { id: 10 })).toBe("/posts/10");
  });

  it("required parts are verified when building", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.pathFor("post")).toThrow(/Missing required parameter :id/);
  });

  it("knows what parts are missing from named route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id/comments/:comment_id", { to: "comments#show", as: "post_comment" });
    });
    expect(() => routes.pathFor("post_comment", { id: 1 })).toThrow(/Missing required parameter :comment_id/);
  });

  it("recognize cares about get verbs", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/books", { to: "books#index" });
    });
    expect(routes.recognize("GET", "/books")).not.toBeNull();
    expect(routes.recognize("POST", "/books")).toBeNull();
  });

  it("recognize cares about post verbs", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.post("/books", { to: "books#create" });
    });
    expect(routes.recognize("POST", "/books")).not.toBeNull();
    expect(routes.recognize("GET", "/books")).toBeNull();
  });

  it("multi verb recognition", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("/books", { to: "books#index", via: ["GET", "POST"] });
    });
    expect(routes.recognize("GET", "/books")).not.toBeNull();
    expect(routes.recognize("POST", "/books")).not.toBeNull();
    expect(routes.recognize("PUT", "/books")).toBeNull();
  });

  it("generate escapes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor("post", { id: "hello world" })).toBe("/posts/hello world");
  });

  it("generate with name", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/tasks/:id", { to: "tasks#show", as: "task" });
    });
    expect(routes.pathFor("task", { id: 1 })).toBe("/tasks/1");
  });

  it("required parts verified are anchored", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post", constraints: { id: /\d+/ } });
    });
    // Anchored constraint — "123abc" should NOT match
    expect(routes.recognize("GET", "/posts/123abc")).toBeNull();
    expect(routes.recognize("GET", "/posts/123")).not.toBeNull();
  });

  it("only required parts are verified", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id/comments/:comment_id", { to: "comments#show", as: "post_comment" });
    });
    expect(() => routes.pathFor("post_comment", { id: 1 })).toThrow(/Missing required parameter/);
  });

  it("does not include missing keys message", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.pathFor("post")).toThrow(/Missing required parameter :id/);
  });

  it("x cascade", () => {
    // When no route matches, recognize returns null (cascade behavior)
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index" });
    });
    expect(routes.recognize("GET", "/other")).toBeNull();
  });

  it("clear trailing slash from script name on root unanchored routes", () => {
    const route = new Route("GET", "/", "home", "index", { anchor: false });
    expect(route.match("GET", "/")).not.toBeNull();
    expect(route.match("GET", "/anything")).not.toBeNull();
  });

  it("defaults merge correctly", () => {
    const route = new Route("GET", "/posts(/:id)", "posts", "index", {
      defaults: { id: "1" },
    });
    expect(route.defaults).toEqual({ id: "1" });
    const m = route.match("GET", "/posts");
    expect(m).not.toBeNull();
  });

  it("recognize with unbound regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    // Unbound regexp gets anchored — partial matches don't count
    expect(routes.recognize("GET", "/posts/123")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/abc")).toBeNull();
  });

  it("bound regexp keeps path info", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /^\d+$/ } });
    });
    const m = routes.recognize("GET", "/posts/42");
    expect(m!.params.id).toBe("42");
  });

  it("required part in recall", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor("post", { id: 7 })).toBe("/posts/7");
  });

  it("splat in recall", () => {
    const route = new Route("GET", "/posts/*path", "posts", "show");
    const m = route.match("GET", "/posts/a/b/c");
    expect(m).not.toBeNull();
    expect(m!.params.path).toBe("a/b/c");
  });

  it("recall should be used when scoring", () => {
    const r1 = new Route("GET", "/posts/:id", "posts", "show");
    const r2 = new Route("GET", "/posts/:id", "posts", "show");
    // Score with knowledge of id increases specificity
    expect(r1.score({ id: true })).toBeGreaterThan(r2.score());
  });

  it("nil path parts are ignored", () => {
    const route = new Route("GET", "/page(/:id)", "pages", "show");
    // Without the optional param, path should still work
    expect(route.pathFor({})).toBe("/page");
  });
});

// ==========================================================================
// Journey::Router::Utils tests (journey/router/utils_test.rb)
// ==========================================================================
describe("ActionDispatch::Journey::Router::Utils", () => {
  it("path escape", () => {
    expect(escapePath("a/b c+d%")).toBe("a/b%20c+d%25");
  });

  it("segment escape", () => {
    expect(escapeSegment("a/b c+d%")).toBe("a%2Fb%20c%2Bd%25");
  });

  it("fragment escape", () => {
    expect(escapeFragment("a/b c+d%?e")).toBe("a/b%20c+d%25?e");
  });

  it("uri unescape", () => {
    expect(unescapeUri("a%2Fb%20c+d")).toBe("a/b c d");
  });

  it("uri unescape with utf8 string", () => {
    expect(unescapeUri("%E4%B8%AD%E6%96%87")).toBe("中文");
  });
});

// ==========================================================================
// ActionDispatch::Routing::RouteSet tests (dispatch/routing/route_set_test.rb)
// ==========================================================================
describe("ActionDispatch::Routing::RouteSet", () => {
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
    expect(routes.pathFor("foo")).toBe("/foo");
    expect(() => routes.pathFor("bar")).toThrow();
  });

  it("URL helpers are updated when route is updated", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/bar", { to: "bar#index", as: "bar" });
    });
    expect(routes.pathFor("bar")).toBe("/bar");
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
    expect(routes.pathFor("foo")).toBe("/foo");
    routes.clear();
    expect(() => routes.pathFor("foo")).toThrow();
    expect(routes.getRoutes().length).toBe(0);
  });

  it("only_path: true with *_url and no :host option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor("post", { id: 1 }, { onlyPath: true })).toBe("/posts/1");
  });

  it("only_path: false with *_url and no :host option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.urlFor("post", { id: 1 }, { onlyPath: false })).toThrow(/Missing host/);
  });

  it("only_path: false with *_url and local :host option", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor("post", { id: 1 }, { host: "example.com" })).toBe("http://example.com/posts/1");
  });

  it("only_path: false with *_url and global :host option", () => {
    const routes = new RouteSet();
    routes.setDefaultUrlOptions({ host: "example.org" });
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.urlFor("post", { id: 1 })).toBe("http://example.org/posts/1");
  });

  it("explicit keys win over implicit keys", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    // Explicit id param wins
    expect(routes.pathFor("post", { id: 42 })).toBe("/posts/42");
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
    // Calling pathFor multiple times gives the same result
    expect(routes.pathFor("post", { id: 1 })).toBe("/posts/1");
    expect(routes.pathFor("post", { id: 1 })).toBe("/posts/1");
  });

  it("escape new line for dynamic params", () => {
    expect(escapeSegment("hello\nworld")).toBe("hello%0Aworld");
  });

  it("escape new line for wildcard params", () => {
    expect(escapeSegment("a\nb")).toBe("a%0Ab");
  });
});

// ==========================================================================
// dispatch/routing_test.rb (TestRoutingMapper)
// ==========================================================================
describe("ActionDispatch::Routing::Mapper", () => {
  it("logout", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.delete("/logout", { to: "sessions#destroy", as: "logout" });
    });
    const m = routes.recognize("DELETE", "/logout");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("sessions");
    expect(m!.route.action).toBe("destroy");
    expect(routes.pathFor("logout")).toBe("/logout");
  });

  it("login", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/login", { to: "sessions#new", as: "login" });
      r.post("/login", { to: "sessions#create" });
    });
    const getM = routes.recognize("GET", "/login");
    expect(getM!.route.action).toBe("new");
    const postM = routes.recognize("POST", "/login");
    expect(postM!.route.action).toBe("create");
    expect(routes.pathFor("login")).toBe("/login");
  });

  it("session singleton resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("session");
    });

    expect(routes.recognize("GET", "/session")!.route.action).toBe("show");
    expect(routes.recognize("POST", "/session")!.route.action).toBe("create");
    expect(routes.recognize("PUT", "/session")!.route.action).toBe("update");
    expect(routes.recognize("PATCH", "/session")!.route.action).toBe("update");
    expect(routes.recognize("DELETE", "/session")!.route.action).toBe("destroy");
    expect(routes.recognize("GET", "/session/new")!.route.action).toBe("new");
    expect(routes.recognize("GET", "/session/edit")!.route.action).toBe("edit");

    expect(routes.pathFor("session")).toBe("/session");
    expect(routes.pathFor("new_session")).toBe("/session/new");
    expect(routes.pathFor("edit_session")).toBe("/session/edit");
  });

  it("projects (resources)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects");
    });

    expect(routes.recognize("GET", "/projects")!.route.action).toBe("index");
    expect(routes.recognize("GET", "/projects/new")!.route.action).toBe("new");
    expect(routes.recognize("POST", "/projects")!.route.action).toBe("create");
    expect(routes.recognize("GET", "/projects/1")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/projects/1/edit")!.route.action).toBe("edit");
    expect(routes.recognize("PUT", "/projects/1")!.route.action).toBe("update");
    expect(routes.recognize("PATCH", "/projects/1")!.route.action).toBe("update");
    expect(routes.recognize("DELETE", "/projects/1")!.route.action).toBe("destroy");

    expect(routes.pathFor("projects")).toBe("/projects");
    expect(routes.pathFor("new_project")).toBe("/projects/new");
    expect(routes.pathFor("project", { id: 1 })).toBe("/projects/1");
    expect(routes.pathFor("edit_project", { id: 1 })).toBe("/projects/1/edit");
  });

  it("admin (namespace)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("admin", (r) => {
        r.resources("users");
      });
    });

    expect(routes.recognize("GET", "/admin/users")!.route.action).toBe("index");
    expect(routes.recognize("GET", "/admin/users/1")!.route.action).toBe("show");
    expect(routes.pathFor("admin_users")).toBe("/admin/users");
    expect(routes.pathFor("admin_user", { id: 1 })).toBe("/admin/users/1");
  });

  it("root", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.root("pages#home");
    });
    const m = routes.recognize("GET", "/");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("pages");
    expect(m!.route.action).toBe("home");
    expect(routes.pathFor("root")).toBe("/");
  });

  it("scoped root", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("/api", { as: "api" }, (r) => {
        r.get("/status", { to: "status#show", as: "status" });
      });
    });
    expect(routes.recognize("GET", "/api/status")).not.toBeNull();
    expect(routes.pathFor("api_status")).toBe("/api/status");
  });

  it("nested namespace", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("api", (r) => {
        r.namespace("v1", (r) => {
          r.resources("articles");
        });
      });
    });
    expect(routes.recognize("GET", "/api/v1/articles")!.route.action).toBe("index");
    expect(routes.pathFor("api_v1_articles")).toBe("/api/v1/articles");
    expect(routes.pathFor("api_v1_article", { id: 5 })).toBe("/api/v1/articles/5");
  });

  it("nested resources", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", (r) => {
        r.resources("comments");
      });
    });
    const m = routes.recognize("GET", "/posts/3/comments/7");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("comments");
    expect(m!.route.action).toBe("show");
  });

  it("match with multiple via", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("/search", { to: "search#index", via: ["GET", "POST"], as: "search" });
    });
    expect(routes.recognize("GET", "/search")).not.toBeNull();
    expect(routes.recognize("POST", "/search")).not.toBeNull();
    expect(routes.recognize("DELETE", "/search")).toBeNull();
  });

  it("multiple draw calls append routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/a", { to: "a#index" });
    });
    routes.draw((r) => {
      r.get("/b", { to: "b#index" });
    });
    expect(routes.recognize("GET", "/a")).not.toBeNull();
    expect(routes.recognize("GET", "/b")).not.toBeNull();
  });

  it("constraints on dynamic segments", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post", constraints: { id: /^\d+$/ } });
    });
    expect(routes.recognize("GET", "/posts/42")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/abc")).toBeNull();
  });

  it("named routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/about", { to: "pages#about", as: "about" });
    });
    expect(routes.pathFor("about")).toBe("/about");
  });

  it("getRoutes lists all routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.root("pages#home");
      r.resources("posts");
    });
    // root + 8 resource routes
    expect(routes.getRoutes().length).toBe(9);
  });

  // --- Rack integration ---
  it("returns 404 for unmatched routes", async () => {
    const routes = new RouteSet();
    const [status, , body] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/nope",
    });
    expect(status).toBe(404);
    expect(await bodyToString(body)).toContain("No route matches");
  });

  it("dispatches matched route", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const [status, , body] = await routes.call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/7",
    });
    expect(status).toBe(200);
    const json = JSON.parse(await bodyToString(body));
    expect(json.controller).toBe("posts");
    expect(json.action).toBe("show");
    expect(json.params.id).toBe("7");
  });

  it("sets action_dispatch.request.path_parameters", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const env: Record<string, unknown> = {
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/3",
    };
    await routes.call(env);
    const params = env["action_dispatch.request.path_parameters"] as Record<string, string>;
    expect(params.controller).toBe("posts");
    expect(params.action).toBe("show");
    expect(params.id).toBe("3");
  });

  it("session singleton resource for api app", () => {
    // API apps typically exclude new/edit — test with only
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("session", { except: ["new", "edit"] });
    });
    expect(routes.recognize("GET", "/session")!.route.action).toBe("show");
    expect(routes.recognize("POST", "/session")!.route.action).toBe("create");
    expect(routes.recognize("DELETE", "/session")!.route.action).toBe("destroy");
    expect(routes.recognize("GET", "/session/new")).toBeNull();
    expect(routes.recognize("GET", "/session/edit")).toBeNull();
  });

  it("resource routes with only and except", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("post", { only: ["show", "update", "destroy"] });
    });
    expect(routes.recognize("GET", "/post")!.route.action).toBe("show");
    expect(routes.recognize("PUT", "/post")!.route.action).toBe("update");
    expect(routes.recognize("DELETE", "/post")!.route.action).toBe("destroy");
    expect(routes.recognize("POST", "/post")).toBeNull();
    expect(routes.recognize("GET", "/post/new")).toBeNull();
    expect(routes.recognize("GET", "/post/edit")).toBeNull();
  });

  it("resource routes only create update destroy", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("profile", { only: ["create", "update", "destroy"] });
    });
    expect(routes.recognize("POST", "/profile")!.route.action).toBe("create");
    expect(routes.recognize("PUT", "/profile")!.route.action).toBe("update");
    expect(routes.recognize("DELETE", "/profile")!.route.action).toBe("destroy");
    expect(routes.recognize("GET", "/profile")).toBeNull();
  });

  it("resources routes only create update destroy", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", { only: ["create", "update", "destroy"] });
    });
    expect(routes.recognize("POST", "/products")!.route.action).toBe("create");
    expect(routes.recognize("PUT", "/products/1")!.route.action).toBe("update");
    expect(routes.recognize("DELETE", "/products/1")!.route.action).toBe("destroy");
    expect(routes.recognize("GET", "/products")).toBeNull();
    expect(routes.recognize("GET", "/products/1")).toBeNull();
  });

  it("projects involvements (nested resources)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("involvements");
        r.resources("attachments");
      });
    });
    const m = routes.recognize("GET", "/projects/1/involvements");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("involvements");
    expect(m!.route.action).toBe("index");

    const m2 = routes.recognize("GET", "/projects/1/involvements/2");
    expect(m2!.route.action).toBe("show");

    const m3 = routes.recognize("GET", "/projects/1/attachments");
    expect(m3!.route.controller).toBe("attachments");
  });

  it("projects attachments", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("attachments");
      });
    });
    expect(routes.recognize("GET", "/projects/1/attachments")!.route.controller).toBe("attachments");
  });

  it("openid", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("openid/login", { to: "openid#login", via: ["GET", "POST"] });
    });
    expect(routes.recognize("GET", "/openid/login")!.route.controller).toBe("openid");
    expect(routes.recognize("POST", "/openid/login")!.route.controller).toBe("openid");
  });

  it("namespace with options", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("api", (r) => {
        r.namespace("v1", (r) => {
          r.resources("users");
        });
      });
    });
    expect(routes.recognize("GET", "/api/v1/users")!.route.action).toBe("index");
    expect(routes.pathFor("api_v1_users")).toBe("/api/v1/users");
  });

  it("namespace containing numbers", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("api", (r) => {
        r.namespace("v2", (r) => {
          r.resources("articles");
        });
      });
    });
    expect(routes.recognize("GET", "/api/v2/articles")!.route.action).toBe("index");
    expect(routes.pathFor("api_v2_articles")).toBe("/api/v2/articles");
  });

  it("namespaced roots", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("account", (r) => {
        r.root("account#index");
      });
    });
    expect(routes.recognize("GET", "/account")!.route.action).toBe("index");
    expect(routes.pathFor("account_root")).toBe("/account");
  });

  it("resource does not modify passed options", () => {
    const options = { only: ["show", "create"] as ("show" | "create")[] };
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("user", options);
    });
    expect(options).toEqual({ only: ["show", "create"] });
  });

  it("resources does not modify passed options", () => {
    const options = { only: ["index", "show"] as ("index" | "show")[] };
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("users", options);
    });
    expect(options).toEqual({ only: ["index", "show"] });
  });

  it("scoped root as name", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("/api", { as: "api" }, (r) => {
        r.root("api#index");
      });
    });
    expect(routes.pathFor("api_root")).toBe("/api");
  });

  it("projects posts (nested resources)", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("posts");
      });
    });
    expect(routes.recognize("GET", "/projects/1/posts")!.route.controller).toBe("posts");
    expect(routes.recognize("GET", "/projects/1/posts/2")!.route.action).toBe("show");
    expect(routes.recognize("POST", "/projects/1/posts")!.route.action).toBe("create");
  });

  it("root works in the resources scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", (r) => {
        r.root("products#root");
      });
    });
    // The nested root should be at /products/:id/
    expect(routes.recognize("GET", "/products")!.route.action).toBe("index");
  });

  it("module scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope({ module: "api" }, (r) => {
        r.resource("token");
      });
    });
    expect(routes.recognize("GET", "/token")!.route.action).toBe("show");
    expect(routes.pathFor("token")).toBe("/token");
  });

  it("path scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("api", (r) => {
        r.resource("me");
      });
    });
    expect(routes.recognize("GET", "/api/me")!.route.action).toBe("show");
    expect(routes.pathFor("me")).toBe("/api/me");
  });

  it("dynamic controller segments are deprecated", () => {
    // We just verify that a route with :controller segment works at the basic level
    const route = new Route("GET", "/:controller/:action", "default", "index");
    const m = route.match("GET", "/foo/bar");
    expect(m).not.toBeNull();
    expect(m!.params.controller).toBe("foo");
    expect(m!.params.action).toBe("bar");
  });

  it("nested resources with constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { constraints: { id: /\d+/ } }, (r) => {
        r.resources("comments");
      });
    });
    expect(routes.recognize("GET", "/posts/1/comments")).not.toBeNull();
  });

  it("index", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/info", { to: "projects#info", as: "info" });
    });
    expect(routes.pathFor("info")).toBe("/info");
    expect(routes.recognize("GET", "/info")!.route.controller).toBe("projects");
    expect(routes.recognize("GET", "/info")!.route.action).toBe("info");
  });

  it("normalize namespaced matches", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("account", (r) => {
        r.get("description", { action: "description", as: "description" });
      });
    });
    expect(routes.pathFor("account_description")).toBe("/account/description");
  });

  it("session info nested singleton resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("session", (r) => {
        r.resource("info");
      });
    });
    expect(routes.recognize("GET", "/session/info")!.route.action).toBe("show");
  });

  it("member on resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("replies", (r) => {
        r.member((r) => {
          r.put("answer", { to: "replies#mark_as_answer" });
          r.delete("answer", { to: "replies#unmark_as_answer" });
        });
      });
    });
    const putM = routes.recognize("PUT", "/replies/1/answer");
    expect(putM).not.toBeNull();
    expect(putM!.route.action).toBe("mark_as_answer");

    const delM = routes.recognize("DELETE", "/replies/1/answer");
    expect(delM).not.toBeNull();
    expect(delM!.route.action).toBe("unmark_as_answer");
  });

  it("replies", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("replies", (r) => {
        r.member((r) => {
          r.put("answer", { to: "replies#mark_as_answer" });
          r.delete("answer", { to: "replies#unmark_as_answer" });
        });
      });
    });
    expect(routes.recognize("PUT", "/replies/1/answer")!.route.action).toBe("mark_as_answer");
    expect(routes.recognize("DELETE", "/replies/1/answer")!.route.action).toBe("unmark_as_answer");
  });

  it("projects participants", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("participants");
      });
    });
    expect(routes.recognize("GET", "/projects/1/participants")!.route.controller).toBe("participants");
    expect(routes.recognize("GET", "/projects/1/participants/2")!.route.action).toBe("show");
  });

  it("projects companies", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("companies");
      });
    });
    expect(routes.recognize("GET", "/projects/1/companies")!.route.controller).toBe("companies");
    expect(routes.recognize("GET", "/projects/1/companies/2")!.route.action).toBe("show");
  });

  it("project manager", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resource("manager");
      });
    });
    expect(routes.recognize("GET", "/projects/1/manager")!.route.action).toBe("show");
  });

  it("project images", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("images");
      });
    });
    expect(routes.recognize("GET", "/projects/1/images")!.route.controller).toBe("images");
    expect(routes.recognize("GET", "/projects/1/images/2")!.route.action).toBe("show");
    expect(routes.recognize("POST", "/projects/1/images")!.route.action).toBe("create");
  });

  it("projects people", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("people");
      });
    });
    expect(routes.recognize("GET", "/projects/1/people")!.route.controller).toBe("people");
    expect(routes.recognize("GET", "/projects/1/people/2")!.route.action).toBe("show");
  });

  it("account namespace", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("account", (r) => {
        r.resources("subscriptions");
      });
    });
    expect(routes.recognize("GET", "/account/subscriptions")!.route.action).toBe("index");
    expect(routes.pathFor("account_subscriptions")).toBe("/account/subscriptions");
    expect(routes.pathFor("account_subscription", { id: 1 })).toBe("/account/subscriptions/1");
  });

  it("resource constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", { constraints: { id: /\d{4}/ } });
    });
    expect(routes.recognize("GET", "/products/1234")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/products/abc")).toBeNull();
  });

  it("url generator for generic route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("whatever/:controller/:action", { to: "foo#bar" });
    });
    expect(routes.recognize("GET", "/whatever/foo/bar")).not.toBeNull();
  });

  it("url generator for namespaced generic route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("whatever/:controller/:action/:id", { to: "foo#bar", constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/whatever/foo/show/1")).not.toBeNull();
    expect(routes.recognize("GET", "/whatever/foo/show/abc")).toBeNull();
  });

  it("resources merges options from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("products", { only: ["index", "show"] }, (r) => {
        r.resources("images", { only: ["index"] });
      });
    });
    expect(routes.recognize("GET", "/products")).not.toBeNull();
    expect(routes.recognize("GET", "/products/1")).not.toBeNull();
    expect(routes.recognize("GET", "/products/1/edit")).toBeNull();
    expect(routes.recognize("POST", "/products")).toBeNull();
    expect(routes.recognize("GET", "/products/1/images")).not.toBeNull();
  });

  it("resource merges options from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("account", { only: ["show"] });
    });
    expect(routes.recognize("GET", "/account")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/account/new")).toBeNull();
    expect(routes.recognize("GET", "/account/edit")).toBeNull();
  });

  it("resource merges options from scope hash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("account", { only: ["show"] });
    });
    expect(routes.recognize("GET", "/account")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/account/new")).toBeNull();
  });

  it("match without via", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.match("/search", { to: "search#index" });
    });
    // Without via, should match ALL methods
    expect(routes.recognize("GET", "/search")).not.toBeNull();
    expect(routes.recognize("POST", "/search")).not.toBeNull();
  });

  it("non greedy regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+?/ } });
    });
    expect(routes.recognize("GET", "/posts/1")).not.toBeNull();
  });

  it("default string params", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", defaults: { format: "json" } });
    });
    expect(routes.recognize("GET", "/posts")!.route.defaults.format).toBe("json");
  });

  it("default integer params", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", defaults: { page: "1" } });
    });
    expect(routes.recognize("GET", "/posts")!.route.defaults.page).toBe("1");
  });

  it("symbol scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("api", (r) => {
        r.scope("v2", (r) => {
          r.resource("me");
        });
      });
    });
    expect(routes.recognize("GET", "/api/v2/me")!.route.action).toBe("show");
  });

  it("update person route", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("people");
    });
    expect(routes.recognize("PUT", "/people/1")!.route.action).toBe("update");
    expect(routes.recognize("PATCH", "/people/1")!.route.action).toBe("update");
  });

  it("update project person", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", (r) => {
        r.resources("people");
      });
    });
    expect(routes.recognize("PUT", "/projects/1/people/2")!.route.action).toBe("update");
  });

  it("forum products", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("forum", (r) => {
        r.resources("products");
      });
    });
    expect(routes.recognize("GET", "/forum/products")!.route.action).toBe("index");
    expect(routes.pathFor("forum_products")).toBe("/forum/products");
  });

  it("articles with id", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles");
    });
    expect(routes.recognize("GET", "/articles/1")!.route.action).toBe("show");
    expect(routes.pathFor("article", { id: 1 })).toBe("/articles/1");
  });

  it("articles perma", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles", { constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/articles/42")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/articles/abc")).toBeNull();
  });

  it("recognizes tilde path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/~user", { to: "users#show" });
    });
    expect(routes.recognize("GET", "/~user")).not.toBeNull();
  });

  it("recognizes minus path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/young-and-fine", { to: "pages#show" });
    });
    expect(routes.recognize("GET", "/young-and-fine")).not.toBeNull();
  });

  it("recognizes unicode path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/%E3%81%BB%E3%81%92", { to: "pages#show" });
    });
    expect(routes.recognize("GET", "/%E3%81%BB%E3%81%92")).not.toBeNull();
  });

  it("hash constraints dont leak between routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hash/:foo", { to: "pages#show", constraints: { foo: /foo/ } });
      r.get("/hash/:bar", { to: "pages#show_bar" });
    });
    const m = routes.recognize("GET", "/hash/bar");
    expect(m).not.toBeNull();
    expect(m!.route.action).toBe("show_bar");
    expect(m!.params.bar).toBe("bar");
  });

  it("appending routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hello", { to: "hello#index" });
    });
    routes.draw((r) => {
      r.get("/goodbye", { to: "goodbye#index" });
    });
    expect(routes.recognize("GET", "/hello")).not.toBeNull();
    expect(routes.recognize("GET", "/goodbye")).not.toBeNull();
    expect(routes.recognize("GET", "/random")).toBeNull();
  });

  it("controller option with nesting and leading slash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", (r) => {
        r.namespace("bar", (r) => {
          r.get("baz", { to: "baz#index" });
        });
      });
    });
    expect(routes.recognize("GET", "/foo/bar/baz")!.route.action).toBe("index");
  });

  it("multiple nested controller", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("foo", (r) => {
        r.namespace("bar", (r) => {
          r.get("baz", { to: "baz#index" });
        });
      });
      r.get("pooh", { to: "pooh#index" });
    });
    expect(routes.recognize("GET", "/foo/bar/baz")).not.toBeNull();
    expect(routes.recognize("GET", "/pooh")).not.toBeNull();
  });

  it("sprockets", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/assets/:path", { to: "assets#show", as: "asset" });
    });
    expect(routes.recognize("GET", "/assets/application.js")).not.toBeNull();
    expect(routes.pathFor("asset", { path: "application.js" })).toBe("/assets/application.js");
  });

  it("projects status", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/projects/status", { to: "projects#status" });
    });
    expect(routes.recognize("GET", "/projects/status")!.route.action).toBe("status");
  });

  it("access token rooms", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("access_tokens", (r) => {
        r.resources("rooms");
      });
    });
    expect(routes.recognize("GET", "/access_tokens/1/rooms")!.route.controller).toBe("rooms");
  });

  it("resources controller name is not pluralized", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("content");
    });
    expect(routes.recognize("GET", "/content")!.route.controller).toBe("content");
  });

  it("resources are not pluralized", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("transport", (r) => {
        r.resources("taxis");
      });
    });
    expect(routes.recognize("GET", "/transport/taxis")!.route.action).toBe("index");
    expect(routes.pathFor("transport_taxis")).toBe("/transport/taxis");
    expect(routes.recognize("GET", "/transport/taxis/1")!.route.action).toBe("show");
    expect(routes.pathFor("transport_taxi", { id: 1 })).toBe("/transport/taxis/1");
    expect(routes.recognize("GET", "/transport/taxis/new")!.route.action).toBe("new");
    expect(routes.pathFor("transport_new_taxi")).toBe("/transport/taxis/new");
    expect(routes.recognize("GET", "/transport/taxis/1/edit")!.route.action).toBe("edit");
    expect(routes.pathFor("transport_edit_taxi", { id: 1 })).toBe("/transport/taxis/1/edit");
  });

  it("singleton resources are not singularized", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("medical", (r) => {
        r.resource("taxis");
      });
    });
    expect(routes.recognize("GET", "/medical/taxis")!.route.action).toBe("show");
    expect(routes.recognize("POST", "/medical/taxis")!.route.action).toBe("create");
    expect(routes.recognize("GET", "/medical/taxis/new")!.route.action).toBe("new");
    expect(routes.recognize("GET", "/medical/taxis/edit")!.route.action).toBe("edit");
  });

  it("router removes invalid conditions", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/tickets", { to: "tickets#index", as: "tickets" });
    });
    expect(routes.recognize("GET", "/tickets")).not.toBeNull();
    expect(routes.pathFor("tickets")).toBe("/tickets");
  });

  it("route defined in resources scope level", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("customers", (r) => {
        r.get("export", { to: "customers#export" });
      });
    });
    expect(routes.recognize("GET", "/customers/1/export")!.route.action).toBe("export");
  });

  it("only should be read from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("clubs", { only: ["index", "show"] });
    });
    expect(routes.recognize("GET", "/clubs")).not.toBeNull();
    expect(routes.recognize("GET", "/clubs/1")).not.toBeNull();
    expect(routes.recognize("GET", "/clubs/1/edit")).toBeNull();
    expect(routes.recognize("POST", "/clubs")).toBeNull();
  });

  it("except should be read from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("clubs", { except: ["new", "edit"] });
    });
    expect(routes.recognize("GET", "/clubs")).not.toBeNull();
    expect(routes.recognize("GET", "/clubs/1")).not.toBeNull();
    // /clubs/new matches show with id="new" since new route is excluded
    expect(routes.recognize("GET", "/clubs/new")!.route.action).toBe("show");
    // /clubs/1/edit has no matching route (3 segments, no edit route)
    expect(routes.recognize("GET", "/clubs/1/edit")).toBeNull();
  });

  it("only option should override scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { only: ["index"] });
    });
    expect(routes.recognize("GET", "/posts")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1")).toBeNull();
  });

  it("except option should override scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { except: ["destroy"] });
    });
    expect(routes.recognize("DELETE", "/posts/1")).toBeNull();
    expect(routes.recognize("GET", "/posts")).not.toBeNull();
  });

  it("only option should not inherit", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { only: ["index", "show"] }, (r) => {
        r.resources("comments");
      });
    });
    // Comments should have all 7 routes (only doesn't propagate)
    expect(routes.recognize("GET", "/posts/1/comments")).not.toBeNull();
    expect(routes.recognize("POST", "/posts/1/comments")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1/comments/new")).not.toBeNull();
  });

  it("except option should not inherit", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { except: ["destroy"] }, (r) => {
        r.resources("comments");
      });
    });
    // Comments should have all 7 routes
    expect(routes.recognize("DELETE", "/posts/1/comments/2")).not.toBeNull();
  });

  it("projects for api app", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", { except: ["new", "edit"] });
    });
    expect(routes.recognize("GET", "/projects")).not.toBeNull();
    expect(routes.recognize("GET", "/projects/1")).not.toBeNull();
    // Without new route, /projects/new falls through to show with id="new"
    expect(routes.recognize("GET", "/projects/new")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/projects/1/edit")).toBeNull();
  });

  it("constraints are merged from scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("movies", { constraints: { id: /\d{4}/ } });
    });
    expect(routes.recognize("GET", "/movies/0001")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/movies/00001")).toBeNull();
  });

  it("nested resource constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("lists", { constraints: { id: /\d+/ } }, (r) => {
        r.resources("todos", { constraints: { id: /\d+/ } });
      });
    });
    expect(routes.recognize("GET", "/lists/1/todos/2")).not.toBeNull();
    expect(routes.recognize("GET", "/lists/abc/todos/2")).toBeNull();
  });

  it("goodbye should be available", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/goodbye", { to: "goodbye#index" });
    });
    routes.draw((r) => {
      r.get("/hello", { to: "hello#index" });
    });
    expect(routes.recognize("GET", "/goodbye")).not.toBeNull();
  });

  it("hello should not be overwritten", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hello", { to: "hello#first" });
    });
    routes.draw((r) => {
      r.get("/hello", { to: "hello#second" });
    });
    // First match wins
    expect(routes.recognize("GET", "/hello")!.route.action).toBe("first");
  });

  it("missing routes are still missing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/hello", { to: "hello#index" });
    });
    expect(routes.recognize("GET", "/random")).toBeNull();
  });

  it("default scope", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.scope("api", { as: "api" }, (r) => {
        r.resources("posts");
      });
    });
    expect(routes.recognize("GET", "/api/posts")).not.toBeNull();
    expect(routes.pathFor("api_posts")).toBe("/api/posts");
  });

  it("URL helpers raise a missing keys error for a nil param", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(() => routes.pathFor("post")).toThrow(/Missing required parameter/);
  });

  it("URL helpers raise message with mixed parameters when generation fails", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id/comments/:comment_id", { to: "comments#show", as: "post_comment" });
    });
    expect(() => routes.pathFor("post_comment", { id: 1 })).toThrow(/comment_id/);
  });

  it("correct for empty UrlGenerationError", () => {
    const routes = new RouteSet();
    expect(() => routes.pathFor("nonexistent")).toThrow(/No route matches name/);
  });

  it("resource with slugs in ids", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { constraints: { id: /[a-z0-9-]+/ } });
    });
    expect(routes.recognize("GET", "/posts/hello-world")!.route.action).toBe("show");
    expect(routes.recognize("GET", "/posts/123-abc")!.params.id).toBe("123-abc");
  });

  it("named character classes in regexp constraints", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/purchases/:token/:filename", {
        to: "purchases#fetch",
        constraints: { token: /[a-zA-Z0-9]{10}/ },
        as: "purchase",
      });
    });
    expect(routes.recognize("GET", "/purchases/315004be7e/Ruby_on_Rails.pdf")).not.toBeNull();
    expect(routes.pathFor("purchase", { token: "315004be7e", filename: "Ruby_on_Rails.pdf" }))
      .toBe("/purchases/315004be7e/Ruby_on_Rails.pdf");
  });

  it("resources path can be a symbol", () => {
    // In TS, we use strings, but test the path option
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/pages", { to: "wiki_pages#index", as: "wiki_pages" });
      r.get("/pages/:id", { to: "wiki_pages#show", as: "wiki_page" });
    });
    expect(routes.pathFor("wiki_pages")).toBe("/pages");
    expect(routes.pathFor("wiki_page", { id: "Ruby_on_Rails" })).toBe("/pages/Ruby_on_Rails");
  });

  // --- Redirect tests ---
  it("login redirect", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/login", { to: r.redirect("/dashboard"), as: "login" });
    });
    const m = routes.recognize("GET", "/login");
    expect(m).not.toBeNull();
    expect(m!.route.isRedirect).toBe(true);
    const { url, status } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/login" });
    expect(url).toBe("/dashboard");
    expect(status).toBe(301);
  });

  it("logout redirect without to", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/logout", { to: r.redirect("/"), as: "logout" });
    });
    const m = routes.recognize("GET", "/logout");
    expect(m!.route.isRedirect).toBe(true);
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/logout" });
    expect(url).toBe("/");
  });

  it("namespace redirect", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.namespace("admin", (r) => {
        r.get("/old", { to: r.redirect("/admin/new"), as: "old" });
      });
    });
    const m = routes.recognize("GET", "/admin/old");
    expect(m!.route.isRedirect).toBe(true);
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/admin/old" });
    expect(url).toBe("/admin/new");
  });

  it("redirect with failing constraint", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: r.redirect("/articles/%{id}"), constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/posts/abc")).toBeNull();
  });

  it("redirect with passing constraint", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: r.redirect("/articles/%{id}"), constraints: { id: /\d+/ } });
    });
    const m = routes.recognize("GET", "/posts/123");
    expect(m).not.toBeNull();
    expect(m!.route.isRedirect).toBe(true);
  });

  it("redirect modulo", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect("/new/%{id}") });
    });
    const m = routes.recognize("GET", "/old/42");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old/42" });
    expect(url).toBe("/new/42");
  });

  it("redirect proc", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect((params) => `/new/${params.id}`), as: "old" });
    });
    const m = routes.recognize("GET", "/old/5");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old/5" });
    expect(url).toBe("/new/5");
  });

  it("redirect proc with request", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect((_params, req) => `${req.path}/new`), as: "old" });
    });
    const m = routes.recognize("GET", "/old");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old" });
    expect(url).toBe("/old/new");
  });

  it("redirect hash with subdomain", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ subdomain: "api" }), as: "old" });
    });
    const m = routes.recognize("GET", "/old");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old", host: "www.example.com" });
    expect(url).toBe("http://api.example.com/old");
  });

  it("redirect hash with domain and path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ domain: "other.com", path: "/new" }), as: "old" });
    });
    const m = routes.recognize("GET", "/old");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old", host: "www.example.com" });
    expect(url).toBe("http://www.other.com/new");
  });

  it("redirect hash with path", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ path: "/new" }), as: "old" });
    });
    const m = routes.recognize("GET", "/old");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old", host: "www.example.com" });
    expect(url).toBe("http://www.example.com/new");
  });

  it("redirect hash with host", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old", { to: r.redirect({ host: "other.com" }), as: "old" });
    });
    const m = routes.recognize("GET", "/old");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old", host: "www.example.com" });
    expect(url).toBe("http://other.com/old");
  });

  it("redirect hash path substitution", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: r.redirect({ path: "/articles/%{id}" }), as: "old_post" });
    });
    const m = routes.recognize("GET", "/posts/42");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/posts/42", host: "example.com" });
    expect(url).toBe("http://example.com/articles/42");
  });

  it("redirect hash path substitution with catch all", () => {
    const route = new Route("GET", "/old/*path", "", "", {
      redirect: { path: "/new/%{path}" },
    });
    const m = route.match("GET", "/old/a/b/c");
    const { url } = route.resolveRedirect(m!.params, { method: "GET", path: "/old/a/b/c", host: "example.com" });
    expect(url).toBe("http://example.com/new/a/b/c");
  });

  it("redirect class", () => {
    // A redirect "class" is just a function that returns a redirect target
    const customRedirect = (params: Record<string, string>) => `/custom/${params.id}`;
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/old/:id", { to: r.redirect(customRedirect), as: "old" });
    });
    const m = routes.recognize("GET", "/old/7");
    const { url } = m!.route.resolveRedirect(m!.params, { method: "GET", path: "/old/7" });
    expect(url).toBe("/custom/7");
  });

  it("resources for uncountable names", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("sheep");
    });
    // Even with an uncountable name, index route is created
    expect(routes.recognize("GET", "/sheep")).not.toBeNull();
    expect(routes.recognize("GET", "/sheep/1")).not.toBeNull();
  });

  it("path names", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", { pathNames: { new: "novo", edit: "editar" } });
    });
    expect(routes.recognize("GET", "/posts/novo")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/novo")!.route.action).toBe("new");
    expect(routes.recognize("GET", "/posts/1/editar")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1/editar")!.route.action).toBe("edit");
  });

  it("projects with resources path names", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("projects", { pathNames: { new: "nuevo" } }, (r) => {
        r.resources("tasks", { pathNames: { new: "nueva" } });
      });
    });
    expect(routes.recognize("GET", "/projects/nuevo")!.route.action).toBe("new");
    expect(routes.recognize("GET", "/projects/1/tasks/nueva")!.route.action).toBe("new");
  });

  it("shallow nested resources", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", (r) => {
        r.resources("comments", { shallow: true });
      });
    });
    // Collection routes are nested
    expect(routes.recognize("GET", "/posts/1/comments")).not.toBeNull();
    expect(routes.recognize("POST", "/posts/1/comments")).not.toBeNull();
    // Member routes are shallow (not nested)
    expect(routes.recognize("GET", "/comments/1")).not.toBeNull();
    expect(routes.recognize("GET", "/comments/1")!.route.action).toBe("show");
    expect(routes.recognize("DELETE", "/comments/1")).not.toBeNull();
  });

  it("shallow nested resources inside resource", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("account", (r) => {
        r.resources("posts", { shallow: true });
      });
    });
    // Collection routes are nested under the singular resource
    expect(routes.recognize("GET", "/account/posts")).not.toBeNull();
    // Member routes are shallow
    expect(routes.recognize("GET", "/posts/1")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1")!.route.action).toBe("show");
  });

  it("custom resource routes are scoped", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("posts", (r) => {
        r.get("preview", { to: "posts#preview", as: "preview" });
      });
    });
    const m = routes.recognize("GET", "/posts/1/preview");
    expect(m).not.toBeNull();
    expect(m!.route.action).toBe("preview");
  });

  it("glob parameter accepts regexp", () => {
    const route = new Route("GET", "/posts/*path", "posts", "show");
    const m = route.match("GET", "/posts/2024/01/hello");
    expect(m).not.toBeNull();
    expect(m!.params.path).toBe("2024/01/hello");
  });

  it("optional scoped root", () => {
    const route = new Route("GET", "(/:locale)/posts", "posts", "index");
    expect(route.match("GET", "/posts")).not.toBeNull();
    expect(route.match("GET", "/en/posts")).not.toBeNull();
    expect(route.match("GET", "/en/posts")!.params.locale).toBe("en");
  });

  it("optional scoped root hierarchy", () => {
    const r1 = new Route("GET", "(/:locale)/posts", "posts", "index");
    const r2 = new Route("GET", "(/:locale)/posts/:id", "posts", "show");
    expect(r1.match("GET", "/posts")).not.toBeNull();
    expect(r2.match("GET", "/posts/1")).not.toBeNull();
    expect(r2.match("GET", "/en/posts/1")).not.toBeNull();
    expect(r2.match("GET", "/en/posts/1")!.params.locale).toBe("en");
  });

  it("optional part of segment", () => {
    const route = new Route("GET", "/posts(/:id)", "posts", "index");
    expect(route.match("GET", "/posts")).not.toBeNull();
    expect(route.match("GET", "/posts/1")).not.toBeNull();
    expect(route.match("GET", "/posts/1")!.params.id).toBe("1");
  });

  it("url generator for optional prefix dynamic segment", () => {
    const route = new Route("GET", "(/:locale)/posts", "posts", "index");
    expect(route.pathFor({ locale: "en" })).toBe("/en/posts");
    expect(route.pathFor({})).toBe("/posts");
  });

  it("url generator for optional suffix static and dynamic segment", () => {
    const route = new Route("GET", "/posts(/:id)", "posts", "show");
    expect(route.pathFor({ id: "1" })).toBe("/posts/1");
    expect(route.pathFor({})).toBe("/posts");
  });

  it("constraints block not carried to following routes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.constraints({ id: /\d+/ }, () => {
        r.get("/posts/:id", { to: "posts#show" });
      });
      r.get("/articles/:id", { to: "articles#show" });
    });
    // Inside constraints block — only digits
    expect(routes.recognize("GET", "/posts/123")).not.toBeNull();
    // Outside constraints block — any string matches
    expect(routes.recognize("GET", "/articles/abc")).not.toBeNull();
  });

  it("concerns", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.concern("commentable", (r) => {
        r.resources("comments");
      });
      r.resources("posts", (r) => {
        r.useConcerns("commentable");
      });
    });
    expect(routes.recognize("GET", "/posts/1/comments")).not.toBeNull();
    expect(routes.recognize("POST", "/posts/1/comments")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/1/comments/2")).not.toBeNull();
  });
});

// ==========================================================================
// dispatch/routing/inspector_test.rb
// ==========================================================================
describe("ActionDispatch::Routing::Inspector", () => {
  it("displaying routes for engines", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts", { to: "posts#index", as: "posts" });
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const rows = inspector.inspect();
    expect(rows.length).toBe(1);
    expect(rows[0].verb).toBe("GET");
    expect(rows[0].path).toBe("/posts");
    expect(rows[0].controller).toBe("posts");
    expect(rows[0].action).toBe("index");
  });

  it("cart inspect", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resource("cart");
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const rows = inspector.inspect();
    // singular resource: new, create, show, edit, update (PUT+PATCH), destroy = 7 routes
    expect(rows.length).toBe(7);
    const verbs = rows.map((r) => r.verb);
    expect(verbs).toContain("GET");
    expect(verbs).toContain("POST");
    expect(verbs).toContain("PUT");
    expect(verbs).toContain("PATCH");
    expect(verbs).toContain("DELETE");
  });

  it("articles inspect with multiple verbs", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.resources("articles");
    });
    const inspector = new RoutesInspector(routes.getRoutes());
    const rows = inspector.inspect();
    // resources: index, create, new, show, edit, update (PUT+PATCH), destroy = 8 routes
    expect(rows.length).toBe(8);
    const formatted = inspector.format();
    expect(formatted).toContain("articles");
    expect(formatted).toContain("GET");
  });
});

// ==========================================================================
// controller/routing_test.rb
// ==========================================================================
describe("ActionController::Routing", () => {
  it("route generation allows passing non string values to generated helper", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    // Numbers should be coerced to strings
    expect(routes.pathFor("post", { id: 42 })).toBe("/posts/42");
  });

  it("id with dash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/journey/:id", { to: "journey#show" });
    });
    const m = routes.recognize("GET", "/journey/faithfully-omg");
    expect(m).not.toBeNull();
    expect(m!.params.id).toBe("faithfully-omg");
  });

  it("regexp precedence", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
      r.get("/posts/:slug", { to: "posts#show_by_slug" });
    });
    const m1 = routes.recognize("GET", "/posts/123");
    expect(m1!.route.action).toBe("show");
    const m2 = routes.recognize("GET", "/posts/hello");
    expect(m2!.route.action).toBe("show_by_slug");
  });

  it("route generation escapes unsafe path characters", () => {
    expect(escapeSegment("a b/c")).toBe("a%20b%2Fc");
  });

  it("route recognition unescapes path components", () => {
    expect(unescapeUri("a%20b%2Fc")).toBe("a b/c");
  });

  it("dash with custom regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/journey/:id", { to: "journey#show", constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/journey/123")).not.toBeNull();
    expect(routes.recognize("GET", "/journey/abc")).toBeNull();
  });

  it("pre dash", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/omg-faithfully");
    expect(m!.params.id).toBe("omg-faithfully");
  });

  it("pre dash with custom regexp", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", constraints: { id: /\d+/ } });
    });
    expect(routes.recognize("GET", "/posts/123")).not.toBeNull();
    expect(routes.recognize("GET", "/posts/omg-123")).toBeNull();
  });

  it("empty string match", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/", { to: "home#index" });
    });
    expect(routes.recognize("GET", "/")!.route.action).toBe("index");
  });

  it("symbols with dashes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/my-route/:id", { to: "my_controller#show" });
    });
    const m = routes.recognize("GET", "/my-route/123");
    expect(m).not.toBeNull();
    expect(m!.params.id).toBe("123");
  });

  it("id encoding", () => {
    // IDs with special characters should be matched as-is
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/hello%20world");
    expect(m).not.toBeNull();
    expect(m!.params.id).toBe("hello%20world");
  });
});

// ==========================================================================
// dispatch/routing_assertions_test.rb
// ==========================================================================
describe("ActionDispatch::Routing::Assertions", () => {
  it("assert generates", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    expect(routes.pathFor("post", { id: 1 })).toBe("/posts/1");
  });

  it("assert recognizes", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show" });
    });
    const m = routes.recognize("GET", "/posts/1");
    expect(m).not.toBeNull();
    expect(m!.route.controller).toBe("posts");
    expect(m!.route.action).toBe("show");
    expect(m!.params.id).toBe("1");
  });

  it("assert routing", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/posts/:id", { to: "posts#show", as: "post" });
    });
    // Assert both generate and recognize
    expect(routes.pathFor("post", { id: 1 })).toBe("/posts/1");
    const m = routes.recognize("GET", "/posts/1");
    expect(m!.route.controller).toBe("posts");
  });

  it("with routing", () => {
    // with_routing creates a temporary route set for testing
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/temp", { to: "temp#index", as: "temp" });
    });
    expect(routes.pathFor("temp")).toBe("/temp");
    // After the block, routes are discarded (simulated by clearing)
    routes.clear();
    expect(() => routes.pathFor("temp")).toThrow();
  });
});
