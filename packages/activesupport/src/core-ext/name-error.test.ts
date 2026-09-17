import { describe, expect, it } from "vitest";
import { NameError } from "./name-error.js";
import { constantize, registerConstant, unregisterConstant } from "../inflector.js";
import { assertNot, assertRaise } from "../testing/assertions.js";

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
    expect(exc.isMissingName(Symbol("SomeNameThatNobodyWillUse____Really"))).toBeTruthy();
    expect(exc.isMissingName("NameErrorTest::SomeNameThatNobodyWillUse____Really")).toBeTruthy();
  });

  it("missing method should ignore missing name", async () => {
    const exc = (await assertRaise([NameError], {}, () => {
      throw new NameError("undefined local variable or method 'someMethod'");
    })) as NameError;
    assertNot(exc.isMissingName(Symbol("Foo")));
    expect(exc.missingName()).toBeUndefined();
  });
});
