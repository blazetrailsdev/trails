import { describe, it, expect } from "vitest";
import {
  _routesInstanceDefault,
  _routesClassDefault,
  filterActionMethodsForRoutes,
  type RouteSetLike,
} from "./url-for.js";

describe("AbstractController::UrlFor", () => {
  describe("_routesInstanceDefault()", () => {
    it("raises with the Rails-shaped hint until the host overrides it", () => {
      expect(() => _routesInstanceDefault.call({})).toThrow(/include routing helpers explicitly/);
      expect(() => _routesInstanceDefault.call({})).toThrow(/#url_for/);
      expect(() => _routesInstanceDefault.call({})).toThrow(/url_helpers/);
    });
  });

  describe("_routesClassDefault()", () => {
    it("returns null by default", () => {
      expect(_routesClassDefault()).toBeNull();
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
  });
});
