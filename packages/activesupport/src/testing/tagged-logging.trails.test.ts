import { describe, expect, it } from "vitest";

import { assertDifference, UnexpectedError } from "./assertions.js";
import { beforeSetup, setTaggedLogger } from "./tagged-logging.js";

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

  it("before_setup logs the divider/heading/divider trio at info level", () => {
    const infos: unknown[] = [];
    setTaggedLogger({
      warn: () => {},
      debug: () => {},
      info: (msg: unknown) => infos.push(msg),
      "info?": true,
    } as never);
    try {
      beforeSetup();
    } finally {
      setTaggedLogger(null);
    }

    const heading =
      "TaggedLoggingTest: before_setup logs the divider/heading/divider trio at info level";
    expect(infos).toEqual(["-".repeat(heading.length), heading, "-".repeat(heading.length)]);
  });

  it("before_setup logs nothing when the logger is not at info level", () => {
    const infos: unknown[] = [];
    setTaggedLogger({
      warn: () => {},
      debug: () => {},
      info: (msg: unknown) => infos.push(msg),
      "info?": false,
    } as never);
    try {
      beforeSetup();
    } finally {
      setTaggedLogger(null);
    }

    expect(infos).toEqual([]);
  });
});
