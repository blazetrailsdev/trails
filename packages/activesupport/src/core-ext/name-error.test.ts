import { describe, expect, it } from "vitest";
import { NameError } from "./name-error.js";
import { constantize, registerConstant, unregisterConstant } from "../inflector.js";

describe("NameErrorTest", () => {
  it("name error should set missing name", () => {
    // Ruby raises this by *referencing* the constant inside the test class;
    // trails has no bare constant references, so `constantize` is the
    // equivalent trigger. `NameErrorTest` is registered because in Ruby it is a
    // live class — the enclosing constant has to exist for `name` to be the
    // final segment rather than the first missing one. Rails' `receiver`
    // assertion has no JS analogue: an Error carries no receiver.
    class NameErrorTest {}
    registerConstant("NameErrorTest", NameErrorTest);

    let exc: NameError | undefined;
    try {
      constantize("NameErrorTest::SomeNameThatNobodyWillUse____Really");
    } catch (e) {
      exc = e as NameError;
    } finally {
      // The constant table is process-wide; don't leak this into other tests.
      unregisterConstant("NameErrorTest", NameErrorTest);
    }
    expect(exc).toBeInstanceOf(NameError);
    expect(exc!.missingName()).toBe("NameErrorTest::SomeNameThatNobodyWillUse____Really");
    // Ruby's Symbol arm compares `name` (the segment); the string arm compares
    // `missing_name` (the qualified path).
    expect(exc!.isMissingName(Symbol("SomeNameThatNobodyWillUse____Really"))).toBe(true);
    expect(exc!.isMissingName("NameErrorTest::SomeNameThatNobodyWillUse____Really")).toBe(true);
  });

  it("missing method should ignore missing name", () => {
    // A NameError that is not a missing *constant* must report no missing name.
    const exc = new NameError("undefined local variable or method 'someMethod'");
    expect(exc.isMissingName(Symbol("Foo"))).toBe(false);
    // Ruby's `nil == :sym` is false, so a nameless NameError matches no Symbol
    // — including a description-less one, where both sides are undefined.
    expect(exc.isMissingName(Symbol())).toBe(false);
    expect(exc.missingName()).toBeUndefined();
  });
});
