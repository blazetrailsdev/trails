import { describe, it, expect } from "vitest";

import { ActiveSupportJSON } from "../../lib/json.js";
import { Temporal } from "@blazetrails/date";
import { Encoding } from "../../lib/json/encoding.js";

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

describe("JSONGemEncoder#jsonify copy-on-write (trails)", () => {
  it("encodes nested plain objects and arrays of JSON-native leaves", () => {
    const value = { a: 1, b: [1, "x", null, true], c: { d: { e: "f" } } };
    expect(ActiveSupportJSON.encode(value)).toBe(
      '{"a":1,"b":[1,"x",null,true],"c":{"d":{"e":"f"}}}',
    );
  });

  it("encodes a Map nested inside a plain object", () => {
    const value = {
      a: 1,
      m: new Map<unknown, unknown>([
        [1, "one"],
        ["k", [NaN]],
      ]),
    };
    expect(ActiveSupportJSON.encode(value)).toBe('{"a":1,"m":{"1":"one","k":[null]}}');
  });

  it("encodes values with asJson after unchanged siblings", () => {
    const record = new (class {
      asJson() {
        return { id: 7 };
      }
    })();
    const value = { a: "x", b: [1, 2, record, 3], c: record };
    expect(ActiveSupportJSON.encode(value)).toBe('{"a":"x","b":[1,2,{"id":7},3],"c":{"id":7}}');
  });

  it("does not mutate its input when a value changes", () => {
    const value = { a: 1, b: NaN, c: [Infinity] };
    expect(ActiveSupportJSON.encode(value)).toBe('{"a":1,"b":null,"c":[null]}');
    expect(value.b).toBeNaN();
    expect(value.c[0]).toBe(Infinity);
  });
});
