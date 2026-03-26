import { describe, it, expect } from "vitest";
import { ArrayType } from "./array.js";
import { IntegerType } from "./integer.js";
import { StringType } from "./string.js";

describe("ArrayType", () => {
  it("casts an array of values using the subtype", () => {
    const type = new ArrayType(new IntegerType());
    expect(type.cast([1, "2", 3])).toEqual([1, 2, 3]);
  });

  it("defaults to string subtype", () => {
    const type = new ArrayType();
    expect(type.cast([1, 2, 3])).toEqual(["1", "2", "3"]);
  });

  it("casts null to null", () => {
    const type = new ArrayType();
    expect(type.cast(null)).toBeNull();
  });

  it("parses PG array literal strings", () => {
    const type = new ArrayType(new StringType());
    expect(type.cast("{a,b,c}")).toEqual(["a", "b", "c"]);
  });

  it("parses empty PG array literal", () => {
    const type = new ArrayType();
    expect(type.cast("{}")).toEqual([]);
  });

  it("parses PG array with quoted strings", () => {
    const type = new ArrayType();
    expect(type.cast('{"hello world","foo,bar"}')).toEqual(["hello world", "foo,bar"]);
  });

  it("parses PG integer array literal", () => {
    const type = new ArrayType(new IntegerType());
    expect(type.cast("{1,2,3}")).toEqual([1, 2, 3]);
  });

  it("parses multi-dimensional arrays", () => {
    const type = new ArrayType(new IntegerType());
    expect(type.cast("{{1,2},{3,4}}")).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("handles NULL elements", () => {
    const type = new ArrayType(new StringType());
    expect(type.cast("{a,NULL,b}")).toEqual(["a", null, "b"]);
  });

  it("treats unquoted empty elements as null", () => {
    const type = new ArrayType(new StringType());
    expect(type.cast("{a,,b}")).toEqual(["a", null, "b"]);
  });

  it("casts nested JS arrays", () => {
    const type = new ArrayType(new IntegerType());
    expect(
      type.cast([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("handles quoted NULL elements as strings", () => {
    const type = new ArrayType(new StringType());
    expect(type.cast('{"a","NULL","b"}')).toEqual(["a", "NULL", "b"]);
  });

  it("serializes nested JS arrays", () => {
    const type = new ArrayType(new IntegerType());
    expect(
      type.serialize([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("serializes arrays", () => {
    const type = new ArrayType(new IntegerType());
    expect(type.serialize([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("serializes null to null", () => {
    const type = new ArrayType();
    expect(type.serialize(null)).toBeNull();
  });
});
