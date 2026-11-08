import { describe, expect, it } from "vitest";
import { Backtrace } from "./backtrace.js";
import { useApplicationTestCase } from "./test-helpers/application.js";

describe("Backtrace.collapse", () => {
  useApplicationTestCase();
  it("suppresses async frames and ruby-compat frames", () => {
    const paths = [
      `at async file://${Backtrace.SUPPRESSED_PATHS.at(-2)}/dist/application.js:92:21`,
      `at blk (file://${Backtrace.SUPPRESSED_PATHS.at(-1)}/dist/hash.js:19:27)`,
    ];
    expect(Backtrace.collapse(paths)).toEqual([]);
  });
});
