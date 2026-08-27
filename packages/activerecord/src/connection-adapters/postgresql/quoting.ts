/**
 * PostgreSQL quoting — PostgreSQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting
 *
 * No boolean-literal methods here: Rails' PostgreSQL::Quoting defines none
 * either, inheriting the abstract pair (quoting.rb:166-180) — which is why
 * encode_array emits '{true}', not MySQL/SQLite's '{1}'. Don't re-add them.
 */

import { BinaryData, DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { ActiveRecord } from "../../ar-config.js";
import {
  quote as abstractQuote,
  quotedDate as abstractQuotedDate,
  toBytes,
  typeCast as abstractTypeCast,
  type QuotingDispatchHost,
} from "../abstract/quoting.js";
import { Temporal } from "@blazetrails/date";
import {
  formatInstantForSqlPostgres,
  formatPlainDateTimeForSqlPostgres,
  formatPlainDateForSqlPostgres,
} from "../abstract/sql-datetime.js";
import { Array as OidArray, Data as ArrayData } from "./oid/array.js";
import { ValueType } from "@blazetrails/activemodel";
import { Data as BitData } from "./oid/bit.js";
import { Range, rangeBoundLiteral } from "./oid/range.js";
import { Data as XmlData } from "./oid/xml.js";
import { Utils } from "./utils.js";
import { toS, TimeWithZone } from "@blazetrails/activesupport";

// Rails inherits from StandardError — use plain Error in TS for
// parity. JS's `RangeError` is a built-in that extends Error; it
// implies numeric-range semantics we don't need here.
export class IntegerOutOf64BitRange extends Error {
  constructor(value: bigint | number) {
    super(
      `${value} is out of range for PostgreSQL bigint (64-bit signed integer): ` +
        `-9223372036854775808 to 9223372036854775807`,
    );
    this.name = "IntegerOutOf64BitRange";
  }
}

const PG_INT64_MIN = BigInt("-9223372036854775808");
const PG_INT64_MAX = BigInt("9223372036854775807");

export interface BinaryBind {
  value: string;
  format: 1;
}

export interface DefaultExpressionColumn {
  sqlType?: string | null;
  type?: string | null;
  array?: boolean;
  // Rails' lookup_cast_type_from_column keys on (oid, fmod, sql_type)
  // (postgresql/quoting.rb:191), so a live Column's OID and type modifier
  // must survive the trip here — the formatted-name fallback is only for
  // ColumnDefinitions, which have neither.
  oid?: number | null;
  fmod?: number | null;
}

/**
 * The `lookup_cast_type_from_column` surface `quote_default_expression`'s
 * array branch needs (postgresql/quoting.rb:161-163), narrowed to what the
 * branch actually uses.
 */
export interface CastTypeLookup {
  lookupCastTypeFromColumn(
    column: DefaultExpressionColumn,
  ):
    | { serialize?(value: unknown): unknown }
    | null
    | Promise<{ serialize?(value: unknown): unknown } | null>;
}

/**
 * Mirrors: PostgreSQL::Quoting::QUOTED_COLUMN_NAMES / QUOTED_TABLE_NAMES
 * (postgresql/quoting.rb:9-10) — the `Concurrent::Map`s the class-side quoters memoize
 * through. Keyed on the name exactly as passed, as in Ruby (postgresql/quoting.rb:46-56).
 */
const QUOTED_COLUMN_NAMES = new Map<unknown, string>();
const QUOTED_TABLE_NAMES = new Map<unknown, string>();

/**
 * Mirrors: PostgreSQL::Quoting#quote_table_name (postgresql/quoting.rb:58-60) —
 * `QUOTED_TABLE_NAMES[name] ||= Utils.extract_schema_qualified_name(name.to_s).quoted`.
 */
export function quoteTableName(name: unknown): string {
  let quoted = QUOTED_TABLE_NAMES.get(name);
  if (quoted === undefined) {
    quoted = Utils.extractSchemaQualifiedName(toS(name)).quoted();
    QUOTED_TABLE_NAMES.set(name, quoted);
  }
  return quoted;
}

export function quoteColumnName(name: unknown): string {
  let quoted = QUOTED_COLUMN_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `"${toS(name).replace(/"/g, '""')}"`;
    QUOTED_COLUMN_NAMES.set(name, quoted);
  }
  return quoted;
}

