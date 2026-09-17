import { describe, expect, it } from "vitest";
import { NameError } from "./name-error.js";
import { constantize, registerConstant, unregisterConstant } from "../inflector.js";
import { assert, assertNot, assertRaise } from "../testing/assertions.js";

describe("NameErrorTest", () => {
  it("name error should set missing name", async () => {
    class NameErrorTest {}
    registerConstant("NameErrorTest", NameErrorTest);

    let exc: NameError;
    try {
      exc = (await assertRaise([NameError], {}, () =>
        constantize("NameErrorTest::SomeNameThatNobodyWillUse____Really"),
      )) as NameError;
    } finally {
      unregisterConstant("NameErrorTest", NameErrorTest);
    }
    expect(exc.missingName()).toEqual("NameErrorTest::SomeNameThatNobodyWillUse____Really");
    assert(exc.isMissingName(":SomeNameThatNobodyWillUse____Really"));
    assert(exc.isMissingName("NameErrorTest::SomeNameThatNobodyWillUse____Really"));
    expect(exc.receiver()).toEqual(NameErrorTest);
  });

  it("missing method should ignore missing name", async () => {
    const self = new (class NameErrorTest {})();
    const exc = (await assertRaise([NameError], {}, () => {
      throw new NameError(
        "undefined local variable or method 'some_method_that_does_not_exist' for an instance of NameErrorTest",
        "some_method_that_does_not_exist",
        { receiver: self },
      );
    })) as NameError;
    assertNot(exc.isMissingName(":Foo"));
    expect(exc.missingName()).toBeNull();
    expect(exc.receiver()).toEqual(self);
  });
});
