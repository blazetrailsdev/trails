import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UnexpectedError, assert, assertChanges } from "./assertions.js";
import { TestCase } from "../test-case.js";
import { Module, include } from "@blazetrails/ruby-compat";

class MyError extends Error {}

const OtherAfterTeardown = new Module();
OtherAfterTeardown.defineMethod("afterTeardown", function (this: { witness: boolean }): unknown {
  const result = OtherAfterTeardown.superMethod(this, "afterTeardown")!();
  this.witness = true;
  return result;
});

describe("AfterTeardownTest", () => {
  let test: TestCase & { witness: boolean };

  beforeEach(() => {
    const klass = class extends TestCase {
      witness = false;
    };
    include(klass, OtherAfterTeardown);
    klass.teardown(() => {
      throw new MyError("Test raises an error, all after_teardown should still get called");
    });
    test = new klass("teardown raise but all after teardown method are called");
    test.assertions = 1;
  });

  afterEach(async () => {
    await assertChanges(
      () => test.failures.length,
      null,
      { from: 0, to: 1 },
      () => test.afterTeardown(),
    );

    expect(test.failures[0]).toBeInstanceOf(UnexpectedError);
    expect((test.failures[0] as UnexpectedError).error).toBeInstanceOf(MyError);
    expect(test.witness).toBe(true);
    test.failures.length = 0;
  });

  it("teardown raise but all after teardown method are called", () => {
    assert(true);
  });
});
