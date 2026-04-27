import { DateType } from "@blazetrails/activemodel";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { describe, expect, it } from "vitest";

import { Date as OidDate } from "./date.js";

describe("PostgreSQL::OID::Date", () => {
  const type = new OidDate();

  it("extends Type::Date", () => {
    expect(type).toBeInstanceOf(DateType);
  });

  it("casts 'infinity' to DateInfinity sentinel", () => {
    expect(type.castValue("infinity")).toBe(DateInfinity);
  });

  it("casts '-infinity' to DateNegativeInfinity sentinel", () => {
    expect(type.castValue("-infinity")).toBe(DateNegativeInfinity);
  });

  it("rewrites BC-era dates with a biased year", () => {
    const result = type.castValue("0044-03-15 BC");
    expect(result).toBeInstanceOf(Temporal.PlainDate);
    expect((result as Temporal.PlainDate).year).toBe(-43);
    expect((result as Temporal.PlainDate).month).toBe(3);
    expect((result as Temporal.PlainDate).day).toBe(15);
  });

  it("type_cast_for_schema renders the infinity sentinels", () => {
    expect(type.typeCastForSchema(DateInfinity)).toBe("::Float::INFINITY");
    expect(type.typeCastForSchema(DateNegativeInfinity)).toBe("-::Float::INFINITY");
  });

  it("cast_value is the Rails-named hook cast delegates to", () => {
    expect(type.castValue("infinity")).toBe(DateInfinity);
    expect(type.castValue("2024-06-15")).toBeInstanceOf(Temporal.PlainDate);
  });

  it("rejects BC dates with out-of-range month or day", () => {
    expect(type.castValue("0044-13-15 BC")).toBeNull();
    expect(type.castValue("0044-02-31 BC")).toBeNull();
  });
});
