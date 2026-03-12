import { describe, it, expect } from "vitest";
import { RouteSet } from "./route-set.js";

// ==========================================================================
// action_dispatch/routing/resource_routing_test.rb
// ==========================================================================
describe("Resource routing", () => {
  describe("resources()", () => {
    it("generates index route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognize("GET", "/posts");
      expect(m).not.toBeNull();
      expect(m!.route.action).toBe("index");
      expect(m!.route.controller).toBe("posts");
    });

    it("generates show route with id", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognize("GET", "/posts/42");
      expect(m!.route.action).toBe("show");
      expect(m!.params.id).toBe("42");
    });

    it("generates new route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognize("GET", "/posts/new");
      expect(m).not.toBeNull();
      expect(m!.route.action).toBe("new");
    });

    it("generates create route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognize("POST", "/posts")!.route.action).toBe("create");
    });

    it("generates edit route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognize("GET", "/posts/42/edit");
      expect(m!.route.action).toBe("edit");
      expect(m!.params.id).toBe("42");
    });

    it("generates update route (PUT)", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognize("PUT", "/posts/42")!.route.action).toBe("update");
    });

    it("generates update route (PATCH)", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognize("PATCH", "/posts/42")!.route.action).toBe("update");
    });

    it("generates destroy route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognize("DELETE", "/posts/42")!.route.action).toBe("destroy");
    });

    it("generates named routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const named = routes.getNamedRoutes();
      expect(named.has("posts")).toBe(true);
      expect(named.has("post")).toBe(true);
      expect(named.has("new_post")).toBe(true);
      expect(named.has("edit_post")).toBe(true);
    });

    it("pathFor generates correct paths for all actions", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.pathFor("posts", {})).toBe("/posts");
      expect(routes.pathFor("post", { id: "1" })).toBe("/posts/1");
      expect(routes.pathFor("new_post", {})).toBe("/posts/new");
      expect(routes.pathFor("edit_post", { id: "1" })).toBe("/posts/1/edit");
    });
  });

  describe("resource() (singular)", () => {
    it("generates show route at singular path", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognize("GET", "/session")!.route.action).toBe("show");
    });

    it("generates create route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognize("POST", "/session")!.route.action).toBe("create");
    });

    it("generates destroy route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognize("DELETE", "/session")!.route.action).toBe("destroy");
    });

    it("generates update route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognize("PUT", "/session")!.route.action).toBe("update");
    });

    it("generates new route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognize("GET", "/session/new")!.route.action).toBe("new");
    });

    it("generates edit route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognize("GET", "/session/edit")!.route.action).toBe("edit");
    });

    it("has no index route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      const all = routes.getRoutes();
      const actions = all.map((r) => r.action);
      expect(actions).not.toContain("index");
    });

    it("generates named routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      const named = routes.getNamedRoutes();
      expect(named.has("session")).toBe(true);
      expect(named.has("new_session")).toBe(true);
      expect(named.has("edit_session")).toBe(true);
    });
  });

  describe("only and except options", () => {
    it("only limits generated routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { only: ["index", "show"] });
      });
      expect(routes.recognize("GET", "/posts")).not.toBeNull();
      expect(routes.recognize("GET", "/posts/1")).not.toBeNull();
      expect(routes.recognize("POST", "/posts")).toBeNull();
      expect(routes.recognize("DELETE", "/posts/1")).toBeNull();
    });

    it("except excludes specified routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { except: ["destroy", "edit", "update"] });
      });
      expect(routes.recognize("GET", "/posts")).not.toBeNull();
      expect(routes.recognize("POST", "/posts")).not.toBeNull();
      expect(routes.recognize("DELETE", "/posts/1")).toBeNull();
    });

    it("only on singular resource", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session", { only: ["show", "create"] });
      });
      expect(routes.recognize("GET", "/session")).not.toBeNull();
      expect(routes.recognize("POST", "/session")).not.toBeNull();
      expect(routes.recognize("DELETE", "/session")).toBeNull();
    });
  });

  describe("nested resources", () => {
    it("nests collection route under parent", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.resources("comments");
        });
      });
      const m = routes.recognize("GET", "/posts/1/comments");
      expect(m).not.toBeNull();
      expect(m!.params.post_id).toBe("1");
      expect(m!.route.action).toBe("index");
      expect(m!.route.controller).toBe("comments");
    });

    it("nests member route under parent", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.resources("comments");
        });
      });
      const m = routes.recognize("GET", "/posts/1/comments/5");
      expect(m!.params.post_id).toBe("1");
      expect(m!.params.id).toBe("5");
      expect(m!.route.action).toBe("show");
    });

    it("generates named routes for nested resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.resources("comments");
        });
      });
      const named = routes.getNamedRoutes();
      expect(named.has("post_comments")).toBe(true);
      expect(named.has("post_comment")).toBe(true);
    });

    it("generates paths for nested resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.resources("comments");
        });
      });
      expect(routes.pathFor("post_comments", { post_id: "1" })).toBe("/posts/1/comments");
      expect(routes.pathFor("post_comment", { post_id: "1", id: "5" })).toBe("/posts/1/comments/5");
    });
  });

  describe("shallow nested resources", () => {
    it("collection routes are nested under parent", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { shallow: true }, (posts) => {
          posts.resources("comments");
        });
      });
      const m = routes.recognize("GET", "/posts/1/comments");
      expect(m).not.toBeNull();
      expect(m!.params.post_id).toBe("1");
    });

    it("member routes are at top level", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { shallow: true }, (posts) => {
          posts.resources("comments");
        });
      });
      const m = routes.recognize("GET", "/comments/5");
      expect(m).not.toBeNull();
      expect(m!.params.id).toBe("5");
    });
  });

  describe("namespace with resources", () => {
    it("prefixes path with namespace", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.namespace("admin", (admin) => {
          admin.resources("posts");
        });
      });
      const m = routes.recognize("GET", "/admin/posts");
      expect(m).not.toBeNull();
      expect(m!.route.controller).toBe("admin/posts");
    });

    it("prefixes named routes with namespace", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.namespace("admin", (admin) => {
          admin.resources("posts");
        });
      });
      const named = routes.getNamedRoutes();
      expect(named.has("admin_posts")).toBe(true);
      expect(named.has("admin_post")).toBe(true);
    });

    it("deeply nested namespace", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.namespace("api", (api) => {
          api.namespace("v1", (v1) => {
            v1.resources("articles");
          });
        });
      });
      const m = routes.recognize("GET", "/api/v1/articles");
      expect(m!.route.controller).toBe("api/v1/articles");
    });

    it("generates paths for namespaced resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.namespace("admin", (admin) => {
          admin.resources("posts");
        });
      });
      expect(routes.pathFor("admin_posts", {})).toBe("/admin/posts");
      expect(routes.pathFor("admin_post", { id: "1" })).toBe("/admin/posts/1");
    });
  });

  describe("custom path names", () => {
    it("customizes new path", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { pathNames: { new: "nuevo" } });
      });
      const m = routes.recognize("GET", "/posts/nuevo");
      expect(m).not.toBeNull();
      expect(m!.route.action).toBe("new");
    });

    it("customizes edit path", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { pathNames: { edit: "editar" } });
      });
      const m = routes.recognize("GET", "/posts/1/editar");
      expect(m).not.toBeNull();
      expect(m!.route.action).toBe("edit");
    });
  });

  describe("member and collection routes", () => {
    it("member route adds action on single resource", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.member((m) => {
            m.post("/publish", { to: "posts#publish" });
          });
        });
      });
      const m = routes.recognize("POST", "/posts/1/publish");
      expect(m).not.toBeNull();
      expect(m!.params.id).toBe("1");
    });

    it("collection route adds action on collection", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.collection((c) => {
            c.get("/search", { to: "posts#search" });
          });
        });
      });
      const m = routes.recognize("GET", "/posts/search");
      expect(m).not.toBeNull();
      expect(m!.route.action).toBe("search");
    });
  });

  describe("concerns", () => {
    it("defines and includes concern routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.concern("commentable", (c) => {
          c.resources("comments");
        });
        map.resources("posts", {}, (posts) => {
          posts.useConcerns("commentable");
        });
      });
      const m = routes.recognize("GET", "/posts/1/comments");
      expect(m).not.toBeNull();
      expect(m!.params.post_id).toBe("1");
    });

    it("reuses concerns across multiple resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.concern("commentable", (c) => {
          c.resources("comments");
        });
        map.resources("posts", {}, (posts) => {
          posts.useConcerns("commentable");
        });
        map.resources("articles", {}, (articles) => {
          articles.useConcerns("commentable");
        });
      });
      expect(routes.recognize("GET", "/posts/1/comments")).not.toBeNull();
      expect(routes.recognize("GET", "/articles/1/comments")).not.toBeNull();
    });
  });

  describe("constraints on resources", () => {
    it("constrains id format", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { constraints: { id: /\d+/ } });
      });
      expect(routes.recognize("GET", "/posts/123")).not.toBeNull();
      expect(routes.recognize("GET", "/posts/abc")).toBeNull();
    });
  });

  describe("route introspection", () => {
    it("getNamedRoutes returns named route map", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const named = routes.getNamedRoutes();
      expect(named.size).toBeGreaterThanOrEqual(4);
    });
  });

  describe("resources with nested singular resource", () => {
    it("nests singular resource under plural", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("users", {}, (users) => {
          users.resource("profile");
        });
      });
      const m = routes.recognize("GET", "/users/1/profile");
      expect(m).not.toBeNull();
      expect(m!.params.user_id).toBe("1");
      expect(m!.route.action).toBe("show");
    });
  });
});
