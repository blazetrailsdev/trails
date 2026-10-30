import { describe, expect, it } from "vitest";
import { Field } from "../field.js";
import { DateTimeElement } from "./date-time-element.js";

describe("MailDateTimeElement", () => {
  it("should parse a date", () => {
    const dateText = "Wed, 27 Apr 2005 14:15:31 -0700";
    expect(() => new DateTimeElement(dateText)).not.toThrow();
  });

  it("should raise an error if the input is nil", () => {
    const dateText = null;
    expect(() => new DateTimeElement(dateText)).toThrow(Field.ParseError);
  });

  it("should raise an error if the input is useless", () => {
    const dateText = '""""""""""""""""';
    expect(() => new DateTimeElement(dateText)).toThrow(Field.ParseError);
  });
});
