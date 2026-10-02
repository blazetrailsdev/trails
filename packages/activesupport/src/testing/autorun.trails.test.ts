import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import type { TestCase } from "../test-case.js";
import { Assertion, UnexpectedError } from "./assertions.js";

describe("autorun captures the body's exception (minitest/test.rb:190-198)", () => {
  const ran = new Map<string, TestCase>();
  const assertion = new Assertion("Expected false to be truthy.");
  const raised = new TypeError("boom");
  let warn: MockInstance<typeof console.warn>;

  beforeAll(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    warn.mockRestore();
  });

  afterEach((context) => {
    ran.set(context.task.name, context.testCase);
  });

  it.fails("raises an Assertion", () => {
    throw assertion;
  });

  it("keeps the Assertion as itself", () => {
    const testCase = ran.get("raises an Assertion")!;
    expect(testCase.failures).toEqual([assertion]);
    expect(testCase.failures[0]).toBe(assertion);
    expect(testCase.isError()).toBe(false);
  });

  it.fails("raises any other exception", () => {
    throw raised;
  });

  it("wraps any other exception in an UnexpectedError", () => {
    const testCase = ran.get("raises any other exception")!;
    expect(testCase.failures.length).toBe(1);
    expect(testCase.failures[0]).toBeInstanceOf(UnexpectedError);
    expect((testCase.failures[0] as UnexpectedError).error).toBe(raised);
    expect(testCase.isError()).toBe(true);
  });

  it("stays quiet about missing assertions for a test that raised", () => {
    const warned = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(warned).not.toMatch(/Test is missing assertions: `raises any other exception`/);
  });

  it.fails("fails a soft expectation, then raises", () => {
    expect.soft(1).toBe(2);
    throw raised;
  });

  it("seats the errors the body did not raise beside the one it did", () => {
    const testCase = ran.get("fails a soft expectation, then raises")!;
    expect(testCase.failures.length).toBe(2);
    expect((testCase.failures[0] as UnexpectedError).error).toBe(raised);
    expect(testCase.failures[1]).toBeInstanceOf(UnexpectedError);
    expect((testCase.failures[1] as UnexpectedError).error.message).toMatch(/expected 1 to be 2/);
  });

  describe("when a beforeEach hook raises", () => {
    beforeEach((context) => {
      if (context.task.name === "never runs its body") throw raised;
    });

    it.fails("never runs its body", () => {});

    it("seats the hook's error as an UnexpectedError", () => {
      const testCase = ran.get("never runs its body")!;
      expect(testCase.failures.length).toBe(1);
      expect(testCase.isError()).toBe(true);
      expect((testCase.failures[0] as UnexpectedError).error.message).toBe("boom");
    });
  });

  let tries = 0;
  const outcomes = [
    (): void => {
      throw raised;
    },
    (): void => {},
  ];

  it("raises on its first try only", { retry: 1 }, () => {
    outcomes[tries++]();
  });

  it("gives each try a test case holding that try's errors alone", () => {
    expect(tries).toBe(2);
    expect(ran.get("raises on its first try only")!.failures).toEqual([]);
  });

  it("seats a skip called from the body as a Skip, not an error", (context) => {
    ran.set("skipped", context.testCase);
    context.skip();
  });

  it("leaves the skip signal off failures while the body unwinds", () => {
    const testCase = ran.get("skipped")!;
    expect(testCase.isError()).toBe(false);
    expect(testCase.isSkipped()).toBe(true);
  });
});
