import { describe, expect, it } from "vitest";
import { Vector } from "./vector.js";

describe("PostgreSQL::OID::Vector", () => {
  it("stores the delimiter and subtype from pg_type metadata", () => {
    const subtype = { cast: (value: unknown) => value };
    const type = new Vector(";", subtype);

    expect(type.delim).toBe(";");
    expect(type.subtype).toBe(subtype);
  });

  it("casts values unchanged", () => {
    const type = new Vector(",", { cast: (value: unknown) => Number(value) });

    expect(type.cast("{1,2,3}")).toBe("{1,2,3}");
    expect(type.cast(["1", "2", "3"])).toEqual(["1", "2", "3"]);
  });
});
