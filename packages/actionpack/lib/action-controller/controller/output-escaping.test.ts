import { describe, it } from "vitest";
import {
  assertEqual,
  assertPredicate,
  htmlEscape,
  htmlSafe,
  isBlank,
} from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";

describe("OutputEscapingTest", () => {
  it("escape_html shouldn't die when passed nil", () => {
    assertPredicate(htmlEscape(null), isBlank);
  });

  it("escapeHTML should escape strings", () => {
    assertEqual("&lt;&gt;&quot;", htmlEscape('<>"'));
  });

  it("escapeHTML shouldn't touch explicitly safe strings", () => {
    assertEqual("<", htmlEscape(htmlSafe("<")));
  });
});
