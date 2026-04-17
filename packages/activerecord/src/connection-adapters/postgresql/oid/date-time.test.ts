import { DateTimeType } from "@blazetrails/activemodel";
import { describe, expect, it } from "vitest";

import { DateTime } from "./date-time.js";
import { Timestamp } from "./timestamp.js";
import { TimestampWithTimeZone } from "./timestamp-with-time-zone.js";

describe("PostgreSQL::OID::DateTime", () => {
  const type = new DateTime();

  it("extends Type::DateTime", () => {
    expect(type).toBeInstanceOf(DateTimeType);
  });

  it("casts 'infinity' / '-infinity' sentinels", () => {
    expect(type.cast("infinity")).toBe(Infinity);
    expect(type.cast("-infinity")).toBe(-Infinity);
  });

  it("rewrites BC-era timestamps with a biased year", () => {
    const result = type.cast("0044-03-15 12:00:00 BC");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getUTCFullYear()).toBe(-43);
  });

  it("type_cast_for_schema renders infinity sentinels", () => {
    expect(type.typeCastForSchema(Infinity)).toBe("::Float::INFINITY");
    expect(type.typeCastForSchema(-Infinity)).toBe("-::Float::INFINITY");
  });

  it("rejects BC timestamps with out-of-range components", () => {
    expect(type.cast("0044-13-01 00:00:00 BC")).toBeNull();
    expect(type.cast("0044-02-31 00:00:00 BC")).toBeNull();
    expect(type.cast("0044-01-01 25:00:00 BC")).toBeNull();
    expect(type.cast("0044-01-01 00:00:60 BC")).toBeNull();
  });

  it("rejects BC timestamps with a timezone offset", () => {
    // Offset handling on BC inputs is rare and requires arithmetic
    // we haven't needed; reject explicitly rather than silently
    // ignoring the offset.
    expect(type.cast("0044-03-15 12:00:00+02 BC")).toBeNull();
  });

  it("preserves fractional seconds exactly via Math.round", () => {
    // 0.289 * 1000 floats to 288.999… — Math.round keeps it at 289.
    const d = type.cast("0044-03-15 12:00:00.289 BC") as Date;
    expect(d.getUTCMilliseconds()).toBe(289);
  });

  it("carries fractional-second rounding into whole seconds", () => {
    // 0.9999 * 1000 rounds to 1000. Naive Math.round would pass 1000
    // to setUTCHours and silently roll the timestamp forward by a
    // second. Verify we carry into seconds instead.
    const d = type.cast("0044-03-15 12:00:00.9999 BC") as Date;
    expect(d.getUTCSeconds()).toBe(1);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  it("rejects sub-second carry that would overflow the minute", () => {
    // 59.9999 with carry → seconds = 60. That's invalid input per our
    // second < 60 guard; return null rather than letting it roll into
    // the next minute.
    expect(type.cast("0044-03-15 12:00:59.9999 BC")).toBeNull();
  });
});

describe("PostgreSQL::OID::Timestamp", () => {
  it("extends OID::DateTime and reports :timestamp", () => {
    const type = new Timestamp();
    expect(type).toBeInstanceOf(DateTime);
    expect(type.type()).toBe("timestamp");
  });

  it("inherits infinity + BC handling from OID::DateTime", () => {
    expect(new Timestamp().cast("infinity")).toBe(Infinity);
  });
});

describe("PostgreSQL::OID::TimestampWithTimeZone", () => {
  it("extends OID::DateTime and reports :timestamptz", () => {
    const type = new TimestampWithTimeZone();
    expect(type).toBeInstanceOf(DateTime);
    expect(type.type()).toBe("timestamptz");
  });

  it("inherits infinity + BC handling from OID::DateTime", () => {
    expect(new TimestampWithTimeZone().cast("-infinity")).toBe(-Infinity);
  });
});
