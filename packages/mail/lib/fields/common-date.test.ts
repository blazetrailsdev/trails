import { describe, expect, it } from "vitest";
import { DateField } from "./date-field.js";
import { ResentDateField } from "./resent-date-field.js";

describe("Mail::CommonDateField", () => {
  describe("encoding and decoding fields", () => {
    it("should allow us to encode an date field", () => {
      const field = new DateField("12 Aug 2009 00:00:02 GMT");
      expect(field.encoded()).toEqual("Date: Wed, 12 Aug 2009 00:00:02 +0000\r\n");
    });
    it("should allow us to encode an resent date field", () => {
      const field = new ResentDateField("12 Aug 2009 00:00:02 GMT");
      expect(field.encoded()).toEqual("Resent-Date: Wed, 12 Aug 2009 00:00:02 +0000\r\n");
    });
    it("should allow us to decode an address field", () => {
      const field = new DateField("12 Aug 2009 00:00:02 GMT");
      expect(field.decoded()).toEqual("Wed, 12 Aug 2009 00:00:02 +0000");
    });
  });
});
