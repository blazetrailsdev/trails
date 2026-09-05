import { DateTimeType } from "@blazetrails/activemodel";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { describe, expect, it } from "vitest";

import { DateTime } from "./date-time.js";
import { Timestamp } from "./timestamp.js";
import { TimestampWithTimeZone } from "./timestamp-with-time-zone.js";
import { quotedDate } from "../quoting.js";

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
    const result = type.castValue("0044-03-15 12:00:00 BC") as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    expect(result.year).toBe(-43);
    expect(result.mon).toBe(3);
    expect(result.mday).toBe(15);
  });

  it("serialize returns the cast Instant (quoting renders the SQL literal)", () => {
    const instant = type.castValue("0044-01-01 00:00:00 BC") as RubyTime;
    expect(type.serialize(instant)).toBe(instant);
  });

  it("quoted_date converts BC Temporal.Instant to PG BC format", () => {
    const instant = type.castValue("0044-01-01 00:00:00 BC") as RubyTime;
    expect(instant.year).toBe(-43);
    expect(quotedDate(instant)).toBe("0044-01-01 00:00:00 BC");
  });

  it("quoted_date converts ISO year 0 to 1 BC", () => {
    const instant = type.castValue("0001-04-07 00:00:00 BC") as RubyTime;
    expect(instant.year).toBe(0);
    expect(quotedDate(instant)).toBe("0001-04-07 00:00:00 BC");
  });

  it("quoted_date preserves microseconds in BC format", () => {
    const instant = type.castValue("0005-02-29 12:34:56.123456 BC") as RubyTime;
    expect(quotedDate(instant)).toBe("0005-02-29 12:34:56.123456 BC");
  });

  it("quoted_date leaves AD dates unchanged", () => {
    const instant = Temporal.Instant.from("2023-06-15T12:00:00Z");
    expect(quotedDate(instant)).toBe("2023-06-15 12:00:00");
  });

  it("serialize returns 'infinity' / '-infinity' for sentinels", () => {
    expect(type.serialize(DateInfinity)).toBe("infinity");
    expect(type.serialize(DateNegativeInfinity)).toBe("-infinity");
  });

  it("serialize round-trips the 'infinity' / '-infinity' wire strings", () => {
    expect(type.serialize("infinity")).toBe("infinity");
    expect(type.serialize("-infinity")).toBe("-infinity");
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
    const result = type.castValue("0044-03-15 12:00:00.123456 BC") as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    expect(result.usec).toBe(123456);
  });
});

describe("PostgreSQL::OID::Timestamp", () => {
  it("extends OID::DateTime and reports :timestamp", () => {
    const type = new Timestamp();
    expect(type).toBeInstanceOf(DateTime);
    expect(type.type()).toBe("datetime");
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
