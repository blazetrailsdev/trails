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
      // Subdomain is a request constraint that would only be evaluated
      // against a real request. Route#match takes (method, path) only,
      // so it should still match by path despite the request constraint.
      const route = new Route("GET", "/posts", "posts", "index", {
        constraints: { subdomain: "api" },
      });
      expect(route.match("GET", "/posts")).not.toBeNull();
    });

    it("returns null without throwing when the path is unparseable", () => {
      // Mirrors the Journey-parser swallow in collectParamNamesFromJourneyAst:
      // a malformed path shouldn't crash the route table at match time.
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
      // Static route should outscore the glob route.
      expect(r1.score()).toBeGreaterThan(r2.score());
    });

    it("scores symbols inside optional groups as 0", () => {
      const r1 = new Route("GET", "/posts/:id", "posts", "show"); // top-level :id
      const r2 = new Route("GET", "/posts(/:id)", "posts", "show"); // optional :id
      expect(r1.score()).toBeGreaterThan(r2.score());
    });

    it("knowledge boost applies only to top-level dynamics", () => {
      const r = new Route("GET", "/posts/:id", "posts", "show");
      expect(r.score({ id: true })).toBeGreaterThan(r.score());
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
      // The Journey scanner treats trailing/bare `*` as a literal — it
      // doesn't capture an empty-named splat. So `/page*` has no path
      // params and pathFor() round-trips the literal star.
      const route = new Route("GET", "/page*", "x", "y");
      expect(route.pathParamNames).toEqual([]);
      expect(route.pathFor()).toBe("/page*");
    });

    it("collapses structural // when slash-bearing capture is in an omitted optional", () => {
      // controller carries '/' but its group is omitted because :action is
      // missing. The slash-bearing value never lands in the output, so
      // the structural `//` left by that omitted group must still collapse.
      const route = new Route("GET", "(/:controller/:action)(/:id)", "x", "y");
      expect(route.pathFor({ controller: "admin/posts", id: "1" })).toBe("/1");
    });

    it("collapses slashes when slash-bearing-capture optional is omitted", () => {
      // The route declares a `:controller` (which preserves `/` in its
      // value via Format.requiredPath) but the user doesn't supply it.
      // The supplied-value check should detect that no used value
      // contains `/`, so the collapse runs and removes the leading `//`
      // from the omitted optional.
      const route = new Route("GET", "(/:controller)(/:action)", "x", "y");
      expect(route.pathFor({ action: "show" })).toBe("/show");
    });

    it("ignores unused params when deciding whether to collapse slashes", () => {
      // `extra` isn't declared in the route, so a `/` in its value must
      // not block the collapse of the structural double-slash.
      const route = new Route("GET", "(/:a)(/:b)", "x", "y");
      expect(route.pathFor({ b: "x", extra: "/" } as Record<string, string>)).toBe("/x");
    });

    it("treats empty string as supplied (matches Journey Formatter semantics)", () => {
      // Journey Formatter follows Ruby truthiness — `""` is supplied.
      // `/posts/:id` with `{ id: "" }` formats as `/posts/` (the empty
      // segment is preserved by the structural separator that follows).
      const route = new Route("GET", "/posts/:id", "posts", "show");
      expect(route.pathFor({ id: "" })).toBe("/posts/");
    });

    it("rejects path-capture values that violate the route's requirement regex (anchored)", () => {
      const route = new Route("GET", "/posts/:id", "posts", "show", {
        constraints: { id: /\d+/ },
      });
      // `42abc` would pass an unanchored `/\d+/` but fails the anchored
      // `^(?:\d+)$` Journey wraps requirements in.
      expect(() => route.pathFor({ id: "42abc" })).toThrow(/Missing required parameter :id/);
      expect(() => route.pathFor({ id: "abc" })).toThrow(/Missing required parameter :id/);
      expect(route.pathFor({ id: "42" })).toBe("/posts/42");
    });

    it("ignores request-attribute constraints (only path captures are validated)", () => {
      // `subdomain` is a request constraint, not a path capture. pathFor
      // shouldn't validate against it even when the caller supplies an
      // unrelated value with a non-matching key.
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
      // Plain-object hash inside pathFor() would route an own `__proto__`
      // assignment to the inherited setter, silently dropping it. Using a
      // null-prototype hash makes it an own property. The input needs an
      // explicit own __proto__ since the literal { __proto__: ... } sets
      // the prototype rather than an own property.
      const route = new Route("GET", "/:__proto__", "x", "y");
      const params: Record<string, string> = Object.create(null);
      params["__proto__"] = "evil";
      expect(route.pathFor(params)).toBe("/evil");
    });

    it("throws missing-required when a name is required at the top level even if it also appears optionally", () => {
      // `/:id(.:id)` has `:id` both required (top-level) and inside an
      // optional group. Pattern.requiredNames would drop it; the
      // top-level-symbol walk keeps it.
      const route = new Route("GET", "/:id(.:id)", "x", "y");
      expect(() => route.pathFor({})).toThrow(/Missing required parameter :id/);
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
      // Rails' normalize_path collapses '/(' to '(/' so both forms classify
      // identically.
      const route = new Route("GET", "/(/:locale)/posts", "posts", "index");
      expect(route.match("GET", "/posts")).not.toBeNull();
      expect(route.match("GET", "/en/posts")).not.toBeNull();
    });

    it("keeps leading /( for all-optional paths (root-style routes)", () => {
      // Rails restores '/(' when the path is composed entirely of optional
      // segments, so the root '/' case still matches.
      const route = new Route("GET", "(/:locale)(/:platform)", "x", "y");
      expect(route.match("GET", "/")).not.toBeNull();
      expect(route.match("GET", "/en")).not.toBeNull();
    });

    it("handles all-optional paths with non-`/:` groups (e.g. dot-prefix format)", () => {
      // `(/:locale)(.:format)` is all-optional but the second group starts
      // with `.` rather than `/:`. The balanced-paren scan should still
      // classify this as all-optional and restore the leading `/(`.
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
      // `\:foo` is a literal escaped colon — Journey's LITERAL_RUN absorbs `\:`.
      const escapedColon = new Route("GET", "/page\\:foo", "x", "y");
      expect(escapedColon.pathParamNames).toEqual([]);

      // `\*rest` is NOT an escaped sequence in Journey's scanner — the
      // backslash is literal, the STAR captures `rest`.
      const escapedStar = new Route("GET", "/page\\*rest", "x", "y");
      expect(escapedStar.pathParamNames).toEqual(["rest"]);

      // A bare `*` with no name is literal in Journey.
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
