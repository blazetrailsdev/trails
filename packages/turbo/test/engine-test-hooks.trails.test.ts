import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { LoadError } from "@blazetrails/ruby-compat";
import { Engine } from "../lib/engine.js";

describe("Turbo::Engine turbo.test_assertions", () => {
  it("raises when the active_support_test_case hook fires with turbo/test_assertions unloaded", async () => {
    const activeSupport = TopLevel.ActiveSupport as { TestCase?: unknown };
    const testCase = activeSupport.TestCase;
    delete activeSupport.TestCase;
    try {
      await expect(
        Engine.instance()
          .initializers.find((i) => i.name === "turbo.test_assertions")!
          .run(),
      ).rejects.toThrow(new LoadError("cannot load such file -- turbo/test_assertions"));
    } finally {
      activeSupport.TestCase = testCase;
    }
  });
});
