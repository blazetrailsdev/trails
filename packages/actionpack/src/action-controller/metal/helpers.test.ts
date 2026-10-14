import { File } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { FooHelper } from "../../test-helpers/fixtures/alternate-helpers/foo-helper.js";
import { AbcHelper } from "../../test-helpers/fixtures/helpers/abc-helper.js";
import { Base } from "../base.js";

const fixtures = File.expandPath(
  "../../test-helpers/fixtures",
  File.dirname(new URL(import.meta.url).pathname),
);

class AlternateHelpersController extends Base {
  static {
    this.helpersPath = [File.expandPath("alternate-helpers", fixtures)];
  }
}

describe("ActionController::Helpers.modulesForHelpers", () => {
  it("expands :all to every helper under the class's helpersPath", () => {
    expect(AlternateHelpersController.modulesForHelpers([":all"])).toEqual([FooHelper]);
    expect(Base.modulesForHelpers([":all"])).toEqual([]);
  });

  it("reaches the ActionController override through Base.helper", () => {
    class AllHelpersController extends AlternateHelpersController {}

    AllHelpersController.helper(":all");

    expect(AllHelpersController._helpers.isInclude(FooHelper)).toBe(true);
  });

  it("appends the application helpers after the arguments that stay", () => {
    expect(AlternateHelpersController.modulesForHelpers(["abc", ":all"])).toEqual([
      AbcHelper,
      FooHelper,
    ]);
  });

  it("resolves a helper by name when :all is absent", () => {
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
