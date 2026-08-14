/**
 * Mirrors: activesupport/test/testing/test_without_assertions_test.rb
 *
 * Rails' `test_without_assertions` is an empty test whose surrounding
 * `AfterTeardown` captures stderr around `super` and matches the warning
 * `tests_without_assertions.rb:10-17` writes. trails' hook takes the running
 * test rather than reading it off `self`, so the assertion-free test is the
 * `RunningTest` handed to it, and the warning is captured off `console.warn`.
 */
import { expect, it, vi } from "vitest";

import { afterTeardown } from "./tests-without-assertions.js";

it("without assertions", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    afterTeardown({
      assertions: 0,
      skipped: false,
      error: false,
      name: "test_without_assertions",
      sourceLocation: ["packages/activesupport/src/testing/test_without_assertions_test.ts", 9],
      failures: [],
    });

    const err = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(err).toMatch(
      /Test is missing assertions: `test_without_assertions` .+test_without_assertions_test\.ts:\d+/,
    );
  } finally {
    warn.mockRestore();
  }
});
