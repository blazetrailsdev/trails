import {
  BigIntegerType,
  BooleanType,
  FloatType,
  IntegerType,
  StringType,
} from "@blazetrails/activemodel";
import { describe, expect, it } from "vitest";

import { Date as OidDate } from "./postgresql/oid/date.js";
import { Json as ArJson } from "../type/json.js";
import { Text as ArText } from "../type/text.js";

import { HashLookupTypeMap } from "../type/hash-lookup-type-map.js";
import { Bit } from "./postgresql/oid/bit.js";
import { BitVarying } from "./postgresql/oid/bit-varying.js";
import { Bytea } from "./postgresql/oid/bytea.js";
import { Cidr } from "./postgresql/oid/cidr.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import { Decimal } from "./postgresql/oid/decimal.js";
import { Hstore } from "./postgresql/oid/hstore.js";
import { Inet } from "./postgresql/oid/inet.js";
import { Interval } from "./postgresql/oid/interval.js";
import { Jsonb } from "./postgresql/oid/jsonb.js";
import { Macaddr } from "./postgresql/oid/macaddr.js";
import { Money } from "./postgresql/oid/money.js";
import { Oid } from "./postgresql/oid/oid.js";
import { Point } from "./postgresql/oid/point.js";
import { SpecializedString } from "./postgresql/oid/specialized-string.js";
import { Uuid } from "./postgresql/oid/uuid.js";
import { Xml } from "./postgresql/oid/xml.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

describe("initialize_type_map seeds the PG type_map with known types", () => {
  const m = new HashLookupTypeMap();
  PostgreSQLAdapter.initializeTypeMap(m);

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
