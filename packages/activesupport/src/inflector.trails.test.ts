import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { NotImplementedError } from "@blazetrails/ruby-compat/not-implemented-error";
import { StopIteration } from "@blazetrails/ruby-compat/stop-iteration";
import { constantize, safeConstantize } from "./inflector.js";
import { rbModConstSet, registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat" {
  interface ConstantTable {
    "Typed::Literal": typeof Date;
  }
}

describe("constantize types a literal through ConstantTable", () => {
  it("answers the table's class for a literal and unknown otherwise", () => {
    expectTypeOf(constantize<"Typed::Literal">).returns.toEqualTypeOf<typeof Date>();
    expectTypeOf(constantize("Date" as string)).toBeUnknown();
    expect(constantize("Object")).toBe(Object);
  });
});

describe("constantize resolves core exception classes", () => {
  it("answers ruby-compat's NotImplementedError", () => {
    expect(constantize("NotImplementedError")).toBe(NotImplementedError);
    expect(constantize("::NameError")).toBe(NameError);
    expect(constantize("StopIteration")).toBe(StopIteration);
  });
});

describe("constantize walks seated constants like Object.const_get", () => {
  const Bar = {};
  const Foo: Record<string, unknown> = {};

  afterEach(() => unregisterConstant("Foo", Foo));

  it("resolves a nested constant seated on a registered namespace", () => {
    registerConstant("Foo", Foo);
    rbModConstSet(Foo, "Bar", Bar);
    expect(constantize("Foo::Bar")).toBe(Bar);
  });

  it("names only the path up to the unresolved segment", () => {
    registerConstant("Foo", Foo);
    rbModConstSet(Foo, "Bar", Bar);
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
