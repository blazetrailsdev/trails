import { describe, expect, it } from "vitest";

import { cwd } from "../process-adapter.js";
import { UnexpectedError } from "./assertions.js";

describe("UnexpectedErrorTest", () => {
  it("message reads the wrapped error when called", () => {
    const raised = new TypeError("boom");
    const wrapped = new UnexpectedError(raised);
    expect(wrapped.message).toMatch(/^TypeError: boom\n/);

    raised.message = "louder";
    expect(wrapped.message).toMatch(/^TypeError: louder\n/);
  });

  it("stack reads the wrapped error when called", () => {
    const raised = new RangeError("nope");
    const wrapped = new UnexpectedError(raised);
    expect(wrapped.stack).toBe(raised.stack);

    raised.stack = "RangeError: nope\n    at somewhere";
    expect(wrapped.stack).toBe("RangeError: nope\n    at somewhere");
  });

  it("the rendered backtrace is filtered and cwd-relative", () => {
    const raised = new Error("boom");
    raised.stack = [
      "Error: boom",
      `    at doThing (${cwd()}/packages/activesupport/src/thing.ts:1:1)`,
      "    at runTest (/somewhere/node_modules/vitest/dist/runner.js:2:2)",
      `    at afterFramework (${cwd()}/packages/activesupport/src/other.ts:3:3)`,
    ].join("\n");

    expect(new UnexpectedError(raised).message).toBe(
      "Error: boom\n    at doThing (packages/activesupport/src/thing.ts:1:1)",
    );
  });
});
