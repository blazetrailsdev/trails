import { describe, it, expect } from "vitest";
import {
  _routesInstanceDefault,
  _routesClassDefault,
  UrlForDefaults,
  filterActionMethodsForRoutes,
  type RouteSetLike,
} from "./url-for.js";

describe("AbstractController::UrlFor", () => {
  describe("_routes property defaults", () => {
    it("both instance and class defaults are null (consistent with property contract)", () => {
      expect(_routesInstanceDefault).toBeNull();
      expect(_routesClassDefault).toBeNull();
    });
  });

  describe("filterActionMethodsForRoutes()", () => {
    it("returns the unfiltered list when no route set is wired up", () => {
      expect(filterActionMethodsForRoutes(["show", "index"], null)).toEqual(["show", "index"]);
    });

    it("removes any action name that collides with a route helper name", () => {
      // Trails route-helpers.ts generates `${name}_path` / `${name}_url`
      // in Rails-shape, so the collision surface is snake_case helper
      // names plus the bare action names that an app might also expose
      // as routes (e.g. `show` here).
      const routes: RouteSetLike = {
        namedRoutes: { helperNames: ["posts_url", "post_path", "show"] },
      };
      expect(filterActionMethodsForRoutes(["show", "index", "edit"], routes)).toEqual([
        "index",
        "edit",
      ]);
    });

    it("returns a defensive copy so callers can't mutate the source", () => {
      const original = ["a", "b"];
      const filtered = filterActionMethodsForRoutes(original, null);
      filtered.push("evil");
      expect(original).toEqual(["a", "b"]);
    });

    it("ignores a defaultEnv on the route set when filtering", () => {
      // defaultEnv is part of RouteSetLike (consumed by the renderer),
      // but filterActionMethodsForRoutes shouldn't care about it.
      const routes: RouteSetLike = {
        namedRoutes: { helperNames: ["posts_path", "show"] },
        defaultEnv: { HTTP_HOST: "example.com" },
      };
      expect(filterActionMethodsForRoutes(["show", "index"], routes)).toEqual(["index"]);
    });
  });

  describe("UrlForDefaults", () => {
    it("exposes the instance stub under Rails-shaped name", () => {
      expect(UrlForDefaults._routes).toBe(_routesInstanceDefault);
    });

    it("exposes the class default under _routesStatic", () => {
      expect(UrlForDefaults._routesStatic).toBe(_routesClassDefault);
    });
  });
});
