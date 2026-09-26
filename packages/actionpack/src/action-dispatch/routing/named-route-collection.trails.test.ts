import { describe, it, expect } from "vitest";
import { RouteSet, type NamedRouteHelper, type UrlHelperContext } from "./route-set.js";

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
    expect(named.pathHelpersModule.instanceMethods()).toEqual(["postsPath", "postPath"]);
    expect(named.urlHelpersModule.instanceMethods()).toEqual(["postsUrl", "postUrl"]);
    expect(named.helperNames()).toEqual(["postsPath", "postPath", "postsUrl", "postUrl"]);
    expect(named.names()).toEqual(["posts", "post"]);
    expect(named.length()).toBe(2);
    expect(named.isKey("posts")).toBe(true);
    expect(named.isKey("nope")).toBe(false);
    expect(named.isRouteDefined("postsPath")).toBe(true);
    expect(named.isRouteDefined("posts")).toBe(false);
  });

  it("camelizes a multi-word route name into its helper names", () => {
    const routeSet = new RouteSet();
    routeSet.draw((r) => {
      r.get("/admin", { to: "admin#index", as: "admin_root" });
    });
    routeSet.namedRoutes.addUrlHelper("user_profile", {}, () => "/profile");
    const named = routeSet.namedRoutes;
    expect(named.helperNames()).toEqual([
      "adminRootPath",
      "userProfilePath",
      "adminRootUrl",
      "userProfileUrl",
    ]);
    expect(named.isRouteDefined("adminRootUrl")).toBe(true);
    expect(named.isRouteDefined("admin_rootUrl")).toBe(false);
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
    expect(routeSet.namedRoutes.pathHelpersModule.instanceMethods()).toEqual([]);
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
    expect(
      (named.pathHelpersModule.instanceMethod("profilePath")!.value as NamedRouteHelper).call(
        context,
      ),
    ).toBe("/profile");
    expect(
      (named.urlHelpersModule.instanceMethod("profileUrl")!.value as NamedRouteHelper).call(
        context,
      ),
    ).toBe("/profile");
  });

  it("a url helpers module built before a route is added answers its helpers", () => {
    const routeSet = new RouteSet();
    const helpers = routeSet.urlHelpers() as unknown as Record<string, () => string>;

    routeSet.draw((r) => {
      r.get("/posts", { to: "posts#index", as: "posts" });
    });

    expect(routeSet.urlHelpers()).toBe(helpers);
    expect(helpers["postsPath"]()).toBe("/posts");
    expect(helpers["postsUrl"]).toBeTypeOf("function");
  });
});
