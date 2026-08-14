/**
 * Mirrors: activesupport/test/testing/after_teardown_test.rb
 *
 * Rails drives this through a `Minitest::Test` subclass whose `after_teardown`
 * asserts the failure count moved 0 -> 1 around `super` and that the other
 * `after_teardown` in the chain still ran. trails has no Minitest runner, so
 * the chain is spelled out: the mixed-in `afterTeardown` calls the ported one
 * and then records its witness, exactly as `OtherAfterTeardown` does.
 */
import { describe, expect, it } from "vitest";

import { resetCallbacks } from "../callbacks.js";
import { UnexpectedError } from "./assertions.js";
import { afterTeardown, failures, prepended, teardown } from "./setup-and-teardown.js";

class MyError extends Error {}

describe("AfterTeardownTest", () => {
  it("teardown raise but all after teardown method are called", () => {
    const klass = {};
    prepended(klass);
    let witness = false;

    teardown.call(klass, () => {
      throw new MyError("Test raises an error, all after_teardown should still get called");
    });

    /** Mirrors `OtherAfterTeardown#after_teardown` (after_teardown_test.rb:5-9). */
    const otherAfterTeardown = () => {
      afterTeardown.call(klass);
      witness = true;
    };

    try {
      expect(failures.length).toBe(0);
      otherAfterTeardown();
      expect(failures.length).toBe(1);
      expect(failures[0]).toBeInstanceOf(UnexpectedError);
      expect((failures[0] as UnexpectedError).error).toBeInstanceOf(MyError);

      expect(witness).toBe(true);
    } finally {
      failures.length = 0;
      resetCallbacks(klass, "teardown");
    }
  });
});