/**
 * Mirrors: PostgreSQL::Quoting#quote_string (postgresql/quoting.rb:127-131) —
 * `connection.escape(s)`, which is **escape-only**: libpq's PQescapeStringConn
 * doubles `'` and, with `standard_conforming_strings` on (the server default
 * since 9.1, and what `configure_connection` leaves in place), treats a
 * backslash as an ordinary character. The surrounding quotes are added by the
 * caller — abstract `quote` (abstract/quoting.rb:75-76). Rails has no `E'`
 * handling anywhere in postgresql/quoting.rb.
 *
 * @missingRailsCall with_raw_connection — CONVERGEABLE (RFC 0073
 *   permanent-connection-checkout): Rails escapes inside
 *   `with_raw_connection { |c| c.escape(s) }`; `withRawConnection` is async in
 *   trails and `quoteString` is reached from synchronous quoting paths, so the
 *   lease cannot be taken until 0073 flips those paths. The escaping is the
 *   same (PG `standard_conforming_strings`).
 */
export function quoteString(value: string): string {
  return value.replace(/'/g, "''");
}

export function quoteBinaryColumn(value: Buffer): string {
  return `'\\x${value.toString("hex")}'`;
}

/**
 * Mirrors: PostgreSQL::Quoting#quote_table_name_for_assignment.
 * PG's UPDATE ... SET clause references the column without the table prefix.
 */
export function quoteTableNameForAssignment(_table: string, attr: string): string {
  return quoteColumnName(attr);
}

/**
 * Mirrors: PostgreSQL::Quoting#quote_schema_name.
 */
export function quoteSchemaName(schemaName: string): string {
  return quoteColumnName(schemaName);
}

/**
 * Mirrors: PostgreSQL::Quoting#quoted_binary. Rails passes `value.to_s`
 * through escape_bytea so the result is always a string wrapped in SQL
 * quotes, never nil. Rails' signature takes the `Type::Binary::Data` itself
 * (`postgresql/quoting.rb:152`), so accept it alongside the raw views our
 * `quote` unwraps to — a Rails-shaped call then works here too.
 *
 * Routes its byte union through the shared {@link toBytes}, as the abstract,
 * MySQL and SQLite overrides do. `toBytes` returns `null` for a latin1 `string`,
 * so the string branch stays ordered after it — PG's `escapeBytea` accepts one.
 */
export function quotedBinary(
  value: Buffer | ArrayBufferView | ArrayBuffer | string | BinaryData,
): string {
  const bytes = toBytes(value);
  return bytes ? `'${escapeBytea(bytes)}'` : `'${escapeBytea(value as string)}'`;
}

/**
 * @missingRailsCall check_int_in_range — PERMANENT: Equivalent (RFC 0072
 *   activerecord-unrouted-privates-remaining-inventory): `checkIntInRange` is a
 *   bare alias — `export const checkIntInRange = checkIntegerRange` — so the
 *   routed call is the alias target and the extractor never sees the alias name.
 *   Nothing to converge.
 */
export function quote(this: QuotingDispatchHost, value: unknown): string {
  if (value instanceof XmlData) {
    return `xml '${quoteString(value.toString())}'`;
  }
  if (value instanceof BitData) {
    if (value.isBinary()) return `B'${value.toString()}'`;
    if (value.isHex()) return `X'${value.toString()}'`;
    return null as unknown as string;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `'${String(value)}'`;
  }
  if (value instanceof ArrayData) {
    // Rails: `quote(encode_array(value))` — one serialization path, the
    // encoder's delimiter (`;` for box[]), with per-element type_cast.
    return quote.call(this, encodeArray.call(this, value));
  }
  if (value instanceof Range) {
    return quote.call(this, encodeRange.call(this, value));
  }
  // Mirrors: PostgreSQL::Quoting#quote raises IntegerOutOf64BitRange for
  // integers exceeding the 64-bit signed range. Covers both bigint and
  // integer number values — JS integers beyond MAX_SAFE_INTEGER lose
  // precision silently, so they must be rejected the same way bigints are.
  if (typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value))) {
    if (ActiveRecord.raiseIntWiderThan64bit) checkIntegerRange(value);
    return String(value);
  }
  // Rails' PG `quote` has no String/Symbol arm: both fall to `super`, which
  // interpolates `quote_string` between quotes once (abstract/quoting.rb:75-76).
  // Thread `this` so the inherited date/time dispatch reaches PG's
  // BC-suffixing `quotedDate` (mirrors Rails' `super` call in PG#quote).
  return abstractQuote.call(this, value);
}

