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
