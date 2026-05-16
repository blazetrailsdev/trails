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
