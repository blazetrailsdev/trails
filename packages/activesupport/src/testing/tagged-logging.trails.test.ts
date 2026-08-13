import { describe, expect, it } from "vitest";

import { assertDifference, UnexpectedError } from "./assertions.js";
import { setTaggedLogger } from "./tagged-logging.js";

describe("TaggedLoggingTest", () => {
  it("the tagged_logger writer receives the assertion warning with the test-case identity", async () => {
    const warnings: unknown[] = [];
    setTaggedLogger({
      warn: (msg: unknown) => warnings.push(msg),
      debug: () => {},
      "warn?": true,
    } as never);
    try {
      let counter = 0;
      const error = await assertDifference(
        () => counter,
        1,
        null,
        () => {
          counter += 1;
          throw new RangeError("nope");
        },
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnexpectedError);
      expect(String(warnings[0])).toMatch(
        /^TaggedLoggingTest - the tagged_logger writer receives the assertion warning with the test-case identity: RangeError raised\./,
      );
    } finally {
      setTaggedLogger(null);
    }
  });
});
