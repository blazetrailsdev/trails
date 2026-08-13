import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  ago,
  beginningOfDay,
  endOfDay,
  middleOfDay,
  since,
} from "@blazetrails/activesupport/core-ext/date/calculations";
import { beginningOfDay as timeBeginningOfDay } from "@blazetrails/activesupport";

// Guards the subpath registration for the `Date` arm of
// `active_support/core_ext/date/calculations.rb`: it is deliberately NOT
// re-exported from activesupport's flat index (the `Time` arm owns those
// spellings there), so a cross-package consumer can only reach it through the
// Rails-shaped subpath. See packages/activesupport/src/index.ts.
describe("activesupport core-ext/date/calculations subpath", () => {
  const date = Temporal.PlainDate.from("2005-02-21");

  it("is reachable from outside the package", () => {
    expect(beginningOfDay(date).toString()).toContain("2005-02-21 00:00:00");
    expect(middleOfDay(date).toString()).toContain("2005-02-21 12:00:00");
    expect(endOfDay(date).toString()).toContain("2005-02-21 23:59:59");
    expect(ago(date, 1).toString()).toContain("2005-02-20 23:59:59");
    expect(since(date, 1).toString()).toContain("2005-02-21 00:00:01");
    // The flat index still resolves the Time arm's same-named export.
    expect(timeBeginningOfDay).not.toBe(beginningOfDay);
  });
});