// Async: the ColumnDefinition (no-OID) path awaits the live regtype lookup
// (postgresql/quoting.rb:195) that Ruby blocks on.
export async function quoteDefaultExpression(
  this: QuotingDispatchHost,
  value: unknown,
  column: DefaultExpressionColumn,
  castTypeLookup?: CastTypeLookup | null,
): Promise<string> {
  if (value === undefined) return "";
  if (typeof value === "function") {
    const result = (value as () => unknown)();
    if (typeof result === "string") return result;
    if (isSqlLiteral(result)) return result.value;
    throw new TypeError(
      "quoteDefaultExpression expected function default to return a string or SqlLiteral",
    );
  }
  if (isSqlLiteral(value)) return value.value;
  // Rails: `elsif column.type == :uuid && value.is_a?(String) && value.include?("()")`
  // (postgresql/quoting.rb:159-160) — "Does not quote function default values
  // for UUID columns", so `default: "gen_random_uuid()"` emits the bare call
  // rather than the string literal `'gen_random_uuid()'`. Must precede the
  // array/super paths, and matches `()` anywhere in the string as Rails does.
  if (column?.type === "uuid" && typeof value === "string" && value.includes("()")) {
    return value;
  }

  let serialized: unknown = value;
  if (column != null && "array" in column) {
    const castType = (await castTypeLookup?.lookupCastTypeFromColumn(column)) ?? null;
    if (column.array === true && globalThis.Array.isArray(value)) {
      // Rails routes JS arrays through OID::Array.serialize so each
      // element is cast by the element subtype before quoting. Trails'
      // CastTypeLookup permits two shapes: an already-array-aware type
      // (serialize returns ArrayData) or the element subtype. Run
      // serialize first; if ArrayData, use it. Otherwise wrap the
      // original value in OidArray(subtype) for per-element coercion.
      const fromTypeMap = castType?.serialize ? castType.serialize(value) : value;
      if (fromTypeMap instanceof ArrayData) {
        serialized = fromTypeMap;
      } else {
        const subtype = (castType ?? new ValueType()) as ConstructorParameters<typeof OidArray>[0];
        serialized = new OidArray(subtype).serialize(value);
      }
    } else if (column.array === true) {
      serialized = value;
    } else if (castType?.serialize) {
      serialized = castType.serialize(value);
    }
  }
  // Rails: `quote(value)` — self-dispatched, so a binary default reaches PG's
  // bytea `quotedBinary` and a date default PG's BC-suffixing `quotedDate`
  // (postgresql/quoting.rb:143) rather than the abstract formats.
  return quote.call(this, serialized);
}

export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  // PG's date/time infinity sentinels are `Number.±Infinity`
  // (activemodel/src/type/internal/sentinels.ts:25), so they must be intercepted
  // ahead of the numeric arm the abstract `type_cast` ends in; pg wants the wire
  // strings. Ruby has no such sentinel — `Float::INFINITY` reaches
  // `quoted_date` through `infinite?` (postgresql/quoting.rb:141) — so there is
  // no Rails arm to mirror here.
  if (value === DateInfinity) return "infinity";
  if (value === DateNegativeInfinity) return "-infinity";
  // Rails: `when Type::Binary::Data` (postgresql/quoting.rb:207).
  if (value instanceof BinaryData) {
    // node-postgres binds Buffer as bytea natively (text-format hex literal).
    // Returning a Buffer over the existing Uint8Array preserves bytes
    // 128–255 that the prior `value.toString()` path corrupted via UTF-8
    // decode, and matches MySQL `quotedBinary`'s view-form treatment of
    // Uint8Array at `mysql/quoting.ts:97-98`. Rails' PG adapter returns
    // `{ value: value.to_s, format: 1 }` here; that bind-param hash is a
    // pg-ruby contract (binary format mode), and node-postgres does not
    // honor it (a `{value, format}` object is JSON-stringified into
    // garbage). The Rails-equivalent functional behavior in this driver
    // is a bare Buffer.
    const u8 = value.bytes;
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  if (value instanceof XmlData || value instanceof BitData) {
    return value.toString();
  }
  if (value instanceof ArrayData) {
    // Rails: `when OID::Array::Data then encode_array(value)`.
    return encodeArray.call(this, value);
  }
  if (value instanceof Range) {
    return encodeRange.call(this, value);
  }
  if (typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value))) {
    if (ActiveRecord.raiseIntWiderThan64bit) checkIntegerRange(value);
  }
  return abstractTypeCast.call(this, value);
}

