import { afterEach, describe, expect, it } from "vitest";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { constantize, registerConstant, unregisterConstant } from "./inflector.js";

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
});
