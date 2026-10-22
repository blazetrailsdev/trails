import { describe, expect, test } from "vitest";
import { Deprecation } from "@blazetrails/activesupport";
import { ActionView } from "./index.js";

describe("SanitizeHelper::ClassMethods deprecated options", () => {
  test("sanitized_* readers and writers warn through the deprecator", () => {
    const messages: string[] = [];
    const deprecator = Deprecation._instance();
    const behavior = deprecator.behavior;
    deprecator.behavior = [(message: string) => void messages.push(message)];
    try {
      const ClassMethods = ActionView.Helpers.SanitizeHelper.ClassMethods;
      ClassMethods.sanitizedBadTags();
      ClassMethods.setSanitizedAllowedProtocols(["http"]);
    } finally {
      deprecator.behavior = behavior;
    }
    expect(messages[0]).toMatch(
      /^DEPRECATION WARNING: The sanitizedBadTags option is deprecated and has no effect\./,
    );
    expect(messages[1]).toMatch(
      /^DEPRECATION WARNING: The sanitizedAllowedProtocols= option is deprecated/,
    );
  });
});
