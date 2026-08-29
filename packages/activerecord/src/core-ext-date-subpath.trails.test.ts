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

describe("activesupport core-ext/date/calculations subpath", () => {
  const date = Temporal.PlainDate.from("2005-02-21");

  it("is reachable from outside the package", () => {
    expect(beginningOfDay(date).toString()).toContain("2005-02-21 00:00:00");
    expect(middleOfDay(date).toString()).toContain("2005-02-21 12:00:00");
    expect(endOfDay(date).toString()).toContain("2005-02-21 23:59:59");
    expect(ago(date, 1).toString()).toContain("2005-02-20 23:59:59");
    expect(since(date, 1).toString()).toContain("2005-02-21 00:00:01");
    expect(timeBeginningOfDay).not.toBe(beginningOfDay);
  });
});
