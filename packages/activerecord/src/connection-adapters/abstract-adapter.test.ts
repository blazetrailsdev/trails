import { beforeAll, describe, expect, it } from "vitest";
import { TypeMap } from "../type/type-map.js";
import {
  BooleanType,
  BinaryType,
  IntegerType,
  FloatType,
  DecimalType,
} from "@blazetrails/activemodel";
import { Text as TextType } from "../type/text.js";
import { Date as DateType } from "../type/date.js";
import { Time as TimeType } from "../type/time.js";
import { DateTime as DateTimeType } from "../type/date-time.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import { AbstractAdapter } from "./abstract-adapter.js";

// All 5 methods are class-level in Rails (class << self private), so test via a subclass.
class TestAdapter extends AbstractAdapter {
  static get adapterName() {
    return "TestAdapter";
  }
  override get adapterName() {
    return "TestAdapter" as const;
  }
}

describe("AbstractAdapter.extractLimit", () => {
  it("parses limit from sql type with parens", () => {
    expect(TestAdapter.extractLimit("varchar(255)")).toBe(255);
  });

  it("returns undefined when no parens", () => {
    expect(TestAdapter.extractLimit("text")).toBeUndefined();
  });

  it("parses leading digits from decimal(10,2)", () => {
    expect(TestAdapter.extractLimit("decimal(10,2)")).toBe(10);
  });
});

describe("AbstractAdapter.extractPrecision", () => {
  it("returns first number for p,s form", () => {
    expect(TestAdapter.extractPrecision("decimal(10,2)")).toBe(10);
  });

  it("returns number for p-only form", () => {
    expect(TestAdapter.extractPrecision("decimal(10)")).toBe(10);
  });

  it("returns undefined when no parens", () => {
    expect(TestAdapter.extractPrecision("decimal")).toBeUndefined();
  });
});

describe("AbstractAdapter.extractScale", () => {
  it("returns second number for p,s form", () => {
    expect(TestAdapter.extractScale("decimal(10,2)")).toBe(2);
  });

  it("returns 0 for single-number form", () => {
    expect(TestAdapter.extractScale("decimal(10)")).toBe(0);
  });

  it("returns undefined when no parens", () => {
    expect(TestAdapter.extractScale("decimal")).toBeUndefined();
  });
});

describe("AbstractAdapter.registerClassWithLimit", () => {
  it("registers a type factory that extracts limit", () => {
    const m = new TypeMap();
    TestAdapter.registerClassWithLimit(m, /varchar/i, IntegerType);
    const type = m.lookup("varchar(64)");
    expect(type).toBeInstanceOf(IntegerType);
  });
});

describe("AbstractAdapter.initializeTypeMap", () => {
  let m: TypeMap;

  beforeAll(() => {
    m = new TypeMap();
    TestAdapter.initializeTypeMap(m);
  });

  it("registers boolean", () => {
    expect(m.lookup("boolean")).toBeInstanceOf(BooleanType);
  });

  it("registers text", () => {
    expect(m.lookup("text")).toBeInstanceOf(TextType);
  });

  it("registers binary", () => {
    expect(m.lookup("binary")).toBeInstanceOf(BinaryType);
  });

  it("registers float", () => {
    expect(m.lookup("float")).toBeInstanceOf(FloatType);
  });

  it("registers integer", () => {
    expect(m.lookup("integer")).toBeInstanceOf(IntegerType);
  });

  it("registers date", () => {
    expect(m.lookup("date")).toBeInstanceOf(DateType);
  });

  it("registers time", () => {
    expect(m.lookup("time")).toBeInstanceOf(TimeType);
  });

  it("registers datetime", () => {
    expect(m.lookup("datetime")).toBeInstanceOf(DateTimeType);
  });

  it("registers json", () => {
    expect(m.lookup("json")).toBeInstanceOf(JsonType);
  });

  it("registers decimal with scale as DecimalType", () => {
    expect(m.lookup("decimal(10,2)")).toBeInstanceOf(DecimalType);
  });

  it("registers decimal without scale as DecimalWithoutScale", () => {
    expect(m.lookup("decimal(10)")).toBeInstanceOf(DecimalWithoutScale);
  });

  it("aliases blob to binary", () => {
    expect(m.lookup("blob")).toBeInstanceOf(BinaryType);
  });

  it("aliases clob to text", () => {
    expect(m.lookup("clob")).toBeInstanceOf(TextType);
  });

  it("aliases timestamp to datetime", () => {
    expect(m.lookup("timestamp")).toBeInstanceOf(DateTimeType);
  });

  it("aliases double to float", () => {
    expect(m.lookup("double")).toBeInstanceOf(FloatType);
  });
});
