import { afterEach, describe, expect, it } from "vitest";

import { extend, File, include } from "@blazetrails/ruby-compat";
import { ClassMethods, helpersPath, setHelpersPath } from "../metal/helpers.js";
import { inherited, type HelpersPathControllerClass } from "./helpers.js";
import { Helpers } from "../../abstract-controller/helpers.js";

import { FooHelper } from "../../test-helpers/fixtures/alternate-helpers/foo-helper.js";

const alternateHelpers = File.expandPath(
  "../../test-helpers/fixtures/alternate-helpers",
  File.dirname(new URL(import.meta.url).pathname),
);

function base(): HelpersPathControllerClass {
  const Base = class Base {};
  include(Base, Helpers);
  extend(Base, ClassMethods);
  return Object.assign(Base, { helpersPath: [], includeAllHelpers: true });
}

function subclassOf(parent: HelpersPathControllerClass): HelpersPathControllerClass {
  return (() =>
    class extends (parent as unknown as new () => object) {})() as HelpersPathControllerClass;
}

afterEach(() => {
  setHelpersPath([]);
});

describe("ActionController::Railties::Helpers.inherited", () => {
  it("assigns helpersPath and includes every application helper", () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    const klass = subclassOf(Base);

    inherited(klass, Base);

    expect(klass.helpersPath).toEqual(helpersPath());
    expect(klass._helpers!.isInclude(FooHelper)).toBe(true);
  });

  it("includes nothing into a class that is not a direct subclass of Base", () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    const grandchild = subclassOf(subclassOf(Base));

    inherited(grandchild, Base);

    expect(grandchild.helpersPath).toEqual(helpersPath());
    expect(grandchild._helpers?.isInclude(FooHelper)).toBeFalsy();
  });

  it("includes nothing when includeAllHelpers is false", () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    Base.includeAllHelpers = false;
    const klass = subclassOf(Base);

    inherited(klass, Base);

    expect(klass._helpers?.isInclude(FooHelper)).toBeFalsy();
  });

  it("returns without touching a class that has no helpersPath slot", () => {
    setHelpersPath([alternateHelpers]);
    const Base = base();
    const klass = { name: "Bare" } as HelpersPathControllerClass;

    inherited(klass, Base);

    expect(klass._helpers).toBeUndefined();
  });
});
