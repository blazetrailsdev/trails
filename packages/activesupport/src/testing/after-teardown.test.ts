import { describe, expect, it } from "vitest";

import { resetCallbacks } from "../callbacks.js";
import { UnexpectedError } from "./assertions.js";
import { afterTeardown, prepended, teardown } from "./setup-and-teardown.js";
import type { RunningTest } from "./tests-without-assertions.js";

class MyError extends Error {}

describe("AfterTeardownTest", () => {
  it("teardown raise but all after teardown method are called", () => {
    const klass = {};
    prepended(klass);
    const test: Pick<RunningTest, "failures"> = { failures: [] };
    let witness = false;

    teardown.call(klass, () => {
      throw new MyError("Test raises an error, all after_teardown should still get called");
    });

    const otherAfterTeardown = () => {
      afterTeardown.call(klass, test);
      witness = true;
    };

    try {
      expect(test.failures.length).toBe(0);
      otherAfterTeardown();
      expect(test.failures.length).toBe(1);
      expect(test.failures[0]).toBeInstanceOf(UnexpectedError);
      expect((test.failures[0] as UnexpectedError).error).toBeInstanceOf(MyError);

      expect(witness).toBe(true);
    } finally {
      resetCallbacks(klass, "teardown");
    }
  });
});