export function escapeBytea(value: Buffer | Uint8Array | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value);
  return `\\x${buffer.toString("hex")}`;
}

export function unescapeBytea(value: string): Buffer {
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");

  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\") {
      const next = value[i + 1];
      if (next === "\\") {
        bytes.push(0x5c);
        i += 1;
        continue;
      }
      const octal = value.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        const byte = parseInt(octal, 8);
        if (byte <= 0o377) {
          bytes.push(byte);
          i += 3;
          continue;
        }
      }
    }
    bytes.push(ch.charCodeAt(0));
  }
  return Buffer.from(bytes);
}

export function columnNameMatcher(): RegExp {
  // Mirrors Rails PostgreSQL column_name_matcher.
  // Supports "schema"."table"."col" quoted identifiers, ::type casts, and
  // 0-or-1-arg function calls (2-level unrolling of Ruby's recursive \g<2>).
  // col branch carries its own (?:::\w+)? so backtracking col→func works.
  const col0 = String.raw`(?:(?:\w+|"\w+")\.){0,2}(?:\w+|"\w+")(?:::\w+)?`;
  const col1 = String.raw`(?:${col0}|\w+\((?:|${col0})\)(?:::\w+)?)`;
  const atom = String.raw`(?:${col0}|\w+\((?:|${col1})\)(?:::\w+)?)`;
  const id = String.raw`(?:\w+|"\w+")`;
  return new RegExp(
    `^(${atom}(?:(?:\\s+AS)?\\s+${id})?)(?:\\s*,\\s*${atom}(?:(?:\\s+AS)?\\s+${id})?)*$`,
    "i",
  );
}

/**
 * Mirrors: PostgreSQL::Quoting::ClassMethods#column_name_with_order_matcher.
 * Same atom as columnNameMatcher plus COLLATE, ASC/DESC, NULLS FIRST/LAST.
 */
export function columnNameWithOrderMatcher(): RegExp {
  const col0 = String.raw`(?:(?:\w+|"\w+")\.){0,2}(?:\w+|"\w+")(?:::\w+)?`;
  const col1 = String.raw`(?:${col0}|\w+\((?:|${col0})\)(?:::\w+)?)`;
  const atom = String.raw`(?:${col0}|\w+\((?:|${col1})\)(?:::\w+)?)`;
  return new RegExp(
    `^(${atom}(?:\\s+COLLATE\\s+"\\w+")?(?:\\s+ASC|\\s+DESC)?(?:\\s+NULLS\\s+(?:FIRST|LAST))?)(?:\\s*,\\s*${atom}(?:\\s+COLLATE\\s+"\\w+")?(?:\\s+ASC|\\s+DESC)?(?:\\s+NULLS\\s+(?:FIRST|LAST))?)*$`,
    "i",
  );
}

export interface LookupableTypeMap {
  lookup(oid: number, fmod: number, sqlType: string): unknown;
}

export interface CastableColumn {
  oid?: number | null;
  fmod?: number | null;
  sqlType?: string | null;
}

/**
 * Mirrors: PostgreSQL::Quoting#lookup_cast_type_from_column
 * (postgresql/quoting.rb:189-192).
 *
 * `verify! if type_map.nil?` is the lazy build of the adapter's type map;
 * trails' `typeMap` getter (postgresql-adapter.ts) performs that build on
 * first read, so reading it here is the guard. Rails' `verify!` is `verifyBang`
 * here and is async, and this method has sync callers (the attribute-read type
 * caster), so it cannot be awaited at this site.
 */
export function lookupCastTypeFromColumn(
  this: { typeMap: LookupableTypeMap },
  column: CastableColumn,
): unknown {
  return this.typeMap.lookup(column.oid as number, column.fmod as number, column.sqlType as string);
}

/**
 * Mirrors: PostgreSQL::Quoting#check_int_in_range. Rails uses this name;
 * `checkIntegerRange` is the TS-side alias we already had.
 */
