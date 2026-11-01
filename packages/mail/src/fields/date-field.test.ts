import { describe, expect, it, vi } from "vitest";
import { DateTime, strftime, Temporal } from "@blazetrails/date";
import { DateField } from "./date-field.js";

describe("Mail::DateField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new DateField("12 Aug 2009 00:00:02 GMT")).not.toThrow();
    });
    it("should be able to tell the time", () => {
      expect(new DateField("12 Aug 2009 00:00:02 GMT").dateTime()).toBeInstanceOf(
        Temporal.PlainDateTime,
      );
    });
    it("should accept a string without the field name", () => {
      const t = new DateField("12 Aug 2009 00:00:02 GMT");
      expect(t.name).toEqual("Date");
      expect(t.value).toEqual("Wed, 12 Aug 2009 00:00:02 +0000");
      expect(t.dateTime()?.equals(DateTime.parse("12 Aug 2009 00:00:02 GMT") as never)).toBe(true);
    });
    it("should accept nil as a value", () => {
      const t = new DateField(null);
      expect(t.dateTime()).not.toBeNull();
    });
    it("should allow us to encode an date field", () => {
      const field = new DateField("12 Aug 2009 00:00:02 GMT");
      expect(field.encoded()).toEqual("Date: Wed, 12 Aug 2009 00:00:02 +0000\r\n");
    });
    it("should allow us to decode an address field", () => {
      const field = new DateField("12 Aug 2009 00:00:02 GMT");
      expect(field.decoded()).toEqual("Wed, 12 Aug 2009 00:00:02 +0000");
    });
    it("should be able to parse a really bad spacing example", () => {
      const field = new DateField("Fri, 21 Nov 1997 09(comment):   55  :  06 -0600");
      expect(field.decoded()).toEqual("Fri, 21 Nov 1997 09:55:06 -0600");
    });
    it("should give today's date if no date is specified", () => {
      const now = DateTime.now();
      vi.spyOn(DateTime, "now").mockReturnValue(now);
      expect(
        new DateField().dateTime()?.equals(DateTime.parse(strftime(now, "%FT%T%:z")) as never),
      ).toBe(true);
    });
    it("should handle invalid date", () => {
      const field = new DateField("12 Aug 2009 30:00:02 GMT");
      expect(field.dateTime()).toBeNull();
    });
  });
});
