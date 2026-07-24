/**
 * PostgreSQL static type_map initialization + column-metadata helpers.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter's class-level
 * `initialize_type_map(m)` (postgresql_adapter.rb lines ~676–739) and the
 * `extract_limit` / `extract_precision` / `extract_scale` / `register_class_with_limit`
 * / `register_class_with_precision` helpers.
 */

import {
  BigIntegerType,
  BooleanType,
  FloatType,
  IntegerType,
  StringType,
  TimeType,
  Type,
} from "@blazetrails/activemodel";
import * as ArType from "../../type.js";

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

// Mirrors: postgresql_adapter.rb:1168-1185. The two `add_modifier` lines that
// open that block (array/range) are unported: trails has no registry
// modifiers, and `attribute(..., array: true)` does not route through them.
ArType.register("bit", Bit, { adapter: "postgres" });
ArType.register("bit_varying", BitVarying, { adapter: "postgres" });
ArType.register("binary", Bytea, { adapter: "postgres" });
ArType.register("cidr", Cidr, { adapter: "postgres" });
ArType.register("date", OidDate, { adapter: "postgres" });
ArType.register("datetime", OidDateTime, { adapter: "postgres" });
ArType.register("decimal", Decimal, { adapter: "postgres" });
ArType.register("enum", Enum, { adapter: "postgres" });
ArType.register("hstore", Hstore, { adapter: "postgres" });
ArType.register("inet", Inet, { adapter: "postgres" });
ArType.register("interval", Interval, { adapter: "postgres" });
ArType.register("jsonb", Jsonb, { adapter: "postgres" });
ArType.register("money", Money, { adapter: "postgres" });
ArType.register("point", Point, { adapter: "postgres" });
ArType.register("legacy_point", LegacyPoint, { adapter: "postgres" });
ArType.register("uuid", Uuid, { adapter: "postgres" });
ArType.register("vector", Vector, { adapter: "postgres" });
ArType.register("xml", Xml, { adapter: "postgres" });

/**
 * Mirrors: PostgreSQLAdapter.extract_limit — `$1.to_i if sql_type =~ /\((.*)\)/`.
 * Rails captures everything between parens and lets `to_i` parse leading digits;
 * that tolerates whitespace, trailing text, and comma-separated precision/scale.
 */
