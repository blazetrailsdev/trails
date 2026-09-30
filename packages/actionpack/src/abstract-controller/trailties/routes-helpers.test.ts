import { describe, expect, it, vi } from "vitest";

import { include, Module } from "@blazetrails/ruby-compat";

import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { UrlFor } from "../../action-dispatch/routing/url-for.js";
import type { HelperMethodsModule } from "../helpers.js";
import { withRoutesHelpers, type RoutesHelpersControllerClass } from "./routes-helpers.js";

function makeClass(): RoutesHelpersControllerClass {
  return { prototype: {} } as RoutesHelpersControllerClass;
}

describe("withRoutesHelpers", () => {
  it("returns a wiring function that installs routes.urlHelpers as instance methods on the class", () => {
    const RouteHelper: HelperMethodsModule = { postPath: () => "/posts" };
    const wire = withRoutesHelpers({ urlHelpers: vi.fn().mockReturnValue(RouteHelper) });

    const cls = makeClass();
    wire(cls);

    expect((cls.prototype as { postPath?: () => string }).postPath?.()).toBe("/posts");
  });

  it("passes include_path_helpers through to routes.urlHelpers (default true)", () => {
    const spy = vi.fn().mockReturnValue({});
    withRoutesHelpers({ urlHelpers: spy })(makeClass());
    expect(spy).toHaveBeenCalledWith(true);

    const spy2 = vi.fn().mockReturnValue({});
    withRoutesHelpers({ urlHelpers: spy2 }, false)(makeClass());
    expect(spy2).toHaveBeenCalledWith(false);
  });

  it("prefers a class-level trailtieRoutesUrlHelpers over routes.urlHelpers", () => {
    const Namespaced: HelperMethodsModule = { nsPath: () => "/ns" };
    const routesSpy = vi.fn();
    const cls: RoutesHelpersControllerClass = {
      prototype: {},
      trailtieRoutesUrlHelpers: () => Namespaced,
    };
    withRoutesHelpers({ urlHelpers: routesSpy })(cls);

    expect((cls.prototype as { nsPath?: () => string }).nsPath?.()).toBe("/ns");
    expect(routesSpy).not.toHaveBeenCalled();
  });

  it("walks the static-side prototype chain (approximation of Ruby module_parents)", () => {
    const Inherited: HelperMethodsModule = { up: () => "from-parent" };
    const parent = { trailtieRoutesUrlHelpers: () => Inherited };
    const child: RoutesHelpersControllerClass = Object.create(
      parent,
    ) as RoutesHelpersControllerClass;
    child.prototype = {};

    withRoutesHelpers({ urlHelpers: vi.fn() })(child);

    expect((child.prototype as { up?: () => string }).up?.()).toBe("from-parent");
  });

  it("passes include_path_helpers through to the namespaced builder too", () => {
    const nsSpy = vi.fn().mockReturnValue({});
    const cls: RoutesHelpersControllerClass = {
      prototype: {},
      trailtieRoutesUrlHelpers: nsSpy,
    };
    withRoutesHelpers({ urlHelpers: vi.fn() }, false)(cls);
    expect(nsSpy).toHaveBeenCalledWith(false);
  });

  it("copies methods reachable through the module's prototype chain (not just own keys)", () => {
    const base: HelperMethodsModule = { inherited: () => "from-proto" };
    const layered = Object.create(base) as HelperMethodsModule;
    layered.own = () => "own";
    const cls = makeClass();
    withRoutesHelpers({ urlHelpers: () => layered })(cls);
    const proto = cls.prototype as { inherited?: () => string; own?: () => string };
    expect(proto.inherited?.()).toBe("from-proto");
    expect(proto.own?.()).toBe("own");
  });

  it("does not pick up trailtieRoutesUrlHelpers planted on Object.prototype", () => {
    (Object.prototype as { trailtieRoutesUrlHelpers?: unknown }).trailtieRoutesUrlHelpers = () => ({
      sneaky: () => "polluted",
    });
    try {
      const cls = makeClass();
      const RouteHelper: HelperMethodsModule = { clean: () => "clean" };
      withRoutesHelpers({ urlHelpers: () => RouteHelper })(cls);
      const proto = cls.prototype as { clean?: () => string; sneaky?: () => string };
      expect(proto.clean?.()).toBe("clean");
      expect(proto.sneaky).toBeUndefined();
    } finally {
      delete (Object.prototype as { trailtieRoutesUrlHelpers?: unknown }).trailtieRoutesUrlHelpers;
    }
  });

  it("crosses the module's methods and _routes, but not its other members", () => {
    const routeSet = { generate: () => "/posts" };
    const mod = {
      _supportsPath: true,
      _routes: routeSet,
      postsPath: () => "/posts",
    } as unknown as HelperMethodsModule;
    const cls = makeClass();
    withRoutesHelpers({ urlHelpers: () => mod })(cls);
    const proto = cls.prototype as {
      _supportsPath?: unknown;
      _routes?: unknown;
      postsPath?: () => string;
    };
    expect(proto._supportsPath).toBeUndefined();
    expect(proto._routes).toBe(routeSet);
    expect(proto.postsPath?.()).toBe("/posts");
  });

  it("multiple wirings layer on the same prototype without clobbering unrelated entries", () => {
    const A: HelperMethodsModule = { a: () => "a" };
    const B: HelperMethodsModule = { b: () => "b" };
    const cls = makeClass();
    withRoutesHelpers({ urlHelpers: () => A })(cls);
    withRoutesHelpers({ urlHelpers: () => B })(cls);
    const proto = cls.prototype as { a?: () => string; b?: () => string };
    expect(proto.a?.()).toBe("a");
    expect(proto.b?.()).toBe("b");
  });

  it("crosses a Module's own and nested instance methods, deferring modules the class already includes", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("posts", { to: "posts#index", as: "posts" });
    });
    const parent = class {
      urlOptions(): Record<string, unknown> {
        return { host: "example.com" };
      }
    };
    include(parent, UrlFor);
    const cls = class extends parent {};
    withRoutesHelpers(routes, false)(cls as unknown as RoutesHelpersControllerClass);
    const sub = class extends cls {};
    const instance = new sub() as unknown as {
      _generatePathsByDefault(): boolean;
      postsUrl?: unknown;
      postsPath?: unknown;
      urlOptions(): Record<string, unknown>;
    };

    expect(instance._generatePathsByDefault()).toBe(false);
    expect(typeof instance.postsUrl).toBe("function");
    expect(instance.postsPath).toBeUndefined();
    expect(instance.urlOptions()).toEqual({ host: "example.com" });
  });

  it("skips a nested module the class already includes without shadowing a lower one", () => {
    const lower = new Module();
    lower.defineMethod("helper", () => "lower");
    const higher = new Module();
    higher.defineMethod("helper", () => "higher");
    const urlHelpers = new Module();
    urlHelpers.include(lower);
    urlHelpers.include(higher);

    const parent = class {};
    include(parent, higher);
    const cls = class extends parent {};
    withRoutesHelpers({ urlHelpers: () => urlHelpers })(
      cls as unknown as RoutesHelpersControllerClass,
    );

    expect((new cls() as unknown as { helper(): string }).helper()).toBe("lower");
  });

  it("crosses a named route drawn after the first helper read", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("posts", { to: "posts#index", as: "posts" });
    });
    const cls = class {};
    withRoutesHelpers(routes)(cls as unknown as RoutesHelpersControllerClass);
    const instance = new cls() as unknown as { postsPath?: unknown; commentsPath?: unknown };
    expect(typeof instance.postsPath).toBe("function");

    routes.draw(function () {
      this.get("comments", { to: "comments#index", as: "comments" });
    });

    expect(typeof instance.commentsPath).toBe("function");
  });
});
