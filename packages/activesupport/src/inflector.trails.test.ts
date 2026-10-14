import { afterEach, describe, expect, it } from "vitest";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { constantize, safeConstantize } from "./inflector.js";
import { registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";

describe("constantize walks seated constants like Object.const_get", () => {
  const Bar = {};
  const Foo = { Bar };

  afterEach(() => unregisterConstant("Foo", Foo));

  it("resolves a nested constant seated on a registered namespace", () => {
    registerConstant("Foo", Foo);
    expect(constantize("Foo::Bar")).toBe(Bar);
  });

  it("names only the path up to the unresolved segment", () => {
    registerConstant("Foo", Foo);
    let error: unknown;
    try {
      constantize("Foo::Bar::Baz::Qux");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NameError);
    expect((error as NameError).message).toBe("uninitialized constant Foo::Bar::Baz");
    expect((error as NameError).constantName).toBe("Baz");
    expect((error as NameError).receiver()).toBe(Bar);
  });

  it("sends const_missing to the namespace a segment missed on", () => {
    const Baz = {};
    const Host = { constMissing: (name: string) => (name === "Baz" ? Baz : undefined) };
    registerConstant("Foo", Host);
    try {
      expect(constantize("Foo::Baz")).toBe(Baz);
    } finally {
      unregisterConstant("Foo", Host);
    }
  });

  it("lets a NameError raised inside const_missing escape safe_constantize", () => {
    const Host = {
      constMissing: () => {
        throw new NameError("undefined local variable or method 'oops' for main:Object", "oops");
      },
    };
    registerConstant("Foo", Host);
    try {
      expect(() => safeConstantize("Foo::Baz")).toThrow(/oops/);
    } finally {
      unregisterConstant("Foo", Host);
    }
  });
});
