import { DateTime, strftime, Temporal } from "@blazetrails/date";
import { describe, expect, it, vi } from "vitest";
import { ResentDateField } from "../../lib/fields/resent-date-field.js";

describe("Mail::ResentDateField", () => {
  it("should initialize", () => {
    expect(() => new ResentDateField("12 Aug 2009 00:00:02 GMT")).not.toThrow();
  });
  it("should be able to tell the time", () => {
    expect(new ResentDateField("12 Aug 2009 00:00:02 GMT").dateTime()!.constructor).toEqual(
      Temporal.PlainDateTime,
    );
  });
  it("should accept a string without the field name", () => {
    const t = new ResentDateField("12 Aug 2009 00:00:02 GMT");
    expect(t.name).toEqual("Resent-Date");
    expect(t.value).toEqual("Wed, 12 Aug 2009 00:00:02 +0000");
    expect(String(t.dateTime())).toEqual(String(DateTime.parse("12 Aug 2009 00:00:02 GMT")));
  });

  it("should give today's date if no date is specified", () => {
    const now = DateTime.now();
    const spy = vi.spyOn(DateTime, "now").mockReturnValue(now);
    const t = new ResentDateField();
    expect(spy).toHaveBeenCalled();
    expect(t.name).toEqual("Resent-Date");
    expect(String(t.dateTime())).toEqual(String(DateTime.parse(strftime(now, "%FT%T%:z"))));
    spy.mockRestore();
  });
});
