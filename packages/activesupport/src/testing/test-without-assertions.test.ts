import { afterEach, expect, it, vi } from "vitest";

import { TestCase } from "../test-case.js";

afterEach(() => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const test = new TestCase("test_without_assertions");
    test.sourceLocation = ["packages/activesupport/src/testing/test_without_assertions_test.ts", 9];
    test.afterTeardown();

    const err = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(err).toMatch(
      /Test is missing assertions: `test_without_assertions` .+test_without_assertions_test\.ts:\d+/,
    );
  } finally {
    warn.mockRestore();
  }
});

it("without assertions", () => {});
