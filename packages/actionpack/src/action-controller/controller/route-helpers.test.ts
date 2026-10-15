import { describe, expect, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { rbClassInheritedP, rbModAncestors } from "@blazetrails/ruby-compat";
import { ApplicationController, SharedTestRoutes } from "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";

function lt(mod: object, other: object): boolean | null {
  return mod === other ? false : rbClassInheritedP(mod, other);
}

describe("RouteHelperIntegrationTest", () => {
  class FooController extends ApplicationController {}

  it.skip("only includes one module with route helpers", () => {
    // BLOCKED: withRoutesHelpers (abstract-controller/trailties/routes-helpers.ts) answers url helpers through a prototype Proxy instead of RoutesHelpers.with's inherited `include` (abstract_controller/railties/routes_helpers.rb:7-24), so no controller has the module in its ancestry; with-routes-helpers-answers-the-wired-class-itself
    const urlHelpersModule = SharedTestRoutes.namedRoutes.urlHelpersModule;
    const pathHelpersModule = SharedTestRoutes.namedRoutes.pathHelpersModule;

    expect(lt(FooController, urlHelpersModule)).toBe(true);
    expect(lt(ApplicationController, urlHelpersModule)).toBe(true);
    expect(lt(Base, urlHelpersModule)).not.toBe(true);

    expect(lt(FooController, pathHelpersModule)).toBe(true);
    expect(lt(ApplicationController, pathHelpersModule)).toBe(true);
    expect(lt(Base, pathHelpersModule)).not.toBe(true);

    let includedModules = rbModAncestors(FooController).filter((m) => typeof m !== "function");
    includedModules = includedModules.filter(
      (m) => m !== urlHelpersModule && m !== pathHelpersModule,
    );

    const modulesWithRoutes = includedModules.filter(
      (mod) => lt(mod, urlHelpersModule) === true || lt(mod, pathHelpersModule) === true,
    );

    assertEqual(1, modulesWithRoutes.length);
  });
});
