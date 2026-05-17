import { describe, expect, it, vi } from "vitest";

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
});
