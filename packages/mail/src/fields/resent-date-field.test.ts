import { Temporal } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import { ResentDateField } from "./resent-date-field.js";

describe("Mail::ResentDateField", () => {
  it("should initialize", () => {
    expect(() => new ResentDateField("12 Aug 2009 00:00:02 GMT")).not.toThrow();
  });
  it("should be able to tell the time", () => {
    expect(new ResentDateField("12 Aug 2009 00:00:02 GMT").dateTime()!.constructor).toEqual(
      Temporal.PlainDateTime,
    );
  });
});
