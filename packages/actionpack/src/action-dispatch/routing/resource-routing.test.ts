import { beforeAll, describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { RouteSet } from "./route-set.js";
import { controllerConstants } from "../http/request.js";
import type { DispatchableControllerClass } from "./dispatcher.js";
import { RoutingError } from "../../action-controller/metal/exceptions.js";

class StubController {}

beforeAll(() => {
  for (const name of [
    "pages",
    "posts",
    "comments",
    "profiles",
    "sessions",
    "articles",
    "users",
    "admin/posts",
    "api/posts",
    "api/v1/articles",
    "api/v1/posts",
  ]) {
    controllerConstants.set(name, StubController as unknown as DispatchableControllerClass);
  }
});

describe("Resource routing", () => {
  describe("resources()", () => {
    it("generates index route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognizePath("/posts");
      expect(m.action).toBe("index");
      expect(m.controller).toBe("posts");
    });

    it("generates show route with id", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognizePath("/posts/42");
      expect(m.action).toBe("show");
      expect(m.id).toBe("42");
    });

    it("generates new route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognizePath("/posts/new");
      expect(m.action).toBe("new");
    });

    it("generates create route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognizePath("/posts", { method: "post" }).action).toBe("create");
    });

    it("generates edit route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const m = routes.recognizePath("/posts/42/edit");
      expect(m.action).toBe("edit");
      expect(m.id).toBe("42");
    });

    it("generates update route (PUT)", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognizePath("/posts/42", { method: "put" }).action).toBe("update");
    });

    it("generates update route (PATCH)", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognizePath("/posts/42", { method: "patch" }).action).toBe("update");
    });

    it("generates destroy route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      expect(routes.recognizePath("/posts/42", { method: "delete" }).action).toBe("destroy");
    });

    it("generates named routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const named = routes.namedRoutes.routes;
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
      expect(routes.pathFor({}, "posts")).toBe("/posts");
      expect(routes.pathFor({ id: "1" }, "post")).toBe("/posts/1");
      expect(routes.pathFor({}, "new_post")).toBe("/posts/new");
      expect(routes.pathFor({ id: "1" }, "edit_post")).toBe("/posts/1/edit");
    });
  });

  describe("resource() (singular)", () => {
    it("generates show route at singular path", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognizePath("/session").action).toBe("show");
    });

    it("generates create route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognizePath("/session", { method: "post" }).action).toBe("create");
    });

    it("generates destroy route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognizePath("/session", { method: "delete" }).action).toBe("destroy");
    });

    it("generates update route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognizePath("/session", { method: "put" }).action).toBe("update");
    });

    it("generates new route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognizePath("/session/new").action).toBe("new");
    });

    it("generates edit route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      expect(routes.recognizePath("/session/edit").action).toBe("edit");
    });

    it("has no index route", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      const all = routes.routes.routes;
      const actions = all.map((r) => r.defaults.action);
      expect(actions).not.toContain("index");
    });

    it("generates named routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session");
      });
      const named = routes.namedRoutes.routes;
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
      expect(() => routes.recognizePath("/posts")).not.toThrow();
      expect(() => routes.recognizePath("/posts/1")).not.toThrow();
      expect(() => routes.recognizePath("/posts", { method: "post" })).toThrow(RoutingError);
      expect(() => routes.recognizePath("/posts/1", { method: "delete" })).toThrow(RoutingError);
    });

    it("except excludes specified routes", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { except: ["destroy", "edit", "update"] });
      });
      expect(() => routes.recognizePath("/posts")).not.toThrow();
      expect(() => routes.recognizePath("/posts", { method: "post" })).not.toThrow();
      expect(() => routes.recognizePath("/posts/1", { method: "delete" })).toThrow(RoutingError);
    });

    it("only on singular resource", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resource("session", { only: ["show", "create"] });
      });
      expect(() => routes.recognizePath("/session")).not.toThrow();
      expect(() => routes.recognizePath("/session", { method: "post" })).not.toThrow();
      expect(() => routes.recognizePath("/session", { method: "delete" })).toThrow(RoutingError);
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
      const m = routes.recognizePath("/posts/1/comments");
      expect(m.post_id).toBe("1");
      expect(m.action).toBe("index");
      expect(m.controller).toBe("comments");
    });

    it("nests member route under parent", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.resources("comments");
        });
      });
      const m = routes.recognizePath("/posts/1/comments/5");
      expect(m.post_id).toBe("1");
      expect(m.id).toBe("5");
      expect(m.action).toBe("show");
    });

    it("generates named routes for nested resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", {}, (posts) => {
          posts.resources("comments");
        });
      });
      const named = routes.namedRoutes.routes;
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
      expect(routes.pathFor({ post_id: "1" }, "post_comments")).toBe("/posts/1/comments");
      expect(routes.pathFor({ post_id: "1", id: "5" }, "post_comment")).toBe("/posts/1/comments/5");
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
      const m = routes.recognizePath("/posts/1/comments");
      expect(m.post_id).toBe("1");
    });

    it("member routes are at top level", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { shallow: true }, (posts) => {
          posts.resources("comments");
        });
      });
      const m = routes.recognizePath("/comments/5");
      expect(m.id).toBe("5");
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
      const m = routes.recognizePath("/admin/posts");
      expect(m.controller).toBe("admin/posts");
    });

    it("prefixes named routes with namespace", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.namespace("admin", (admin) => {
          admin.resources("posts");
        });
      });
      const named = routes.namedRoutes.routes;
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
      const m = routes.recognizePath("/api/v1/articles");
      expect(m.controller).toBe("api/v1/articles");
    });

    it("generates paths for namespaced resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.namespace("admin", (admin) => {
          admin.resources("posts");
        });
      });
      expect(routes.pathFor({}, "admin_posts")).toBe("/admin/posts");
      expect(routes.pathFor({ id: "1" }, "admin_post")).toBe("/admin/posts/1");
    });
  });

  describe("custom path names", () => {
    it("customizes new path", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { pathNames: { new: "nuevo" } });
      });
      const m = routes.recognizePath("/posts/nuevo");
      expect(m.action).toBe("new");
    });

    it("customizes edit path", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { pathNames: { edit: "editar" } });
      });
      const m = routes.recognizePath("/posts/1/editar");
      expect(m.action).toBe("edit");
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
      const m = routes.recognizePath("/posts/1/publish", { method: "post" });
      expect(m.id).toBe("1");
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
      const m = routes.recognizePath("/posts/search");
      expect(m.action).toBe("search");
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
          posts.concerns("commentable");
        });
      });
      const m = routes.recognizePath("/posts/1/comments");
      expect(m.post_id).toBe("1");
    });

    it("reuses concerns across multiple resources", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.concern("commentable", (c) => {
          c.resources("comments");
        });
        map.resources("posts", {}, (posts) => {
          posts.concerns("commentable");
        });
        map.resources("articles", {}, (articles) => {
          articles.concerns("commentable");
        });
      });
      expect(() => routes.recognizePath("/posts/1/comments")).not.toThrow();
      expect(() => routes.recognizePath("/articles/1/comments")).not.toThrow();
    });
  });

  describe("constraints on resources", () => {
    it("constrains id format", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts", { constraints: { id: /\d+/ } });
      });
      expect(() => routes.recognizePath("/posts/123")).not.toThrow();
      expect(() => routes.recognizePath("/posts/abc")).toThrow(RoutingError);
    });
  });

  describe("route introspection", () => {
    it("getNamedRoutes returns named route map", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("posts");
      });
      const named = routes.namedRoutes.routes;
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
      const m = routes.recognizePath("/users/1/profile");
      expect(m.user_id).toBe("1");
      expect(m.action).toBe("show");
    });
  });

  describe("non-inflecting words (test_singleton_resource_name_is_not_singularized / test_restful_routes_dont_generate_duplicates)", () => {
    it("resources with non-inflecting name does not generate duplicate named routes", () => {
      const routes = new RouteSet();
      expect(() => {
        routes.draw((map) => {
          map.resources("sheep");
        });
      }).not.toThrow();
      const named = routes.namedRoutes.routes;
      expect(named.has("sheep")).toBe(true);
    });

    it("resources generates no duplicate [verb, path] pairs", () => {
      const routes = new RouteSet();
      routes.draw((map) => {
        map.resources("messages");
      });
      const all = routes.routes.routes;
      const seen = new Set<string>();
      for (const r of all) {
        const key = `${r.verb} ${r.path.spec}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });

    it("duplicate explicit route name raises ArgumentError (Rails parity)", () => {
      const routes = new RouteSet();
      expect(() =>
        routes.draw((map) => {
          map.get("/foo", { to: "pages#foo", as: "foo" });
          map.get("/bar", { to: "pages#bar", as: "foo" });
        }),
      ).toThrow(ArgumentError);
    });
  });
});
