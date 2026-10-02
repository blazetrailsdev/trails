import { afterEach, expect, it, vi } from "vitest";

import { iseqLocationSetup } from "@blazetrails/ruby-compat";
import { TestCase } from "../test-case.js";

class TestsWithoutAssertionsWarnTest extends TestCase {
  ["test_without_assertions"](): void {}
}
iseqLocationSetup(
  TestsWithoutAssertionsWarnTest.prototype.test_without_assertions,
  "packages/activesupport/src/testing/test_without_assertions_test.ts",
  9,
);

afterEach(() => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    new TestsWithoutAssertionsWarnTest("test_without_assertions").afterTeardown();

    const err = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(err).toMatch(
      /Test is missing assertions: `test_without_assertions` .+test_without_assertions_test\.ts:\d+/,
    );
  } finally {
    warn.mockRestore();
  }
});

it("without assertions", () => {});
