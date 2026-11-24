import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::CompositeCoder#dup", () => {
  it("round-trips dimensions through to_h", () => {
    const array = new PG.TextEncoder.Array(undefined, { dimensions: 2, delimiter: ";" });
    const copy = array.dup();
    expect(copy).toBeInstanceOf(PG.TextEncoder.Array);
    expect(copy.dimensions).toBe(2);
    expect(copy.toH()).toEqual(array.toH());
  });
});

describe("PG::Coder#inspect", () => {
  it("shows name, oid and format", () => {
    const coder = new PG.TextEncoder.Integer(undefined, { name: "int4", oid: 23 });
    expect(coder.inspect()).toMatch(/^#<PG::TextEncoder::Integer:0x[0-9a-f]+ "int4" {2}oid=23>$/);
    expect(coder.inspectShort()).toBe("int4:TE");
  });

  it("appends composite details", () => {
    const array = new PG.TextEncoder.Array(undefined, { dimensions: 2 });
    expect(array.inspect()).toMatch(/ elements_type=nil needs quotation 2 dimensions>$/);
  });
});
