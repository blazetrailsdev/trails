/**
 * Trails-only: Ruby's `::Date` is stdlib, so it has no Rails test to mirror.
 * These cover the members `I18n::Backend::Base#localize` duck-types.
 */

import { describe, it, expect } from "vitest";
import { ArgumentError, Date as RubyDate } from "./date.js";

describe("Date", () => {
  it("parses a y-m-d string", () => {
    const date = RubyDate.parse("2008-07-02");
    expect([date.year, date.mon, date.day]).toEqual([2008, 7, 2]);
  });

  it("raises on an unparseable string", () => {
    expect(() => RubyDate.parse("not a date")).toThrow(ArgumentError);
    expect(() => RubyDate.parse("not a date")).toThrow("invalid date");
  });

  it("counts wday from Sunday, as Ruby does", () => {
    expect(RubyDate.parse("2008-07-02").wday).toBe(3);
    expect(RubyDate.parse("2008-07-06").wday).toBe(0);
  });

  it("does not answer sec or hour, so localize resolves it against date.formats", () => {
    const date = RubyDate.parse("2008-07-02");
    expect("sec" in date).toBe(false);
    expect("hour" in date).toBe(false);
  });

  it("formats the strftime directives the date formats use", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%Y-%m-%d")).toBe("2008-07-02");
    expect(date.strftime("%b %d")).toBe("Jul 02");
    expect(date.strftime("%B %d, %Y")).toBe("July 02, 2008");
    expect(date.strftime("%a %A")).toBe("Wed Wednesday");
  });

  it("strips the padding for the %-d flag and leaves unknown directives alone", () => {
    const date = RubyDate.parse("2008-07-02");
    expect(date.strftime("%-m/%-d")).toBe("7/2");
    expect(date.strftime("%Q")).toBe("%Q");
  });
});
