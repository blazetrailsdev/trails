import { describe, expect, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { rbClassInheritedP, rbModAncestors } from "@blazetrails/ruby-compat";
import { ApplicationController, SharedTestRoutes } from "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";

describe("RouteHelperIntegrationTest", () => {
  class FooController extends ApplicationController {}

  // BLOCKED: with-routes-helpers-answers-the-wired-class-itself
  it.skip("only includes one module with route helpers", () => {
    const urlHelpersModule = SharedTestRoutes.namedRoutes.urlHelpersModule;
    const pathHelpersModule = SharedTestRoutes.namedRoutes.pathHelpersModule;

    expect(rbClassInheritedP(FooController, urlHelpersModule)).toBe(true);
    expect(rbClassInheritedP(ApplicationController, urlHelpersModule)).toBe(true);
    expect(rbClassInheritedP(Base, urlHelpersModule)).not.toBe(true);

    expect(rbClassInheritedP(FooController, pathHelpersModule)).toBe(true);
    expect(rbClassInheritedP(ApplicationController, pathHelpersModule)).toBe(true);
    expect(rbClassInheritedP(Base, pathHelpersModule)).not.toBe(true);

    let includedModules = rbModAncestors(FooController).filter((m) => typeof m !== "function");
    includedModules = includedModules.filter(
      (m) => m !== urlHelpersModule && m !== pathHelpersModule,
    );

    const modulesWithRoutes = includedModules.filter(
      (mod) =>
        rbClassInheritedP(mod, urlHelpersModule) === true ||
        rbClassInheritedP(mod, pathHelpersModule) === true,
    );

    assertEqual(1, modulesWithRoutes.length);
  });
});
