// Cover for `NamedRouteCollection` (`action_dispatch/routing/route_set.rb:60-348`)
// and the two helper modules `generate_url_helpers` includes (`:594-609`).
// Trails-only — Rails proves these through `actionpack/test/controller/routing_test.rb`,
// which is not enrolled here yet.
import { describe, it, expect } from "vitest";
import { RouteSet, type UrlHelperContext } from "./route-set.js";

function drawn(): RouteSet {
  const routeSet = new RouteSet();
  routeSet.draw((r) => {
    r.get("/posts", { to: "posts#index", as: "posts" });
    r.get("/posts/:id", { to: "posts#show", as: "post" });
  });
  return routeSet;
}

describe("NamedRouteCollection", () => {
  it("defines a name_path and a name_url helper per named route", () => {
    const named = drawn().namedRoutes;
    expect(Object.keys(named.pathHelpersModule)).toEqual(["postsPath", "postPath"]);
    expect(Object.keys(named.urlHelpersModule)).toEqual(["postsUrl", "postUrl"]);
    expect(named.helperNames()).toEqual(["postsPath", "postPath", "postsUrl", "postUrl"]);
    expect(named.names()).toEqual(["posts", "post"]);
    expect(named.length()).toBe(2);
    expect(named.keyQ("posts")).toBe(true);
    expect(named.keyQ("nope")).toBe(false);
    expect(named.routeDefinedQ("posts")).toBe(true);
  });

  it("generates a path from a positional argument", () => {
    const routeSet = drawn();
    const helpers = routeSet.urlHelpers() as unknown as Record<string, () => string>;
    expect(helpers["postsPath"]()).toBe("/posts");
    expect((helpers["postPath"] as unknown as (id: number) => string)(7)).toBe("/posts/7");
  });

  it("clear! removes the generated helpers", () => {
    const routeSet = drawn();
    routeSet.namedRoutes.clearBang();
    expect(Object.keys(routeSet.namedRoutes.pathHelpersModule)).toEqual([]);
    expect(routeSet.namedRoutes.helperNames()).toEqual([]);
  });

  it("add_url_helper defines both halves in the helper modules", () => {
    const routeSet = drawn();
    routeSet.namedRoutes.addUrlHelper("profile", {}, function () {
      return "/profile";
    });

    const named = routeSet.namedRoutes;
    expect(named.helperNames()).toContain("profilePath");
    expect(named.helperNames()).toContain("profileUrl");

    const context = { _routes: routeSet } as unknown as UrlHelperContext;
    expect(named.pathHelpersModule["profilePath"].call(context)).toBe("/profile");
    expect(named.urlHelpersModule["profileUrl"].call(context)).toBe("/profile");
  });
});
