import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Array as OidArray, Data } from "./array.js";
import { DateTime as PgDateTime } from "./date-time.js";

const stringSubtype = {
  type: "string",
  cast: (value: unknown) => (value == null ? null : String(value)),
  serialize: (value: unknown) => (value == null ? null : String(value)),
  deserialize: (value: unknown) => (value == null ? null : String(value)),
  typeCastForSchema: (value: unknown) => JSON.stringify(value),
};

describe("PostgreSQL::OID::Array", () => {
  it("delegates type to the subtype", () => {
    const type = new OidArray(stringSubtype);

    expect(type.type()).toBe("string");
  });

  it("casts scalar values through the subtype", () => {
    const type = new OidArray(stringSubtype);

    expect(type.cast(1)).toBe("1");
  });

  it("serialize returns Data with encoder and casted values", () => {
    const type = new OidArray(stringSubtype);
    const data = type.serialize(["a", "b"]) as Data;

    expect(data).toBeInstanceOf(Data);
    expect(data.encoder).toBe(type);
    expect(data.values).toEqual(["a", "b"]);
    expect(String(data)).toBe("{a,b}");
  });

  it("serialize returns non-array values unchanged", () => {
    const type = new OidArray(stringSubtype);

    expect(type.serialize("not an array")).toBe("not an array");
  });

  it("typeCastForSchema formats array elements through the subtype", () => {
    const type = new OidArray(stringSubtype);

    expect(type.typeCastForSchema(["a", "b"])).toBe('["a", "b"]');
  });

  it("map delegates non-array values to subtype map when present", () => {
    const type = new OidArray({
      ...stringSubtype,
      map: (value: unknown, block?: (value: unknown) => unknown) => block?.(`mapped:${value}`),
    });

    expect(type.map("x", (value) => `${value}!`)).toBe("mapped:x!");
  });

  it("detects changed in-place arrays by deserializing the raw value", () => {
    const type = new OidArray(stringSubtype);

    expect(type.isChangedInPlace("{a,b}", ["a", "b"])).toBe(false);
    expect(type.isChangedInPlace("{a,b}", ["a", "c"])).toBe(true);
  });

  it("forces equality for array values", () => {
    const type = new OidArray(stringSubtype);

    expect(type.isForceEquality(["a"])).toBe(true);
    expect(type.isForceEquality("a")).toBe(false);
  });

  it("delegates limit, precision and scale to the subtype", () => {
    const type = new OidArray({ ...stringSubtype, limit: 4, precision: 6, scale: 2 });

    expect(type.limit).toBe(4);
    expect(type.precision).toBe(6);
    expect(type.scale).toBe(2);
  });

  it("delegates user_input_in_time_zone to the subtype", () => {
    const type = new OidArray({
      ...stringSubtype,
      userInputInTimeZone: (value: unknown, zone?: string) => `${String(value)}@${zone}`,
    });

    expect(type.userInputInTimeZone("ts", "America/Los_Angeles")).toBe("ts@America/Los_Angeles");
  });

  it("encodes a datetime element in the PG quoted_date form (fixed-6 microseconds)", () => {
    // Real serialize→String(Data) path an inline datetime[] INSERT takes: the
    // element must get the db literal a scalar datetime gets, not ISO-8601.
    const type = new OidArray(new PgDateTime());
    const data = type.serialize([Temporal.Instant.from("2026-04-26T14:23:55.123456789Z")]) as Data;

    expect(String(data)).toBe('{"2026-04-26 14:23:55.123456"}');
  });

  it("encodes a proleptic-year datetime element with the PG BC suffix", () => {
    const type = new OidArray(new PgDateTime());
    const data = type.serialize([Temporal.Instant.from("-000043-03-15T12:34:56.123456Z")]) as Data;

    expect(String(data)).toBe('{"0044-03-15 12:34:56.123456 BC"}');
  });

  it("encodes a PG infinity datetime element as the infinity wire literal", () => {
    const type = new OidArray(new PgDateTime());
    const data = type.serialize([Number.POSITIVE_INFINITY]) as Data;

    expect(String(data)).toBe("{infinity}");
  });
});
