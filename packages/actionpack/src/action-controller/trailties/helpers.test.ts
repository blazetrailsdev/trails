import { afterEach, describe, expect, it } from "vitest";

import { File } from "@blazetrails/ruby-compat";
import { helpersPath, setHelpersPath } from "../metal/helpers.js";
import { Base as ActionControllerBase } from "../base.js";
import { inherited, type HelpersPathControllerClass } from "./helpers.js";

import { FooHelper } from "../../test-helpers/fixtures/alternate-helpers/foo-helper.js";

const alternateHelpers = File.expandPath(
  "../../test-helpers/fixtures/alternate-helpers",
  File.dirname(new URL(import.meta.url).pathname),
);

function base(): HelpersPathControllerClass {
  return ActionControllerBase as unknown as HelpersPathControllerClass;
}

function subclassOf(parent: HelpersPathControllerClass): HelpersPathControllerClass {
  return (() =>
    class extends (parent as unknown as new () => object) {})() as HelpersPathControllerClass;
}

afterEach(() => {
  setHelpersPath([]);
  base().includeAllHelpers = true;
});

describe("ActionController::Railties::Helpers.inherited", async () => {
  it("assigns helpersPath and includes every application helper", async () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    const klass = subclassOf(Base);

    await inherited(klass);

    expect(klass.helpersPath).toEqual(helpersPath());
    expect(klass._helpers!.isInclude(FooHelper)).toBe(true);
  });

  it("includes nothing into a class that is not a direct subclass of Base", async () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    const grandchild = subclassOf(subclassOf(Base));

    await inherited(grandchild);

    expect(grandchild.helpersPath).toEqual(helpersPath());
    expect(grandchild._helpers?.isInclude(FooHelper)).toBeFalsy();
  });

  it("includes nothing when includeAllHelpers is false", async () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    Base.includeAllHelpers = false;
    const klass = subclassOf(Base);

    await inherited(klass);

    expect(klass._helpers?.isInclude(FooHelper)).toBeFalsy();
  });

  it("returns without touching a class that has no helpersPath slot", async () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    const klass = { name: "Bare" } as HelpersPathControllerClass;

    await inherited(klass);

    expect(klass._helpers).toBeUndefined();
  });
});
