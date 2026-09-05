import {
  BigIntegerType,
  BooleanType,
  FloatType,
  IntegerType,
  StringType,
  ValueType,
} from "@blazetrails/activemodel";
import * as ArType from "../../type.js";

import { Array as OidArray } from "./oid/array.js";
import { RangeType } from "./oid/range.js";
import { Date as OidDate } from "./oid/date.js";
import { DecimalWithoutScale } from "../../type/decimal-without-scale.js";
import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import { Json as ArJson } from "../../type/json.js";
import { Text as ArText } from "../../type/text.js";
import { Bit } from "./oid/bit.js";
import { BitVarying } from "./oid/bit-varying.js";
import { Bytea } from "./oid/bytea.js";
import { Cidr } from "./oid/cidr.js";
import { DateTime as OidDateTime } from "./oid/date-time.js";
import { Decimal } from "./oid/decimal.js";
import { Enum } from "./oid/enum.js";
import { Hstore } from "./oid/hstore.js";
import { Inet } from "./oid/inet.js";
import { Interval } from "./oid/interval.js";
import { Jsonb } from "./oid/jsonb.js";
import { LegacyPoint } from "./oid/legacy-point.js";
import { Macaddr } from "./oid/macaddr.js";
import { Money } from "./oid/money.js";
import { Oid } from "./oid/oid.js";
import { Point } from "./oid/point.js";
import { SpecializedString } from "./oid/specialized-string.js";
import { Timestamp } from "./oid/timestamp.js";
import { TimestampWithTimeZone } from "./oid/timestamp-with-time-zone.js";
import { Uuid } from "./oid/uuid.js";
import { Vector } from "./oid/vector.js";
import { Xml } from "./oid/xml.js";

ArType.addModifier({ array: true }, OidArray, { adapter: "postgresql" });
ArType.addModifier({ range: true }, RangeType, { adapter: "postgresql" });

ArType.register("bit", Bit, { adapter: "postgresql" });
ArType.register("bit_varying", BitVarying, { adapter: "postgresql" });
ArType.register("binary", Bytea, { adapter: "postgresql" });
ArType.register("cidr", Cidr, { adapter: "postgresql" });
ArType.register("date", OidDate, { adapter: "postgresql" });
ArType.register("datetime", OidDateTime, { adapter: "postgresql" });
ArType.register("decimal", Decimal, { adapter: "postgresql" });
ArType.register("enum", Enum, { adapter: "postgresql" });
ArType.register("hstore", Hstore, { adapter: "postgresql" });
ArType.register("inet", Inet, { adapter: "postgresql" });
ArType.register("interval", Interval, { adapter: "postgresql" });
ArType.register("jsonb", Jsonb, { adapter: "postgresql" });
ArType.register("money", Money, { adapter: "postgresql" });
ArType.register("point", Point, { adapter: "postgresql" });
ArType.register("legacy_point", LegacyPoint, { adapter: "postgresql" });
ArType.register("uuid", Uuid, { adapter: "postgresql" });
ArType.register("vector", Vector, { adapter: "postgresql" });
ArType.register("xml", Xml, { adapter: "postgresql" });

