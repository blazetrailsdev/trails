import { describe, it, expect } from "vitest";

import { ActiveSupportJSON } from "../json.js";
import { Temporal } from "@blazetrails/date";
import { Encoding } from "./encoding.js";

describe("JSON Encoding default time precision (trails)", () => {
  it("encodes an Instant at the default precision of 3", () => {
    expect(Encoding.timePrecision).toBe(3);
    const time = Temporal.Instant.from("2010-01-01T00:00:00Z");
    expect(ActiveSupportJSON.encode(time)).toBe('"2010-01-01T00:00:00.000Z"');
  });

  it("encodes a UTC ZonedDateTime with a Z offset", () => {
    const time = Temporal.ZonedDateTime.from("2010-01-01T00:00:00[UTC]");
    expect(ActiveSupportJSON.encode(time)).toBe('"2010-01-01T00:00:00.000Z"');
  });

  it("encodes an offset ZonedDateTime with its numeric offset", () => {
    const time = Temporal.ZonedDateTime.from("2010-01-01T00:00:00[-05:00]");
    expect(ActiveSupportJSON.encode(time)).toBe('"2010-01-01T00:00:00.000-05:00"');
  });

  it("encodes a PlainDate without a time part", () => {
    expect(ActiveSupportJSON.encode(Temporal.PlainDate.from("2005-02-01"))).toBe('"2005-02-01"');
  });

  it("encodes a PlainDate as %Y/%m/%d when the standard time format is off", () => {
    const old = Encoding.useStandardJsonTimeFormat;
    Encoding.useStandardJsonTimeFormat = false;
    try {
      expect(ActiveSupportJSON.encode(Temporal.PlainDate.from("2005-02-01"))).toBe('"2005/02/01"');
    } finally {
      Encoding.useStandardJsonTimeFormat = old;
    }
  });
});
