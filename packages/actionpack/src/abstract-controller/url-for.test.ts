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
      const routes: RouteSetLike = {
        namedRoutes: { helperNames: ["postsUrl", "postPath", "show"] },
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
