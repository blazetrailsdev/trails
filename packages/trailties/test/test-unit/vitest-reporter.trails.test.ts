import type { TestCase } from "vitest/node";
import { describe, expect, it } from "vitest";
import { VitestResult } from "../../lib/test-unit/vitest-reporter.js";

const testCase = (state: string, errors?: { name: string; message: string }[]) =>
  ({
    name: "woot",
    parent: { type: "suite", fullName: "ExampleTest" },
    module: { moduleId: "/app/test/a.test.ts" },
    location: { line: 9 },
    diagnostic: () => ({ duration: 1500 }),
    result: () => ({ state, errors }),
  }) as unknown as TestCase;

describe("VitestResult", () => {
  it("reads a passing test case", () => {
    const result = new VitestResult(testCase("passed"));
    expect(result.resultCode).toBe(".");
    expect(result.isPassed()).toBe(true);
    expect(result.failure).toBeNull();
    expect(result.time).toBe(1.5);
    expect(result.sourceLocation).toEqual(["/app/test/a.test.ts", 9]);
  });

  it("tells an assertion failure from an error", () => {
    const assertion = [{ name: "AssertionError", message: "boo" }];
    const failed = new VitestResult(testCase("failed", assertion));
    expect(failed.resultCode).toBe("F");
    expect(String(failed)).toBe("Failure:\nExampleTest#woot [/app/test/a.test.ts:9]:\nboo\n");
    const errored = new VitestResult(testCase("failed", [{ name: "TypeError", message: "x" }]));
    expect(errored.resultCode).toBe("E");
  });

  it("marks a skipped test", () => {
    const result = new VitestResult(testCase("skipped"));
    expect(result.resultCode).toBe("S");
    expect(result.isSkipped()).toBe(true);
    expect(result.isPassed()).toBe(false);
  });
});
