import { afterEach, describe, expect, it } from "vitest";

import type { HelperMethodsModule } from "../../abstract-controller/helpers.js";
import { Base } from "../base.js";
import { modulesForHelpers, setApplicationHelpers, setHelpersPath } from "./helpers.js";

const AbcHelper: HelperMethodsModule = { bareA: () => "a" };
const FooHelper: HelperMethodsModule = { foo: () => "FOO" };

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

    expect(modulesForHelpers([":all"])).toEqual([AbcHelper]);
  });

  it("reaches the ActionController override through Base.helper", () => {
    setApplicationHelpers(["abc"], constants);
    class AllHelpersController extends Base {}

    AllHelpersController.helper(":all");

    expect(AllHelpersController._helpers!.bareA.call({})).toBe("a");
  });

  it("appends the application helpers after the arguments that stay", () => {
    setApplicationHelpers(["abc"], constants);

    expect(modulesForHelpers(["foo", ":all"])).toEqual([FooHelper, AbcHelper]);
  });

  it("resolves a helper by name when :all is absent", () => {
    setApplicationHelpers(["abc"], constants);

    expect(modulesForHelpers(["foo"])).toEqual([FooHelper]);
  });
});