export function extractLimit(sqlType: string | undefined): number | undefined {
  if (!sqlType) return undefined;
  // Rails uses a greedy `/\((.*)\)/` — captures to the LAST `)`. JS
  // regexes are greedy by default; mirror that here rather than
  // stopping at the first close paren.
  const match = /\((.*)\)/.exec(sqlType);
  if (!match) return undefined;
  // Ruby's String#to_i returns 0 for empty / non-numeric leading chars.
  // Preserve that: parens present → always returns a number (0 on garbage);
  // no parens → returns undefined (distinct from "0").
  const n = Number.parseInt(match[1].trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Mirrors: PostgreSQLAdapter.extract_precision — first number in `(p,s)` or `(p)`. */
export function extractPrecision(sqlType: string | undefined): number | undefined {
  if (!sqlType) return undefined;
  const match = /\(\s*(\d+)\s*(?:,\s*\d+\s*)?\)/.exec(sqlType);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

/** Mirrors: PostgreSQLAdapter.extract_scale — second number in `(p,s)`. */
export function extractScale(sqlType: string | undefined): number | undefined {
  if (!sqlType) return undefined;
  const match = /\(\s*\d+\s*,\s*(\d+)\s*\)/.exec(sqlType);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

/**
 * Mirrors: PostgreSQLAdapter.register_class_with_limit(mapping, key, klass).
 * Registers a block that extracts `limit` from the column's `sql_type`.
 */
export function registerClassWithLimit(
  mapping: HashLookupTypeMap,
  key: string,
  klass: new (options?: { limit?: number }) => Type,
): void {
  mapping.registerType(key, undefined, (_key, ...args) => {
    const sqlType = sqlTypeFromArgs(args);
    return new klass({ limit: extractLimit(sqlType) });
  });
}

/**
 * Mirrors: PostgreSQLAdapter.register_class_with_precision(mapping, key, klass, **opts).
 * Registers a block that extracts `precision` from the column's `sql_type`.
 */
export function registerClassWithPrecision(
  mapping: HashLookupTypeMap,
  key: string,
  klass: new (options: { precision?: number } & Record<string, unknown>) => Type,
  extraOptions: Record<string, unknown> = {},
): void {
  mapping.registerType(key, undefined, (_key, ...args) => {
    const sqlType = sqlTypeFromArgs(args);
    return new klass({ precision: extractPrecision(sqlType), ...extraOptions });
  });
}

/**
 * Adapter-specific column type for PG int8 (OID 20 / typname "int8").
 *
 * Rails registers int8 as `Type::Integer.new(limit: 8)` (postgresql_adapter.rb:676-680).
 * In Ruby, Integer arithmetic is arbitrary-precision so the limit-8 range check is exact.
 * In JS, float64 loses precision at 2^63: Number(2^63n) === Number((2^63-1)n), so the
 * inherited number-path isInRange gives the wrong answer for BigInt application values.
 *
 * We extend BigIntegerType (not IntegerType) because:
 * - PG driver returns int8 values as strings; BigIntegerType.castValue parses them to BigInt,
 *   preserving precision for IDs > Number.MAX_SAFE_INTEGER.
 * - BigIntegerType is unconditionally unlimited (maxValue = Infinity, Rails-faithful).
 *   This subclass re-establishes the 8-byte bound that belongs on the column type,
 *   mirroring Rails' IntegerType(limit: 8) but with BigInt-precision arithmetic.
 */
class PgInteger8 extends BigIntegerType {
  // Re-establish the 8-byte bound that BigIntegerType drops (max_value =
  // Infinity). IntegerType's isInRange/isSerializable already compare in BigInt
  // space, so 2^63 is correctly detected out of range (float64 cannot
  // distinguish 2^63 from 2^63-1).
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

/**
 * Mirrors: PostgreSQLAdapter.initialize_type_map(m) — the class method that
 * seeds the type_map with ~30 known PG types by typname. User-defined types
 * (arrays, ranges, enums, domains, composites) are layered on top at runtime
 * via OID::TypeMapInitializer.
 *
 * Registrations are 1:1 with Rails postgresql_adapter.rb lines 676–739.
 */
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
  // Register fixed OIDs for internal PG string-like types so columns() can
  // resolve their semantic type without a pg_type round-trip. OIDs are
  // stable built-ins that don't vary across PG versions.
  m.registerType(18, new StringType()); // "char" — single internal byte
  m.registerType(19, new StringType()); // name   — 63-byte identifier type
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

  // Numeric: Rails picks Decimal vs DecimalWithoutScale based on fmod.
  //   if fmod && (fmod - 4 & 0xffff).zero?
  //     Type::DecimalWithoutScale.new(precision: precision)
  //   else
  //     OID::Decimal.new(precision: precision, scale: scale)
  //   end
  // The scale bits of a numeric column's atttypmod live in the lower 16
  // bits of (fmod - 4); when those are zero the column was declared
  // with no scale (NUMERIC(p) / NUMERIC) and should use the integer-
  // flavored DecimalWithoutScale.
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

/**
 * Instance-level registrations that mirror Rails' instance
 * `initialize_type_map(m = type_map)` at lines 744–749. Rails passes
 * `timezone: @default_timezone` into `time` / `timestamp`; in TS the
 * ActiveModel Type constructors don't yet thread a timezone option
 * through, so the value is recorded on the registration but not acted
 * on until the Type classes are extended. Signature kept for Rails
 * parity and future plumbing.
 */
export function initializeInstanceTypeMap(
  m: HashLookupTypeMap,
  defaultTimezone: "utc" | "local" = "utc",
): void {
  initializeTypeMap(m);
  // TODO: activemodel Type classes don't yet honor `timezone` — these
  // options are ignored until TimeType / Timestamp are extended.
  registerClassWithPrecision(m, "time", TimeType, { timezone: defaultTimezone });
  registerClassWithPrecision(m, "timestamp", Timestamp, { timezone: defaultTimezone });
  registerClassWithPrecision(m, "timestamptz", TimestampWithTimeZone);
}

/**
 * TypeMapInitializer registrations pass `(oid, fmod, sql_type)` to the
 * block; our fetch signature is `(lookupKey, ...args)`. Grab the last
 * string arg as sql_type to match Rails' `|*args, sql_type|` pattern.
 */
function sqlTypeFromArgs(args: unknown[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === "string") return args[i] as string;
  }
  return undefined;
}

/**
 * Extract the fmod arg from `(fmod, sql_type)` — HashLookupTypeMap
 * forwards `(oid, fmod, sql_type)` to the registered block. The first
 * numeric positional is fmod.
 */
function fmodFromArgs(args: unknown[]): number | undefined {
  for (const a of args) {
    if (typeof a === "number") return a;
  }
  return undefined;
}
