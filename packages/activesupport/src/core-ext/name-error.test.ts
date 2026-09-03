import { describe, expect, it } from "vitest";
import { NameError } from "./name-error.js";
import { constantize, registerConstant, unregisterConstant } from "../inflector.js";

describe("NameErrorTest", () => {
  it("name error should set missing name", () => {
    class NameErrorTest {}
    registerConstant("NameErrorTest", NameErrorTest);

    let exc: NameError | undefined;
    try {
      constantize("NameErrorTest::SomeNameThatNobodyWillUse____Really");
    } catch (e) {
      exc = e as NameError;
    } finally {
      unregisterConstant("NameErrorTest", NameErrorTest);
    }
    expect(exc).toBeInstanceOf(NameError);
    expect(exc!.missingName()).toBe("NameErrorTest::SomeNameThatNobodyWillUse____Really");
    expect(exc!.isMissingName(Symbol("SomeNameThatNobodyWillUse____Really"))).toBe(true);
    expect(exc!.isMissingName("NameErrorTest::SomeNameThatNobodyWillUse____Really")).toBe(true);
  });

  it("missing method should ignore missing name", () => {
    const exc = new NameError("undefined local variable or method 'someMethod'");
    expect(exc.isMissingName(Symbol("Foo"))).toBe(false);
    expect(exc.isMissingName(Symbol())).toBe(false);
    expect(exc.missingName()).toBeUndefined();
  });
});
