/**
 * Mirrors: activesupport/test/testing/after_teardown_assertion_test.rb
 *
 * The `Minitest::Assertion` arm of `setup_and_teardown.rb:44-53`'s rescue:
 * Rails' teardown block calls `flunk`, which raises `Minitest::Assertion`, and
 * that is recorded on `failures` as itself rather than wrapped. trails has no
 * `flunk`, so the block raises the `Assertion` it would have raised, and
 * `otherAfterTeardown` is `AfterTeardownAssertionTest::OtherAfterTeardown#after_teardown`
 * (after_teardown_assertion_test.rb:6-10).
 */
import { describe, expect, it } from "vitest";

import { resetCallbacks } from "../callbacks.js";
import { Assertion } from "./assertions.js";
import { afterTeardown, failures, prepended, teardown } from "./setup-and-teardown.js";

describe("AfterTeardownAssertionTest", () => {
  it("teardown raise but all after teardown method are called", () => {
    const klass = {};
    prepended(klass);
    let witness = false;

    const flunked = new Assertion(
      "Test raises a Minitest::Assertion error, all after_teardown should still get called",
    );
    teardown.call(klass, () => {
      throw flunked;
    });

    const otherAfterTeardown = () => {
      afterTeardown.call(klass);
      witness = true;
    };

    try {
      expect(failures.length).toBe(0);
      otherAfterTeardown();
      expect(failures.length).toBe(1);
      expect(failures[0]).toBe(flunked);

      expect(witness).toBe(true);
    } finally {
      failures.length = 0;
      resetCallbacks(klass, "teardown");
    }
  });
});
