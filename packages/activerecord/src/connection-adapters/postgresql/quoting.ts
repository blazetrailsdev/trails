import {
  BinaryData,
  DateInfinity,
  DateNegativeInfinity,
  type ValueType,
} from "@blazetrails/activemodel";
import { BigDecimal } from "@blazetrails/activesupport";
import { ActiveRecord } from "../../ar-config.js";
import {
  quote as abstractQuote,
  lookupCastType as abstractLookupCastType,
  quoteDefaultExpression as abstractQuoteDefaultExpression,
  quotedDate as abstractQuotedDate,
  type TemporalDateLike,
  toBytes,
  typeCast as abstractTypeCast,
  type QuotingDispatchHost,
} from "../abstract/quoting.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { defaultSqlTimezone } from "../abstract/sql-datetime.js";
import { Data as ArrayData } from "./oid/array.js";
import { Data as BitData } from "./oid/bit.js";
import { Data as XmlData } from "./oid/xml.js";
import { Utils } from "./utils.js";
import { rbObjAsString as toS, Range } from "@blazetrails/ruby-compat";

export class IntegerOutOf64BitRange extends Error {
  constructor(msg: string) {
    super(msg);
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
  oid?: number | null;
  fmod?: number | null;
}

export interface CastTypeLookupHost {
  lookupCastTypeFromColumn(column: DefaultExpressionColumn): { serialize(value: unknown): unknown };
  lookupCastType(sqlType: string | null): ValueType;
}

const QUOTED_COLUMN_NAMES = new Map<unknown, string>();
const QUOTED_TABLE_NAMES = new Map<unknown, string>();

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

/** @missingRailsCall with_raw_connection — CONVERGEABLE pg-quote-string-escapes-without-with-raw-connection */
export function quoteString(s: string): string {
  return s.replace(/'/g, "''");
}

export function quoteTableNameForAssignment(_table: string, attr: string): string {
  return quoteColumnName(attr);
}

export function quoteSchemaName(schemaName: string): string {
  return quoteColumnName(schemaName);
}

export function quotedBinary(
  value: Buffer | ArrayBufferView | ArrayBuffer | string | BinaryData,
): string {
  const bytes = toBytes(value);
  return bytes ? `'${escapeBytea(bytes)}'` : `'${escapeBytea(value as string)}'`;
}

export function quote(this: QuotingDispatchHost, value: unknown): string | null {
  if (
    ActiveRecord.raiseIntWiderThan64bit &&
    (typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value)))
  ) {
    checkIntInRange(value);
  }

  if (value instanceof XmlData) {
    return `xml '${quoteString(value.toString())}'`;
  }
  if (value instanceof BitData) {
    if (value.isBinary()) return `B'${value.toString()}'`;
    else if (value.isHex()) return `X'${value.toString()}'`;
    return null;
  }
  if (typeof value === "number" || typeof value === "bigint" || value instanceof BigDecimal) {
    if (
      value instanceof BigDecimal
        ? value.isFinite()
        : typeof value === "bigint" || Number.isFinite(value)
    ) {
      return abstractQuote.call(this, value);
    } else {
      return `'${String(value)}'`;
    }
  }
  if (value instanceof ArrayData) {
    return quote.call(this, encodeArray.call(this, value));
  }
  if (value instanceof Range) {
    return quote.call(this, encodeRange.call(this, value));
  }
  return abstractQuote.call(this, value);
}

export function quoteDefaultExpression(
  this: QuotingDispatchHost & CastTypeLookupHost,
  value: unknown,
  column: DefaultExpressionColumn,
): string | null {
  if (typeof value === "function") {
    return (value as () => unknown)() as string;
  } else if (column?.type === "uuid" && typeof value === "string" && value.includes("()")) {
    return value;
  } else if (column != null && "array" in column) {
    const type = this.lookupCastTypeFromColumn(column);
    return quote.call(this, type.serialize(value));
  } else {
    return abstractQuoteDefaultExpression.call(this, value, column);
  }
}

