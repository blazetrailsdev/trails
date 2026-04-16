/**
 * PostgreSQL quoting — PostgreSQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting
 */

import { BinaryData } from "@blazetrails/activemodel";
import {
  quote as abstractQuote,
  quotedFalse as abstractQuotedFalse,
  quotedTrue as abstractQuotedTrue,
  typeCast as abstractTypeCast,
} from "../abstract/quoting.js";
import { Data as ArrayData } from "./oid/array.js";
import { Data as BitData } from "./oid/bit.js";
import { Range } from "./oid/range.js";
import { Data as XmlData } from "./oid/xml.js";

export class IntegerOutOf64BitRange extends RangeError {
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

export interface Quoting {
  quotedTrue(): string;
  unquotedTrue(): boolean;
  quotedFalse(): string;
  unquotedFalse(): boolean;
  quotedDate(date: Date): string;
  quotedTimeUtc(date: Date): string;
  quoteTableName(name: string): string;
  quoteColumnName(name: string): string;
  quoteString(value: string): string;
  quoteBinaryColumn(value: Buffer): string;
}

export interface BinaryBind {
  value: string;
  format: 1;
}

export interface DefaultExpressionColumn {
  sqlType?: string | null;
  type?: string | null;
  array?: boolean;
}

export interface TypeMapLike {
  lookup(sqlType: string): { serialize?(value: unknown): unknown } | null;
}

export function quotedTrue(): string {
  return abstractQuotedTrue();
}

export function unquotedTrue(): boolean {
  return true;
}

export function quotedFalse(): string {
  return abstractQuotedFalse();
}

export function unquotedFalse(): boolean {
  return false;
}

export function quotedDate(date: Date): string {
  return `'${date.toISOString().split("T")[0]}'`;
}

export function quotedTimeUtc(date: Date): string {
  return `'${date.toISOString().replace("T", " ").replace("Z", "")}'`;
}

export function quoteTableName(name: string): string {
  return splitSchemaQualifiedName(name)
    .map((part) => {
      const unquoted =
        part.startsWith('"') && part.endsWith('"') && part.length >= 2
          ? part.slice(1, -1).replace(/""/g, '"')
          : part;
      return `"${unquoted.replace(/"/g, '""')}"`;
    })
    .join(".");
}

function splitSchemaQualifiedName(name: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && i + 1 < name.length && name[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "." && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  parts.push(current);
  return parts;
}

export function quoteColumnName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteString(value: string): string {
  if (value.includes("\\")) {
    return `E'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
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
 * quotes, never nil.
 */
export function quotedBinary(value: Buffer | Uint8Array | string): string {
  return `'${escapeBytea(value)}'`;
}

export function quote(value: unknown): string {
  if (value instanceof XmlData) {
    return `xml ${quoteString(value.toString())}`;
  }
  if (value instanceof BitData) {
    return `B'${value.toString()}'`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return quoteString(String(value));
  }
  if (value instanceof ArrayData) {
    return quoteString(value.toString());
  }
  if (value instanceof Range) {
    return quoteString(encodeRange(value));
  }
  return abstractQuote(value);
}

export function quoteDefaultExpression(
  value: unknown,
  column?: DefaultExpressionColumn | null,
  typeMap?: TypeMapLike | null,
): string {
  if (value === undefined) return "";
  if (typeof value === "function") {
    const result = (value as () => unknown)();
    if (typeof result === "string") return ` DEFAULT ${result}`;
    if (isSqlLiteral(result)) return ` DEFAULT ${result.value}`;
    throw new TypeError(
      "quoteDefaultExpression expected function default to return a string or SqlLiteral",
    );
  }
  if (isSqlLiteral(value)) return ` DEFAULT ${value.value}`;

  let serialized: unknown = value;
  if (column != null && "array" in column) {
    const sqlType = column.sqlType ?? column.type ?? null;
    const castType = sqlType ? typeMap?.lookup(sqlType) : null;
    serialized = castType?.serialize ? castType.serialize(value) : value;
  }
  return ` DEFAULT ${quote(serialized)}`;
}

export function typeCast(value: unknown): unknown {
  if (value instanceof BinaryData) {
    return { value: value.toString(), format: 1 } satisfies BinaryBind;
  }
  if (value instanceof XmlData || value instanceof BitData) {
    return value.toString();
  }
  if (value instanceof ArrayData) {
    return value.toString();
  }
  if (value instanceof Range) {
    return encodeRange(value);
  }
  if (typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value))) {
    checkIntegerRange(value);
  }
  return abstractTypeCast(value);
}

export function escapeBytea(value: Buffer | Uint8Array | string): string {
  // Treat string inputs as raw byte sequences ("binary") so callers passing
  // pre-encoded binary strings don't get UTF-8 re-encoded.
  const buffer = typeof value === "string" ? Buffer.from(value, "binary") : Buffer.from(value);
  return `\\x${buffer.toString("hex")}`;
}

export function unescapeBytea(value: string): Buffer {
  // Matches Rails' PG-driver-backed contract: this is intentionally not the
  // inverse of escapeBytea for every possible input representation.
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  return Buffer.from(value, "binary");
}

export function columnNameMatcher(): RegExp {
  // Rails uses recursive regexp syntax for nested function calls. JavaScript
  // RegExp cannot express that directly, so this mirrors the current abstract
  // limitation and only allows a bare identifier inside function calls.
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
}

/**
 * Mirrors: PostgreSQL::Quoting::ClassMethods#column_name_with_order_matcher.
 * Same core expression as columnNameMatcher plus optional COLLATE/ASC/DESC/
 * NULLS ordering suffixes. Rails only accepts quoted collation names
 * (`"\w+"`), so this does too — unquoted `COLLATE C` is rejected, matching
 * Rails exactly.
 */
export function columnNameWithOrderMatcher(): RegExp {
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:\s+COLLATE\s+"\w+")?(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|\w+)\))(?:\s+COLLATE\s+"\w+")?(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
}

/**
 * Mirrors: PostgreSQL::Quoting#lookup_cast_type_from_column. Rails reaches
 * into the adapter's type_map via `type_map.lookup(oid, fmod, sql_type)`.
 * We accept the TypeMap as a parameter since this module has no adapter
 * instance.
 */
export interface LookupableTypeMap {
  lookup(oid: number, fmod: number, sqlType: string): unknown;
}

export interface CastableColumn {
  oid: number;
  fmod: number;
  sqlType: string;
}

export function lookupCastTypeFromColumn(
  column: CastableColumn,
  typeMap: LookupableTypeMap,
): unknown {
  return typeMap.lookup(column.oid, column.fmod, column.sqlType);
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

function encodeRange(value: Range): string {
  const lower = value.begin == null || value.begin === -Infinity ? "" : String(value.begin);
  const upper = value.end == null || value.end === Infinity ? "" : String(value.end);
  return `[${lower},${upper}${value.excludeEnd ? ")" : "]"}`;
}

function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}
