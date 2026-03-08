import { describe, it, expect, beforeEach } from "vitest";
import { RouteSet } from "./route-set.js";
import { generateRouteHelpers, type RouteHelpersMap } from "./route-helpers.js";

describe("RouteHelpers", () => {
  let routeSet: RouteSet;
  let helpers: RouteHelpersMap;

  describe("basic resources", () => {
    beforeEach(() => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.resources("posts");
      });
      helpers = generateRouteHelpers(routeSet);
    });

    it("generates _path helpers for all resource routes", () => {
      expect(helpers.posts_path).toBeTypeOf("function");
      expect(helpers.post_path).toBeTypeOf("function");
      expect(helpers.new_post_path).toBeTypeOf("function");
      expect(helpers.edit_post_path).toBeTypeOf("function");
    });

    it("generates _url helpers for all resource routes", () => {
      expect(helpers.posts_url).toBeTypeOf("function");
      expect(helpers.post_url).toBeTypeOf("function");
      expect(helpers.new_post_url).toBeTypeOf("function");
      expect(helpers.edit_post_url).toBeTypeOf("function");
    });

    it("posts_path() returns /posts", () => {
      expect(helpers.posts_path()).toBe("/posts");
    });

    it("post_path(1) returns /posts/1", () => {
      expect(helpers.post_path(1)).toBe("/posts/1");
    });

    it("post_path({ id: 42 }) returns /posts/42", () => {
      expect(helpers.post_path({ id: 42 })).toBe("/posts/42");
    });

    it("new_post_path() returns /posts/new", () => {
      expect(helpers.new_post_path()).toBe("/posts/new");
    });

    it("edit_post_path(1) returns /posts/1/edit", () => {
      expect(helpers.edit_post_path(1)).toBe("/posts/1/edit");
    });

    it("post_path with string id", () => {
      expect(helpers.post_path("abc")).toBe("/posts/abc");
    });
  });

  describe("_url helpers", () => {
    beforeEach(() => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.resources("posts");
      });
    });

    it("_url with default host", () => {
      helpers = generateRouteHelpers(routeSet, { host: "example.com" });
      expect(helpers.posts_url()).toBe("http://example.com/posts");
    });

    it("_url with host and protocol", () => {
      helpers = generateRouteHelpers(routeSet, { host: "example.com", protocol: "https" });
      expect(helpers.post_url(1)).toBe("https://example.com/posts/1");
    });

    it("_url with per-call host override", () => {
      helpers = generateRouteHelpers(routeSet, { host: "example.com" });
      expect(helpers.post_url({ id: 1, host: "other.com" })).toBe("http://other.com/posts/1");
    });

    it("_url throws without host", () => {
      helpers = generateRouteHelpers(routeSet);
      expect(() => helpers.posts_url()).toThrow(/Missing host/);
    });

    it("_url with onlyPath returns path", () => {
      helpers = generateRouteHelpers(routeSet, { host: "example.com" });
      expect(helpers.post_url({ id: 1, onlyPath: true })).toBe("/posts/1");
    });
  });

  describe("nested resources", () => {
    beforeEach(() => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.resources("posts", {}, (r2) => {
          r2.resources("comments");
        });
      });
      helpers = generateRouteHelpers(routeSet);
    });

    it("generates nested path helpers", () => {
      expect(helpers.post_comments_path).toBeTypeOf("function");
      expect(helpers.post_comment_path).toBeTypeOf("function");
    });

    it("post_comments_path(1) returns /posts/1/comments", () => {
      expect(helpers.post_comments_path(1)).toBe("/posts/1/comments");
    });

    it("post_comment_path(1, 2) returns /posts/1/comments/2", () => {
      expect(helpers.post_comment_path(1, 2)).toBe("/posts/1/comments/2");
    });

    it("post_comment_path with hash params", () => {
      expect(helpers.post_comment_path({ post_id: 1, id: 2 })).toBe("/posts/1/comments/2");
    });

    it("post_new_comment_path(1)", () => {
      expect(helpers.post_new_comment_path(1)).toBe("/posts/1/comments/new");
    });

    it("post_edit_comment_path(1, 2)", () => {
      expect(helpers.post_edit_comment_path(1, 2)).toBe("/posts/1/comments/2/edit");
    });
  });

  describe("singular resource", () => {
    beforeEach(() => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.resource("profile");
      });
      helpers = generateRouteHelpers(routeSet);
    });

    it("profile_path() returns /profile", () => {
      expect(helpers.profile_path()).toBe("/profile");
    });

    it("new_profile_path() returns /profile/new", () => {
      expect(helpers.new_profile_path()).toBe("/profile/new");
    });

    it("edit_profile_path() returns /profile/edit", () => {
      expect(helpers.edit_profile_path()).toBe("/profile/edit");
    });
  });

  describe("custom named routes", () => {
    beforeEach(() => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.get("/login", { to: "sessions#new", as: "login" });
        r.get("/logout", { to: "sessions#destroy", as: "logout" });
        r.get("/users/:id/dashboard", { to: "dashboards#show", as: "user_dashboard" });
      });
      helpers = generateRouteHelpers(routeSet);
    });

    it("login_path()", () => {
      expect(helpers.login_path()).toBe("/login");
    });

    it("logout_path()", () => {
      expect(helpers.logout_path()).toBe("/logout");
    });

    it("user_dashboard_path(42)", () => {
      expect(helpers.user_dashboard_path(42)).toBe("/users/42/dashboard");
    });
  });

  describe("namespace routes", () => {
    beforeEach(() => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.namespace("admin", (r2) => {
          r2.resources("users");
        });
      });
      helpers = generateRouteHelpers(routeSet);
    });

    it("admin_users_path()", () => {
      expect(helpers.admin_users_path()).toBe("/admin/users");
    });

    it("admin_user_path(1)", () => {
      expect(helpers.admin_user_path(1)).toBe("/admin/users/1");
    });

    it("admin_new_user_path()", () => {
      expect(helpers.admin_new_user_path()).toBe("/admin/users/new");
    });

    it("admin_edit_user_path(1)", () => {
      expect(helpers.admin_edit_user_path(1)).toBe("/admin/users/1/edit");
    });
  });

  describe("root route", () => {
    it("root_path()", () => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.root("pages#home");
      });
      helpers = generateRouteHelpers(routeSet);
      expect(helpers.root_path()).toBe("/");
    });

    it("root_url()", () => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.root("pages#home");
      });
      helpers = generateRouteHelpers(routeSet, { host: "example.com" });
      expect(helpers.root_url()).toBe("http://example.com/");
    });
  });

  describe("missing params", () => {
    it("throws when required param is missing", () => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.resources("posts");
      });
      helpers = generateRouteHelpers(routeSet);
      expect(() => helpers.post_path()).toThrow(/Missing required parameter/);
    });
  });

  describe("regeneration after draw", () => {
    it("includes routes from subsequent draw calls", () => {
      routeSet = new RouteSet();
      routeSet.draw((r) => {
        r.resources("posts");
      });
      routeSet.draw((r) => {
        r.resources("comments");
      });
      helpers = generateRouteHelpers(routeSet);
      expect(helpers.posts_path()).toBe("/posts");
      expect(helpers.comments_path()).toBe("/comments");
    });
  });
});
