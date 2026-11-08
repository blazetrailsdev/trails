import { describe, expect, it } from "vitest";
import { NameError } from "../../lib/core-ext/name-error.js";
import { constantize } from "../../lib/inflector.js";
import { TopLevel, constSet, constDefined, rbModRemoveConst } from "@blazetrails/ruby-compat";
import { assert, assertNot, assertRaise, assertNil } from "../../lib/testing/assertions.js";

describe("NameErrorTest", () => {
  it("name error should set missing name", async () => {
    class NameErrorTest {}
    constSet(TopLevel, "NameErrorTest", NameErrorTest);

    let exc: NameError;
    try {
      exc = await assertRaise([NameError], {}, () =>
        constantize("NameErrorTest::SomeNameThatNobodyWillUse____Really"),
      );
    } finally {
      if (constDefined(Object, "NameErrorTest", false)) rbModRemoveConst(Object, "NameErrorTest");
    }
    expect(exc.missingName()).toEqual("NameErrorTest::SomeNameThatNobodyWillUse____Really");
    assert(exc.isMissingName(":SomeNameThatNobodyWillUse____Really"));
    assert(exc.isMissingName("NameErrorTest::SomeNameThatNobodyWillUse____Really"));
    expect(exc.receiver()).toEqual(NameErrorTest);
  });

  it("missing method should ignore missing name", async () => {
    const self = new (class NameErrorTest {})();
    const exc = await assertRaise([NameError], {}, () => {
      throw new NameError(
        "undefined local variable or method 'some_method_that_does_not_exist' for an instance of NameErrorTest",
        "some_method_that_does_not_exist",
        { receiver: self },
      );
    });
    assertNot(exc.isMissingName(":Foo"));
    assertNil(exc.missingName());
    expect(exc.receiver()).toEqual(self);
  });
});
