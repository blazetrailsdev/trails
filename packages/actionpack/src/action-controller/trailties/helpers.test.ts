import { afterEach, describe, expect, it } from "vitest";

import { extend, include, Module } from "@blazetrails/ruby-compat";
import {
  ClassMethods,
  helpersPath,
  setApplicationHelpers,
  setHelpersPath,
} from "../metal/helpers.js";
import { inherited, type HelpersPathControllerClass } from "./helpers.js";
import { Helpers } from "../../abstract-controller/helpers.js";

const AbcHelper = new Module().include({ bareA: () => "a" });

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
  setApplicationHelpers([], new Map());
});

describe("ActionController::Railties::Helpers.inherited", () => {
  it("assigns helpersPath and includes every application helper", () => {
    setHelpersPath(["/app/helpers"]);
    setApplicationHelpers(["abc"], new Map([["AbcHelper", AbcHelper]]));
    const Base = base();
    const klass = subclassOf(Base);

    inherited(klass, Base);

    expect(klass.helpersPath).toEqual(helpersPath());
    expect(klass._helpers!.isInclude(AbcHelper)).toBe(true);
  });

  it("includes nothing into a class that is not a direct subclass of Base", () => {
    setHelpersPath(["/app/helpers"]);
    setApplicationHelpers(["abc"], new Map([["AbcHelper", AbcHelper]]));
    const Base = base();
    const grandchild = subclassOf(subclassOf(Base));

    inherited(grandchild, Base);

    expect(grandchild.helpersPath).toEqual(helpersPath());
    expect(grandchild._helpers?.isInclude(AbcHelper)).toBeFalsy();
  });

  it("includes nothing when includeAllHelpers is false", () => {
    setApplicationHelpers(["abc"], new Map([["AbcHelper", AbcHelper]]));
    const Base = base();
    Base.includeAllHelpers = false;
    const klass = subclassOf(Base);

    inherited(klass, Base);

    expect(klass._helpers?.isInclude(AbcHelper)).toBeFalsy();
  });

  it("returns without touching a class that has no helpersPath slot", () => {
    setApplicationHelpers(["abc"], new Map([["AbcHelper", AbcHelper]]));
    const Base = base();
    const klass = { name: "Bare" } as HelpersPathControllerClass;

    inherited(klass, Base);

    expect(klass._helpers).toBeUndefined();
  });
});