export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  if (value === DateInfinity) return "infinity";
  if (value === DateNegativeInfinity) return "-infinity";
  if (value instanceof BinaryData) {
    const u8 = value.bytes;
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  if (value instanceof XmlData || value instanceof BitData) {
    return value.toString();
  }
  if (value instanceof ArrayData) {
    return encodeArray.call(this, value);
  }
  if (value instanceof Range) {
    return encodeRange.call(this, value);
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
  const col0 = String.raw`(?:(?:\w+|"\w+")\.){0,2}(?:\w+|"\w+")(?:::\w+)?`;
  const col1 = String.raw`(?:${col0}|\w+\((?:|${col0})\)(?:::\w+)?)`;
  const atom = String.raw`(?:${col0}|\w+\((?:|${col1})\)(?:::\w+)?)`;
  const id = String.raw`(?:\w+|"\w+")`;
  return new RegExp(
    `^(${atom}(?:(?:\\s+AS)?\\s+${id})?)(?:\\s*,\\s*${atom}(?:(?:\\s+AS)?\\s+${id})?)*$`,
    "i",
  );
}

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
  lookup(oid: number, fmod: number, sqlType: string): ValueType;
}

export interface RegtypeOidHost {
  typeMap: LookupableTypeMap;
  /** @internal */
  _regtypeOids?: Map<string, number>;
}

export interface CastableColumn {
  oid?: number | null;
  fmod?: number | null;
  sqlType?: string | null;
}

/**
 * @internal
 * @missingRailsCall query_value — PERMANENT
 * @missingRailsCall quote — PERMANENT
 */
export function lookupCastType(this: RegtypeOidHost, sqlType: string | null): ValueType {
  return abstractLookupCastType.call(this as never, regtypeOid.call(this, sqlType));
}

function regtypeOid(this: RegtypeOidHost, sqlType: string | null): string | number | null {
  if (typeof sqlType !== "string") return sqlType;
  const name = sqlType
    .replace(/\([^)]*\)/, "")
    .replace(/\s+/g, " ")
    .trim();
  const bare = name.slice(name.lastIndexOf(".") + 1);
  return this._regtypeOids?.get(name) ?? this._regtypeOids?.get(bare) ?? bare;
}

export function lookupCastTypeFromColumn(
  this: { typeMap: LookupableTypeMap },
  column: CastableColumn,
): ValueType {
  return this.typeMap.lookup(column.oid as number, column.fmod as number, column.sqlType as string);
}

export function checkIntInRange(value: bigint | number): void {
  const bigVal = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  if (bigVal > PG_INT64_MAX || bigVal < PG_INT64_MIN) {
    const exception = `Provided value outside of the range of a signed 64bit integer.

PostgreSQL will treat the column type in question as a numeric.
This may result in a slow sequential scan due to a comparison
being performed between an integer or bigint value and a numeric value.

To allow for this potentially unwanted behavior, set
ActiveRecord.raiseIntWiderThan64bit to false.
`;
    throw new IntegerOutOf64BitRange(exception);
  }
}

export function quotedDate(value: TemporalDateLike): string {
  if (yearOf(value) <= 0) {
    const bceYear = String(-yearOf(value) + 1).padStart(4, "0");
    return `${abstractQuotedDate(value).replace(/^-?\d+/, bceYear)} BC`;
  }
  return abstractQuotedDate(value);
}

function yearOf(value: TemporalDateLike): number {
  if (value instanceof Temporal.Instant) return value.toZonedDateTimeISO(defaultSqlTimezone()).year;
  if (value instanceof RubyTime) return value.toTime().year;
  if (value instanceof Temporal.PlainTime) return 2000;
  return value.year;
}

/** @internal */
export function encodeRange(this: QuotingDispatchHost, range: Range<unknown>): string {
  const begin = typeCastRangeValue.call(this, range.begin) ?? "";
  const end = typeCastRangeValue.call(this, range.end) ?? "";
  return `[${begin},${end}${range.excludeEnd ? ")" : "]"}`;
}

/** @internal */
function encodeArray(this: QuotingDispatchHost, arrayData: ArrayData): string {
  const values = typeCastArray.call(this, arrayData.values);
  const result = arrayData.encoder.encode(values);
  determineEncodingOfStringsInArray(values);
  return result;
}

/** @internal */
function determineEncodingOfStringsInArray(_value: unknown): null {
  return null;
}

/** @internal */
function typeCastArray(this: QuotingDispatchHost, values: unknown[]): unknown[] {
  return values.map((item) =>
    Array.isArray(item) ? typeCastArray.call(this, item) : typeCast.call(this, item),
  );
}

/** @internal */
function typeCastRangeValue(this: QuotingDispatchHost, value: unknown): unknown {
  return isInfinity(value) ? "" : typeCast.call(this, value);
}

/** @internal */
function isInfinity(value: unknown): boolean {
  return value === Infinity || value === -Infinity;
}
