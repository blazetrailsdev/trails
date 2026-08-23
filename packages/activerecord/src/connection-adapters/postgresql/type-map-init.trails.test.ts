import {
  BigIntegerType,
  BooleanType,
  FloatType,
  IntegerType,
  StringType,
} from "@blazetrails/activemodel";
import { describe, expect, it } from "vitest";

import { Date as OidDate } from "./oid/date.js";
import { Json as ArJson } from "../../type/json.js";
import { Text as ArText } from "../../type/text.js";

import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import { Bit } from "./oid/bit.js";
import { BitVarying } from "./oid/bit-varying.js";
import { Bytea } from "./oid/bytea.js";
import { Cidr } from "./oid/cidr.js";
import { DecimalWithoutScale } from "../../type/decimal-without-scale.js";
import { Decimal } from "./oid/decimal.js";
import { Hstore } from "./oid/hstore.js";
import { Inet } from "./oid/inet.js";
import { Interval } from "./oid/interval.js";
import { Jsonb } from "./oid/jsonb.js";
import { Macaddr } from "./oid/macaddr.js";
import { Money } from "./oid/money.js";
import { Oid } from "./oid/oid.js";
import { Point } from "./oid/point.js";
import { SpecializedString } from "./oid/specialized-string.js";
import { Timestamp } from "./oid/timestamp.js";
import { TimestampWithTimeZone } from "./oid/timestamp-with-time-zone.js";
import { Uuid } from "./oid/uuid.js";
import { Xml } from "./oid/xml.js";
import {
  extractLimit,
  extractPrecision,
  extractScale,
  initializeInstanceTypeMap,
  initializeTypeMap,
} from "./type-map-init.js";

describe("extract_limit / extract_precision / extract_scale", () => {
  it("extracts a single integer from sql_type like varchar(255)", () => {
    expect(extractLimit("varchar(255)")).toBe(255);
    expect(extractLimit("varchar")).toBeUndefined();
    expect(extractLimit(undefined)).toBeUndefined();
  });

  it("extracts precision from numeric(10,2) or numeric(10)", () => {
    expect(extractPrecision("numeric(10,2)")).toBe(10);
    expect(extractPrecision("numeric(10)")).toBe(10);
    expect(extractPrecision("numeric")).toBeUndefined();
  });

  it("extracts scale only from numeric(p,s)", () => {
    expect(extractScale("numeric(10,2)")).toBe(2);
    expect(extractScale("numeric(10)")).toBeUndefined();
  });

  it("tolerates whitespace inside the parens, like Rails' to_i", () => {
    // Rails' /\((.*)\)/ + to_i accepts "varchar( 255 )" and "numeric(10, 2)".
    expect(extractLimit("varchar( 255 )")).toBe(255);
    expect(extractPrecision("numeric(10, 2)")).toBe(10);
    expect(extractScale("numeric(10, 2)")).toBe(2);
  });
});

describe("initialize_type_map seeds the PG type_map with known types", () => {
  const m = new HashLookupTypeMap();
  initializeTypeMap(m);

  it.each([
    ["int2", IntegerType],
    ["int4", IntegerType],
    ["int8", BigIntegerType],
    ["oid", Oid],
    ["float4", FloatType],
    ["float8", FloatType],
    ["text", ArText],
    ["bool", BooleanType],
    ["date", OidDate],
    ["money", Money],
    ["bytea", Bytea],
    ["point", Point],
    ["hstore", Hstore],
    ["json", ArJson],
    ["jsonb", Jsonb],
    ["cidr", Cidr],
    ["inet", Inet],
    ["uuid", Uuid],
    ["xml", Xml],
    ["macaddr", Macaddr],
  ])("registers %s → %s", (typname, klass) => {
    expect(m.lookup(typname)).toBeInstanceOf(klass);
  });

  it("aliases char / name / bpchar → varchar", () => {
    expect(m.lookup("char")).toBeInstanceOf(StringType);
    expect(m.lookup("name")).toBeInstanceOf(StringType);
    expect(m.lookup("bpchar")).toBeInstanceOf(StringType);
  });

  it("registers varchar with limit extracted from sql_type", () => {
    const type = m.lookup("varchar", 0, "varchar(255)") as StringType;
    expect(type).toBeInstanceOf(StringType);
    expect(type.limit).toBe(255);
  });

  it("registers bit / varbit with limit", () => {
    expect(m.lookup("bit", 0, "bit(8)")).toBeInstanceOf(Bit);
    expect(m.lookup("varbit", 0, "bit varying(16)")).toBeInstanceOf(BitVarying);
  });

  it("registers the specialized-string types with their type symbol", () => {
    for (const name of [
      "tsvector",
      "citext",
      "ltree",
      "line",
      "lseg",
      "box",
      "path",
      "polygon",
      "circle",
    ]) {
      const type = m.lookup(name) as SpecializedString;
      expect(type).toBeInstanceOf(SpecializedString);
      expect(type.type()).toBe(name);
    }
  });

  it("registers numeric as Decimal with precision and scale", () => {
    const type = m.lookup("numeric", 0, "numeric(10,2)") as Decimal;
    expect(type).toBeInstanceOf(Decimal);
    expect(type.precision).toBe(10);
    expect(type.scale).toBe(2);
  });

  it("registers numeric as DecimalWithoutScale when fmod scale bits are zero", () => {
    // Rails: `if fmod && (fmod - 4 & 0xffff).zero?` — a scale-less NUMERIC(10)
    // stores atttypmod where the low 16 bits of (fmod - 4) are zero.
    // fmod = 4 → (4-4)&0xffff = 0 → DecimalWithoutScale.
    const type = m.lookup("numeric", 4, "numeric(10)") as DecimalWithoutScale;
    expect(type).toBeInstanceOf(DecimalWithoutScale);
    expect(type.precision).toBe(10);
  });

  it("registers interval as Interval with precision", () => {
    const type = m.lookup("interval", 0, "interval(3)") as Interval;
    expect(type).toBeInstanceOf(Interval);
    expect(type.precision).toBe(3);
  });
});

describe("initialize_instance_type_map layers timestamp + time on top", () => {
  const m = new HashLookupTypeMap();
  initializeInstanceTypeMap(m);

  it("registers timestamp → Timestamp", () => {
    expect(m.lookup("timestamp")).toBeInstanceOf(Timestamp);
  });

  it("registers timestamptz → TimestampWithTimeZone", () => {
    expect(m.lookup("timestamptz")).toBeInstanceOf(TimestampWithTimeZone);
  });
});
