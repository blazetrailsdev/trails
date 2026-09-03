import { describe, it, expect } from "vitest";
import { Route } from "./route.js";

describe("Route", () => {
  describe("pathConstraints / requestConstraints", () => {
    it("splits constraints by whether the key is a path capture", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show", {
        constraints: {
          id: /\d+/,
          subdomain: /^api$/,
          format: "json",
        },
      });
      expect(route.pathConstraints).toEqual({ id: /\d+/ });
      expect(route.requestConstraints).toEqual({
        subdomain: /^api$/,
        format: "json",
      });
    });

    it("treats glob (*name) segments as path captures", () => {
      const route = new Route("GET", "/assets/*path", "assets", "show", {
        constraints: { path: /.+/, format: "json" },
      });
      expect(route.pathConstraints).toEqual({ path: /.+/ });
      expect(route.requestConstraints).toEqual({ format: "json" });
    });

    it("returns empty maps when no constraints are declared", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show");
      expect(route.pathConstraints).toEqual({});
      expect(route.requestConstraints).toEqual({});
    });
  });

  describe("match() — path-only matcher", () => {
    it("ignores request constraints since match() takes no request attributes", () => {
      const route = new Route("GET", "/posts", "posts", "index", {
        constraints: { subdomain: "api" },
      });
      expect(route.match("GET", "/posts")).not.toBeNull();
    });

    it("returns null without throwing when the path is unparseable", () => {
      const route = new Route("GET", "/posts/(unclosed", "posts", "show");
      expect(() => route.match("GET", "/posts/anything")).not.toThrow();
      expect(route.match("GET", "/posts/anything")).toBeNull();
    });

    it("still enforces path-capture constraints", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show", {
        constraints: { id: /\d+/ },
      });
      expect(route.match("GET", "/posts/42")).not.toBeNull();
      expect(route.match("GET", "/posts/abc")).toBeNull();
    });
  });

  describe("score() — AST-based scoring", () => {
    it("static segments outscore dynamic captures", () => {
      const r1 = new Route("GET", "/posts/:id", "posts", "show");
      const r2 = new Route("GET", "/posts/featured", "posts", "featured");
      expect(r2.score()).toBeGreaterThan(r1.score());
    });

    it("scores top-level glob captures as 0 (nested by definition)", () => {
      const r1 = new Route("GET", "/files/static", "files", "show");
      const r2 = new Route("GET", "/files/*path", "files", "show");
      expect(r1.score()).toBeGreaterThan(r2.score());
    });

    it("scores symbols inside optional groups as 0", () => {
      const r1 = new Route("GET", "/posts/:id", "posts", "show");
      const r2 = new Route("GET", "/posts(/:id)", "posts", "show");
      expect(r1.score()).toBeGreaterThan(r2.score());
    });

    it("knowledge boost applies only to top-level dynamics", () => {
      const r = new Route("GET", "/posts/:id", "posts", "show");
      expect(r.score({ id: true })).toBeGreaterThan(r.score());
    });

    it("does not read inherited keys (Object.prototype) from the knowledge map", () => {
      const r = new Route("GET", "/:toString", "x", "y");
      expect(r.score({})).toBeLessThan(r.score({ toString: true }));
    });
  });

  describe("pathFor() — edge cases", () => {
    it("throws missing-required for top-level *splat captures", () => {
      const route = new Route("GET", "/files/*path", "files", "show");
      expect(() => route.pathFor({})).toThrow(/Missing required parameter :path/);
    });

    it("preserves literal '/' in *splat values (no slash-collapse corruption)", () => {
      const route = new Route("GET", "/files/*path", "files", "show");
      expect(route.pathFor({ path: "a/b/c" })).toBe("/files/a/b/c");
    });

    it("treats bare '*' as a literal (no implicit empty-name splat)", () => {
      const route = new Route("GET", "/page*", "x", "y");
      expect(route.pathParamNames).toEqual([]);
      expect(route.pathFor()).toBe("/page*");
    });

    it("collapses structural // when slash-bearing capture is in an omitted optional", () => {
      const route = new Route("GET", "(/:controller/:action)(/:id)", "x", "y");
      expect(route.pathFor({ controller: "admin/posts", id: "1" })).toBe("/1");
    });

    it("collapses slashes when slash-bearing-capture optional is omitted", () => {
      const route = new Route("GET", "(/:controller)(/:action)", "x", "y");
      expect(route.pathFor({ action: "show" })).toBe("/show");
    });

    it("ignores unused params when deciding whether to collapse slashes", () => {
      const route = new Route("GET", "(/:a)(/:b)", "x", "y");
      expect(route.pathFor({ b: "x", extra: "/" } as Record<string, string>)).toBe("/x");
    });

    it("treats empty string as supplied (matches Journey Formatter semantics)", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show");
      expect(route.pathFor({ id: "" })).toBe("/posts/");
    });

    it("rejects path-capture values that violate the route's requirement regex (anchored)", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show", {
        constraints: { id: /\d+/ },
      });
      expect(() => route.pathFor({ id: "42abc" })).toThrow(/Missing required parameter :id/);
      expect(() => route.pathFor({ id: "abc" })).toThrow(/Missing required parameter :id/);
      expect(route.pathFor({ id: "42" })).toBe("/posts/42");
    });

    it("ignores request-attribute constraints (only path captures are validated)", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show", {
        constraints: { id: /\d+/, subdomain: /^api$/ },
      });
      expect(route.pathFor({ id: "42", subdomain: "www" } as Record<string, string>)).toBe(
        "/posts/42",
      );
    });

    it("honors string path constraints (Rails-shape anchored RegExp)", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show", {
        constraints: { id: "\\d+" },
      });
      expect(() => route.pathFor({ id: "42abc" })).toThrow(/Missing required parameter :id/);
      expect(() => route.pathFor({ id: "abc" })).toThrow(/Missing required parameter :id/);
      expect(route.pathFor({ id: "42" })).toBe("/posts/42");
    });

    it("does not lose a route param named __proto__", () => {
      const route = new Route("GET", "/:__proto__", "x", "y");
      const params: Record<string, string> = Object.create(null);
      params["__proto__"] = "evil";
      expect(route.pathFor(params)).toBe("/evil");
    });

    it("throws missing-required when a name is required at the top level even if it also appears optionally", () => {
      const route = new Route("GET", "/:id(.:id)", "x", "y");
      expect(() => route.pathFor({})).toThrow(/Missing required parameter :id/);
    });

    it("strips stateful flags (g/y/m) from anchored requirement regexes", () => {
      const route = new Route("GET", "/posts/:id", "x", "y", {
        constraints: { id: /\d+/gm },
      });
      expect(route.pathFor({ id: "42" })).toBe("/posts/42");
      expect(route.pathFor({ id: "42" })).toBe("/posts/42");
      expect(() => route.pathFor({ id: "bad" })).toThrow(/Missing required parameter :id/);
      expect(() => route.pathFor({ id: "bad" })).toThrow(/Missing required parameter :id/);
      expect(() => route.pathFor({ id: "42\nabc" })).toThrow(/Missing required parameter :id/);
    });

    it("skips requirement validation for captures in omitted optional groups", () => {
      const route = new Route("GET", "/posts(/:id/:slug)", "x", "y", {
        constraints: { id: /\d+/ },
      });
      expect(route.pathFor({ id: "bad" } as Record<string, string>)).toBe("/posts");
      expect(() => route.pathFor({ id: "bad", slug: "x" })).toThrow(
        /Missing required parameter :id/,
      );
      expect(route.pathFor({ id: "42", slug: "x" })).toBe("/posts/42/x");
    });

    it("collapses double slashes from partially-supplied adjacent optional groups", () => {
      const route = new Route("GET", "(/:a)(/:b)", "x", "y");
      expect(route.pathFor({ b: "x" })).toBe("/x");
      expect(route.pathFor({ a: "y" })).toBe("/y");
      expect(route.pathFor({ a: "y", b: "x" })).toBe("/y/x");
      expect(route.pathFor({})).toBe("/");
    });
  });

  describe("path normalization — leading optional groups", () => {
    it("normalizes (/:locale)/posts so /posts and /en/posts both match", () => {
      const route = new Route("GET", "(/:locale)/posts", "posts", "index");
      expect(route.match("GET", "/posts")).not.toBeNull();
      const m = route.match("GET", "/en/posts");
      expect(m).not.toBeNull();
      expect(m!.params["locale"]).toBe("en");
    });

    it("normalizes when caller passes the leading '/' explicitly", () => {
      const route = new Route("GET", "/(/:locale)/posts", "posts", "index");
      expect(route.match("GET", "/posts")).not.toBeNull();
      expect(route.match("GET", "/en/posts")).not.toBeNull();
    });

    it("keeps leading /( for all-optional paths (root-style routes)", () => {
      const route = new Route("GET", "(/:locale)(/:platform)", "x", "y");
      expect(route.match("GET", "/")).not.toBeNull();
      expect(route.match("GET", "/en")).not.toBeNull();
    });

    it("handles all-optional paths with non-`/:` groups (e.g. dot-prefix format)", () => {
      const route = new Route("GET", "(/:locale)(.:format)", "x", "y");
      expect(route.match("GET", "/")).not.toBeNull();
      expect(route.match("GET", "/en")).not.toBeNull();
      const m = route.match("GET", "/en.json");
      expect(m).not.toBeNull();
      expect(m!.params["locale"]).toBe("en");
      expect(m!.params["format"]).toBe("json");
    });
  });

  describe("pathParamNames", () => {
    it("lists dynamic and glob captures in declaration order", () => {
      const route = new Route("GET", "/a/:id/b/*rest", "x", "y");
      expect(route.pathParamNames).toEqual(["id", "rest"]);
    });

    it("includes captures inside optional groups in declaration order", () => {
      const route = new Route("GET", "/posts(/:id)(.:format)", "posts", "show");
      expect(route.pathParamNames).toEqual(["id", "format"]);
    });

    it("includes captures inside nested optional groups", () => {
      const route = new Route("GET", "/:c(/:a(/:id(.:format)))", "x", "y");
      expect(route.pathParamNames).toEqual(["c", "a", "id", "format"]);
    });

    it("includes embedded captures inside static text", () => {
      const route = new Route("GET", "/:controller.:format", "x", "y");
      expect(route.pathParamNames).toEqual(["controller", "format"]);
    });

    it("classifies sigils the way Journey's scanner does", () => {
      const escapedColon = new Route("GET", "/page\\:foo", "x", "y");
      expect(escapedColon.pathParamNames).toEqual([]);

      const escapedStar = new Route("GET", "/page\\*rest", "x", "y");
      expect(escapedStar.pathParamNames).toEqual(["rest"]);

      const bareStar = new Route("GET", "/page*", "x", "y");
      expect(bareStar.pathParamNames).toEqual([]);
    });

    it("preserves duplicate capture names (in lockstep with Pattern.names)", () => {
      const route = new Route("GET", "/:id/:id", "x", "y");
      expect(route.pathParamNames).toEqual(["id", "id"]);
    });

    it("returns a defensive copy that cannot mutate route internals", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show");
      const names = route.pathParamNames as string[];
      names.push("evil");
      expect(route.pathParamNames).toEqual(["id"]);
    });

    it("treats optional-group captures as path constraints", () => {
      const route = new Route("GET", "/posts(/:id)", "posts", "show", {
        constraints: { id: /\d+/ },
      });
      expect(route.pathConstraints).toEqual({ id: /\d+/ });
      expect(route.requestConstraints).toEqual({});
    });
  });
});
