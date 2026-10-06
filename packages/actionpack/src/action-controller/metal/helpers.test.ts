import { Module } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";

import type { HelperMethodsModule } from "../../abstract-controller/helpers.js";
import { Base } from "../base.js";
import { setApplicationHelpers, setHelpersPath } from "./helpers.js";

const AbcHelper = new Module().include({ bareA: () => "a" });
const FooHelper = new Module().include({ foo: () => "FOO" });

const constants = new Map<string, HelperMethodsModule>([
  ["AbcHelper", AbcHelper],
  ["FooHelper", FooHelper],
]);

afterEach(() => {
  setHelpersPath([]);
  setApplicationHelpers([], new Map());
});

describe("ActionController::Helpers.modulesForHelpers", () => {
  it("expands :all to every application helper", () => {
    setApplicationHelpers(["abc"], constants);

    expect(Base.modulesForHelpers([":all"])).toEqual([AbcHelper]);
  });

  it("reaches the ActionController override through Base.helper", () => {
    setApplicationHelpers(["abc"], constants);
    class AllHelpersController extends Base {}

    AllHelpersController.helper(":all");

    expect(AllHelpersController._helpers.isInclude(AbcHelper)).toBe(true);
  });

  it("appends the application helpers after the arguments that stay", () => {
    setApplicationHelpers(["abc"], constants);

    expect(Base.modulesForHelpers(["foo", ":all"])).toEqual([FooHelper, AbcHelper]);
  });

  it("resolves a helper by name when :all is absent", () => {
    setApplicationHelpers(["abc"], constants);

    expect(Base.modulesForHelpers(["foo"])).toEqual([FooHelper]);
  });
});

describe("ActionController::Helpers.helpers", () => {
  it("memoizes the class-level proxy per class", () => {
    class ParentController extends Base {}
    class ChildController extends ParentController {}

    const proxy = ParentController.helpers();
    expect(ParentController.helpers()).toBe(proxy);
    expect(ChildController.helpers()).not.toBe(proxy);
    expect(ChildController.helpers()).toBe(ChildController.helpers());
  });

  it("memoizes the instance-level proxy per instance and dispatches through the prototype", () => {
    class OverridingController extends Base {
      override helpers(): ReturnType<Base["helpers"]> {
        return super.helpers();
      }
    }
    const controller = new OverridingController();

    expect(Object.hasOwn(controller, "helpers")).toBe(false);
    expect(controller.helpers()).toBe(controller.helpers());
    expect(new OverridingController().helpers()).not.toBe(controller.helpers());
  });
});
