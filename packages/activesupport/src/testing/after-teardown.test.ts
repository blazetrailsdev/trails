import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetCallbacks } from "../callbacks.js";
import { UnexpectedError, assert, assertChanges } from "./assertions.js";
import { afterTeardown, prepended, teardown } from "./setup-and-teardown.js";
import type { RunningTest } from "./tests-without-assertions.js";

class MyError extends Error {}

describe("AfterTeardownTest", () => {
  const klass = {};
  const test: Pick<RunningTest, "failures"> = { failures: [] };
  let witness = false;

  beforeEach(() => {
    prepended(klass);
    witness = false;
    test.failures.length = 0;
    teardown.call(klass, () => {
      throw new MyError("Test raises an error, all after_teardown should still get called");
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

      expect(test.failures[0]).toBeInstanceOf(UnexpectedError);
      expect((test.failures[0] as UnexpectedError).error).toBeInstanceOf(MyError);
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