export function extractLimit(sqlType: string | undefined): number | undefined {
  if (!sqlType) return undefined;
  const match = /\((.*)\)/.exec(sqlType);
  if (!match) return undefined;
  const n = Number.parseInt(match[1].trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

export function extractPrecision(sqlType: string | undefined): number | undefined {
  if (!sqlType) return undefined;
  const match = /\(\s*(\d+)\s*(?:,\s*\d+\s*)?\)/.exec(sqlType);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

export function extractScale(sqlType: string | undefined): number | undefined {
  if (!sqlType) return undefined;
  const match = /\(\s*\d+\s*,\s*(\d+)\s*\)/.exec(sqlType);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

export function registerClassWithLimit(
  mapping: HashLookupTypeMap,
  key: string,
  klass: new (options?: { limit?: number }) => ValueType,
): void {
  mapping.registerType(key, undefined, (_key, ...args) => {
    const sqlType = sqlTypeFromArgs(args);
    return new klass({ limit: extractLimit(sqlType) });
  });
}

export function registerClassWithPrecision(
  mapping: HashLookupTypeMap,
  key: string,
  klass: new (options: { precision?: number } & Record<string, unknown>) => ValueType,
  extraOptions: Record<string, unknown> = {},
): void {
  mapping.registerType(key, undefined, (_key, ...args) => {
    const sqlType = sqlTypeFromArgs(args);
    return new klass({ precision: extractPrecision(sqlType), ...extraOptions });
  });
}

class PgInteger8 extends BigIntegerType {
  protected override maxValue(): number {
    return 2 ** (this._limit() * 8 - 1);
  }

  override serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value) as number | null;
  }

  override serialize(value: unknown): unknown {
    return this.ensureInRange(this.cast(value));
  }
}

export function initializeTypeMap(m: HashLookupTypeMap): void {
  m.registerType("int2", new IntegerType({ limit: 2 }));
  m.registerType("int4", new IntegerType({ limit: 4 }));
  m.registerType("int8", new PgInteger8({ limit: 8 }));
  m.registerType("oid", new Oid());
  m.registerType("float4", new FloatType({ limit: 24 }));
  m.registerType("float8", new FloatType());
  m.registerType("text", new ArText());
  registerClassWithLimit(m, "varchar", StringType);
  m.aliasType("char", "varchar");
  m.aliasType("name", "varchar");
  m.aliasType("bpchar", "varchar");
  m.registerType(18, new StringType());
  m.registerType(19, new StringType());
  m.registerType("bool", new BooleanType());
  registerClassWithLimit(m, "bit", Bit);
  registerClassWithLimit(m, "varbit", BitVarying);
  m.registerType("date", new OidDate());
  m.registerType("money", new Money());
  m.registerType("bytea", new Bytea());
  m.registerType("point", new Point());
  m.registerType("hstore", new Hstore());
  m.registerType("json", new ArJson());
  m.registerType("jsonb", new Jsonb());
  m.registerType("cidr", new Cidr());
  m.registerType("inet", new Inet());
  m.registerType("uuid", new Uuid());
  m.registerType("xml", new Xml());
  m.registerType("tsvector", new SpecializedString("tsvector"));
  m.registerType("macaddr", new Macaddr());
  m.registerType("citext", new SpecializedString("citext"));
  m.registerType("ltree", new SpecializedString("ltree"));
  m.registerType("line", new SpecializedString("line"));
  m.registerType("lseg", new SpecializedString("lseg"));
  m.registerType("box", new SpecializedString("box"));
  m.registerType("path", new SpecializedString("path"));
  m.registerType("polygon", new SpecializedString("polygon"));
  m.registerType("circle", new SpecializedString("circle"));

  m.registerType("numeric", undefined, (_key, ...args) => {
    const fmod = fmodFromArgs(args);
    const sqlType = sqlTypeFromArgs(args);
    const precision = extractPrecision(sqlType);
    if (fmod != null && ((fmod - 4) & 0xffff) === 0) {
      return new DecimalWithoutScale({ precision });
    }
    return new Decimal({ precision, scale: extractScale(sqlType) });
  });

  m.registerType("interval", undefined, (_key, ...args) => {
    const sqlType = sqlTypeFromArgs(args);
    return new Interval({ precision: extractPrecision(sqlType) });
  });
}

/** @noRailsEquivalent CONVERGEABLE converge-pg-native-types-and-instance-type-map-onto-adapter */
export function initializeInstanceTypeMap(
  m: HashLookupTypeMap,
  defaultTimezone: "utc" | "local" = "utc",
): void {
  initializeTypeMap(m);
  registerClassWithPrecision(m, "time", ArType.Time, { timezone: defaultTimezone });
  registerClassWithPrecision(m, "timestamp", Timestamp, { timezone: defaultTimezone });
  registerClassWithPrecision(m, "timestamptz", TimestampWithTimeZone);
}

function sqlTypeFromArgs(args: unknown[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === "string") return args[i] as string;
  }
  return undefined;
}

function fmodFromArgs(args: unknown[]): number | undefined {
  for (const a of args) {
    if (typeof a === "number") return a;
  }
  return undefined;
}