export const checkIntInRange = checkIntegerRange;

export function checkIntegerRange(value: bigint | number): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new IntegerOutOf64BitRange(value);
    }
  }
  const bigVal = typeof value === "bigint" ? value : BigInt(value);
  if (bigVal < PG_INT64_MIN || bigVal > PG_INT64_MAX) {
    throw new IntegerOutOf64BitRange(value);
  }
}

/**
 * Mirrors: PostgreSQL::Quoting#quoted_date. Emits a microsecond-precision SQL
 * literal (fixed 6 fractional digits when usec > 0, per Rails' `sprintf("%06d",
 * usec)`), appending " BC" for proleptic years ≤ 0 (Temporal year 0 → 1 BC).
 */
export function quotedDate(
  value:
    | TimeWithZone
    | Temporal.Instant
    | Temporal.ZonedDateTime
    | Temporal.PlainDateTime
    | Temporal.PlainDate
    | Temporal.PlainTime,
): string {
  // Rails: the inherited `quoted_date` normalises an `acts_like?(:time)` value
  // through `getutc`/`getlocal` (abstract/quoting.rb:185-191); an
  // `ActiveSupport::TimeWithZone` takes that arm (time_with_zone.rb:504-506).
  if (value instanceof TimeWithZone) value = value.utc().toTime().toInstant();
  if (value instanceof Temporal.Instant) return formatInstantForSqlPostgres(value);
  if (value instanceof Temporal.ZonedDateTime)
    return formatInstantForSqlPostgres(value.toInstant());
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTimeForSqlPostgres(value);
  if (value instanceof Temporal.PlainDate) return formatPlainDateForSqlPostgres(value);
  return abstractQuotedDate(value);
}

/**
 * Mirrors: PostgreSQL::Quoting#encode_range. Serializes a Range to PG's
 * range literal: `[begin,end)` or `[begin,end]` depending on excludeEnd.
 * @internal
 */
export function encodeRange(this: QuotingDispatchHost, range: Range): string {
  const begin = rangeBoundLiteral(typeCastRangeValue.call(this, range.begin));
  const end = rangeBoundLiteral(typeCastRangeValue.call(this, range.end));
  return `[${begin},${end}${range.excludeEnd ? ")" : "]"}`;
}

function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}

/**
 * Mirrors: PostgreSQL::Quoting#encode_array. Recursively type-casts the array
 * values, then joins them via the OID encoder — whose delimiter is type-correct
 * (`;` for box[]) rather than a hardcoded comma.
 * @internal
 */
function encodeArray(this: QuotingDispatchHost, arrayData: ArrayData): string {
  const values = typeCastArray.call(this, arrayData.values);
  const result = arrayData.encoder.encode(values);
  // Rails then force-encodes the result to the first string's encoding; JS
  // strings are UTF-16 so this is a no-op (see the helper) and `result` is
  // returned unchanged. Called in Rails' order for parity.
  determineEncodingOfStringsInArray(values);
  return result;
}

/**
 * Mirrors: PostgreSQL::Quoting#determine_encoding_of_strings_in_array. In
 * Ruby this returns the encoding of the first string found (used to
 * force-encode the PG encoder output). JS strings are always UTF-16 internally
 * so encoding coercion is a no-op; we return null to signal "no re-encoding".
 * @internal
 */
function determineEncodingOfStringsInArray(_value: unknown): null {
  return null;
}

/**
 * Mirrors: PostgreSQL::Quoting#type_cast_array. Recursively calls typeCast
 * on leaf values.
 * @internal
 */
function typeCastArray(this: QuotingDispatchHost, values: unknown[]): unknown[] {
  return values.map((item) =>
    Array.isArray(item) ? typeCastArray.call(this, item) : typeCast.call(this, item),
  );
}

/**
 * Mirrors: PostgreSQL::Quoting#type_cast_range_value. Returns empty string for
 * infinite bounds, otherwise delegates to typeCast.
 * @internal
 */
function typeCastRangeValue(this: QuotingDispatchHost, value: unknown): unknown {
  return isInfinity(value) ? "" : typeCast.call(this, value);
}

/**
 * Mirrors: PostgreSQL::Quoting#infinity?. Returns true when value is ±Infinity.
 * @internal
 */
function isInfinity(value: unknown): boolean {
  return value === Infinity || value === -Infinity;
}
