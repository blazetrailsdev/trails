import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Assertion, assert, assertChanges } from "./assertions.js";
import { TestCase } from "../test-case.js";
import { include, rbCallSuper } from "@blazetrails/ruby-compat";

const OtherAfterTeardown = {
  afterTeardown(this: { witness: boolean }): unknown {
    const result = rbCallSuper(this, OtherAfterTeardown.afterTeardown);
    this.witness = true;
    return result;
  },
};

describe("AfterTeardownAssertionTest", () => {
  let test: TestCase & { witness: boolean };
  let flunked: Assertion;

  beforeEach(() => {
    const klass = class extends TestCase {
      witness = false;
    };
    include(klass, OtherAfterTeardown);
    flunked = new Assertion(
      "Test raises a Minitest::Assertion error, all after_teardown should still get called",
    );
    klass.teardown(() => {
      throw flunked;
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

    expect(test.failures[0]).toBe(flunked);
    expect(test.witness).toBe(true);
    test.failures.length = 0;
  });

  it("teardown raise but all after teardown method are called", () => {
    assert(true);
  });
});
