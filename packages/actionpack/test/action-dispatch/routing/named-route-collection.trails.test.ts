import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import {
  NamedRouteCollection,
  RouteSet,
  type UrlHelperContext,
} from "../../../lib/action-dispatch/routing/route-set.js";

function drawn(): RouteSet {
  const routeSet = new RouteSet();
  routeSet.draw(function () {
    this.get("/posts", { to: "posts#index", as: "posts" });
    this.get("/posts/:id", { to: "posts#show", as: "post" });
  });
  return routeSet;
}

describe("NamedRouteCollection", () => {
  it("defines a name_path and a name_url helper per named route", () => {
    const named = drawn().namedRoutes;
    expect(
      Object.getOwnPropertyNames(named.pathHelpersModule.prototype).filter(
        (n) => n !== "constructor",
      ),
    ).toEqual(["postsPath", "postPath"]);
    expect(
      Object.getOwnPropertyNames(named.urlHelpersModule.prototype).filter(
        (n) => n !== "constructor",
      ),
    ).toEqual(["postsUrl", "postUrl"]);
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
    routeSet.draw(function () {
      this.get("/admin", { to: "admin#index", as: "admin_root" });
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
    expect(
      Object.getOwnPropertyNames(routeSet.namedRoutes.pathHelpersModule.prototype).filter(
        (n) => n !== "constructor",
      ),
    ).toEqual([]);
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

    const context = {
      _routes: routeSet,
      fullUrlFor: (options: string) => routeSet.fullUrlFor(options),
    } as unknown as UrlHelperContext;
    expect(named.pathHelpersModule.prototype["profilePath"].call(context)).toBe("/profile");
    expect(named.urlHelpersModule.prototype["profileUrl"].call(context)).toBe("/profile");
  });

  it("a url helpers module built before a route is added answers its helpers", () => {
    const routeSet = new RouteSet();
    const helpers = routeSet.urlHelpers() as unknown as Record<string, () => string>;

    routeSet.draw(function () {
      this.get("/posts", { to: "posts#index", as: "posts" });
    });

    expect(routeSet.urlHelpers()).toBe(helpers);
    expect(helpers["postsPath"]()).toBe("/posts");
    expect(helpers["postsUrl"]).toBeTypeOf("function");
  });

  it("an includer keeps a helper it defined itself when the route is added later", () => {
    const routeSet = new RouteSet();
    class Host {
      fooPath(): string {
        return "mine";
      }
    }
    include(Host, routeSet.urlHelpers());
    routeSet.draw(function () {
      this.get("/foo", { to: "foo#index", as: "foo" });
    });
    expect(new Host().fooPath()).toBe("mine");
  });

  it("a url helpers module without paths answers no path helper drawn later", () => {
    const routeSet = new RouteSet();
    const helpers = routeSet.urlHelpers(false) as unknown as Record<string, unknown>;
    class Host {}
    include(Host, helpers);
    routeSet.draw(function () {
      this.get("/foo", { to: "foo#index", as: "foo" });
    });
    expect(helpers["fooUrl"]).toBeTypeOf("function");
    expect(helpers["fooPath"]).toBeUndefined();
    expect((Host.prototype as Record<string, unknown>)["fooUrl"]).toBeTypeOf("function");
    expect((Host.prototype as Record<string, unknown>)["fooPath"]).toBeUndefined();
  });

  it("the copy included for another route set shares the original's proxy", () => {
    const routeSet = new RouteSet();
    const helpers = routeSet.urlHelpers();
    class Parent {}
    include(Parent, helpers);
    class Child extends Parent {}
    const other = new RouteSet();
    Object.defineProperty(Child, "_routes", { get: () => other, configurable: true });
    include(Child, helpers);
    expect(helpers.dupForReinclude).toBeDefined();
    expect(helpers.dupForReinclude!._proxy).toBe(helpers._proxy);
  });

  it("each yields every name with its route and returns the collection", () => {
    const named = drawn().namedRoutes;
    const seen: [string, string][] = [];
    expect(named.each((name, route) => seen.push([name, route.path.spec.toString()]))).toBe(named);
    expect(seen).toEqual([
      ["posts", "/posts(.:format)"],
      ["post", "/posts/:id(.:format)"],
    ]);
  });

  it("nests OptimizedUrlHelper in UrlHelper in NamedRouteCollection", () => {
    const { UrlHelper } = NamedRouteCollection;
    const route = drawn().namedRoutes.get("post")!;
    const helper = UrlHelper.create(route, route.defaults, "post");
    expect(helper).toBeInstanceOf(UrlHelper.OptimizedUrlHelper);
    expect(helper).toBeInstanceOf(UrlHelper);
    expect(helper.routeName).toBe("post");
  });
});
