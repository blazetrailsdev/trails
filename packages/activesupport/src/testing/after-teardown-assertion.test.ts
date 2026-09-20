import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetCallbacks } from "../callbacks.js";
import { Assertion, assert, assertChanges } from "./assertions.js";
import { afterTeardown, prepended, teardown } from "./setup-and-teardown.js";
import type { RunningTest } from "./tests-without-assertions.js";

describe("AfterTeardownAssertionTest", () => {
  const klass = {};
  const test: Pick<RunningTest, "failures"> = { failures: [] };
  let witness = false;
  let flunked: Assertion;

  beforeEach(() => {
    prepended(klass);
    witness = false;
    test.failures.length = 0;
    flunked = new Assertion(
      "Test raises a Minitest::Assertion error, all after_teardown should still get called",
    );
    teardown.call(klass, () => {
      throw flunked;
    });
  });

  afterEach(async () => {
    try {
      await assertChanges(
        () => test.failures.length,
        null,
        { from: 0, to: 1 },
        () => {
          afterTeardown.call(klass, test);
          witness = true;
        },
      );

      expect(test.failures[0]).toBe(flunked);
      expect(witness).toBe(true);
      test.failures.length = 0;
    } finally {
      resetCallbacks(klass, "teardown");
    }
  });

  it("teardown raise but all after teardown method are called", () => {
    assert(true);
  });
});
