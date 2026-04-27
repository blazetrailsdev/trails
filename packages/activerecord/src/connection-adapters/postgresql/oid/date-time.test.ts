import { DateTimeType } from "@blazetrails/activemodel";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/activesupport/temporal";
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
    expect(type.cast("infinity")).toBe(DateInfinity);
    expect(type.cast("-infinity")).toBe(DateNegativeInfinity);
  });

  it("cast_value is the Rails-named hook cast delegates to", () => {
    expect(type.castValue("infinity")).toBe(DateInfinity);
    expect(type.castValue("-infinity")).toBe(DateNegativeInfinity);
  });

  it("rewrites BC-era timestamps with a biased year", () => {
    const result = type.castValue("0044-03-15 12:00:00 BC");
    expect(result).toBeInstanceOf(Temporal.PlainDateTime);
    expect((result as Temporal.PlainDateTime).year).toBe(-43);
    expect((result as Temporal.PlainDateTime).month).toBe(3);
    expect((result as Temporal.PlainDateTime).day).toBe(15);
  });

  it("type_cast_for_schema renders infinity sentinels", () => {
    expect(type.typeCastForSchema(DateInfinity)).toBe("::Float::INFINITY");
    expect(type.typeCastForSchema(DateNegativeInfinity)).toBe("-::Float::INFINITY");
  });

  it("rejects BC timestamps with out-of-range components", () => {
    expect(type.castValue("0044-13-01 00:00:00 BC")).toBeNull();
    expect(type.castValue("0044-02-31 00:00:00 BC")).toBeNull();
    expect(type.castValue("0044-01-01 25:00:00 BC")).toBeNull();
    expect(type.castValue("0044-01-01 00:00:60 BC")).toBeNull();
  });

  it("preserves microsecond precision in BC timestamps", () => {
    const result = type.castValue("0044-03-15 12:00:00.123456 BC");
    expect(result).toBeInstanceOf(Temporal.PlainDateTime);
    const pdt = result as Temporal.PlainDateTime;
    expect(pdt.millisecond).toBe(123);
    expect(pdt.microsecond).toBe(456);
  });
});

describe("PostgreSQL::OID::Timestamp", () => {
  it("extends OID::DateTime and reports :timestamp", () => {
    const type = new Timestamp();
    expect(type).toBeInstanceOf(DateTime);
    expect(type.type()).toBe("timestamp");
  });

  it("inherits infinity + BC handling from OID::DateTime", () => {
    expect(new Timestamp().castValue("infinity")).toBe(DateInfinity);
  });
});

describe("PostgreSQL::OID::TimestampWithTimeZone", () => {
  it("extends OID::DateTime and reports :timestamptz", () => {
    const type = new TimestampWithTimeZone();
    expect(type).toBeInstanceOf(DateTime);
    expect(type.type()).toBe("timestamptz");
  });

  it("inherits infinity + BC handling from OID::DateTime", () => {
    expect(new TimestampWithTimeZone().castValue("-infinity")).toBe(DateNegativeInfinity);
  });
});
