/**
 * Quoting — SQL value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting
 *
 * @boundary-file: SQL quoting accepts caller-supplied values of unknown type,
 *   so the dispatcher branches on runtime shape.
 *
 *   Rails' `when Date, Time then "'#{quoted_date(value)}'"` (quoting.rb:85)
 *   accepts Ruby's native time objects; trails' analogue is Temporal, not JS
 *   `Date` — #939 ("close the dual-typed window") made Temporal the sole
 *   date/time representation, so `quote` and `typeCast` both reject a JS `Date`
 *   with guidance rather than formatting it. rb:85 is ported onto the Temporal
 *   branches via the `quoted_date` self-send.
 */

import { Temporal } from "@blazetrails/date";
import { BigDecimal, TimeWithZone } from "@blazetrails/activesupport";
import { Attribute as ModelAttribute, BinaryData, type Type } from "@blazetrails/activemodel";
import type { TypeMap } from "../../type/type-map.js";
import { NotImplementedError } from "../../errors.js";
import {
  defaultSqlTimezone,
  formatInstantForSql,
  formatPlainDateTimeForSql,
  formatPlainDateForSql,
} from "./sql-datetime.js";
import { Value as TimeValue } from "../../type/time.js";

export interface QuotingClassMethods {
  quoteColumnName(columnName: unknown): string;
}

export interface QuotingDispatchHost {
  quote(value: unknown): string;
  quotedDate(value: TemporalDateLike): string;
  quotedTime(value: QuotedTimeValue): string;
  quotedBinary(value: unknown): string;
  quoteString(s: string): string;
  quoteColumnName(columnName: unknown): string;
  quoteTableName(tableName: unknown): string;
  quotedTrue(): string;
  quotedFalse(): string;
  unquotedTrue(): boolean | number;
  unquotedFalse(): boolean | number;
}

export type QuotedTimeValue =
  | TimeValue
  | Temporal.PlainTime
  | Temporal.PlainDateTime
  | TimeWithZone;

export type TemporalDateLike =
  | TimeWithZone
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime;

export function quoteColumnName(_columnName: unknown): string {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/quoting.rb:61
  throw new NotImplementedError();
}

export function quoteTableName(this: QuotingClassMethods, tableName: unknown): string {
  return this.quoteColumnName(tableName);
}

export function quote(this: QuotingDispatchHost, value: unknown): string {
  if (typeof value === "string") {
    return `'${this.quoteString(value)}'`;
  }
  if (typeof value === "symbol") {
    const desc = value.description;
    if (desc === undefined) throw new TypeError("Cannot quote a Symbol without a description");
    return `'${this.quoteString(desc)}'`;
  }
  if (typeof value === "boolean") return value ? this.quotedTrue() : this.quotedFalse();
  if (value === null || value === undefined) return "NULL";
  if (value instanceof BigDecimal) return value.toString("F");
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof BinaryData) return this.quotedBinary(value);
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return this.quotedBinary(bytes);
  }
  if (value instanceof TimeValue || value instanceof Temporal.PlainTime)
    return `'${this.quotedTime(value)}'`;
  if (
    value instanceof TimeWithZone ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return `'${this.quotedDate(value)}'`;
  }
  if (value instanceof Date)
    throw new TypeError(
      "quote: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  if (typeof value === "function" && value.name) {
    return `'${value.name}'`;
  }
  throw new TypeError(`can't quote ${(value as object).constructor?.name ?? typeof value}`);
}

export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  if (typeof value === "symbol") return value.description ?? String(value);
  if (value instanceof BinaryData) return value.bytes;
  if (typeof value === "boolean") return value ? this.unquotedTrue() : this.unquotedFalse();
  if (value === null || value === undefined) return value;
  if (value instanceof BigDecimal) return value.toString("F");
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "string") return value;
  if (value instanceof TimeValue || value instanceof Temporal.PlainTime)
    return this.quotedTime(value);
  if (
    value instanceof TimeWithZone ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return this.quotedDate(value);
  }
  if (value instanceof Date)
    throw new TypeError(
      "typeCast: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  throw new TypeError(`can't cast ${(value as object).constructor?.name ?? typeof value}`);
}

export function castBoundValue(value: unknown): unknown {
  return value;
}

export interface QuotingHost {
  /** @internal */
  lookupCastType(sqlType: string | null): unknown;
}

export function lookupCastTypeFromColumn(
  this: QuotingHost,
  column: { sqlType: string | null },
): unknown {
  return this.lookupCastType(column.sqlType);
}

export function quoteString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export function quoteTableNameForAssignment(
  this: QuotingDispatchHost,
  table: string,
  attr: string,
): string {
  return this.quoteTableName(`${table}.${attr}`);
}

export function quoteDefaultExpression(
  this: QuotingDispatchHost & QuotingHost,
  value: unknown,
  column: { sqlType?: string | null },
): string {
  if (typeof value === "function") {
    return (value as () => unknown)() as string;
  }
  const castType = this.lookupCastType(column.sqlType ?? null) as Type;
  return this.quote(castType.serialize(value));
}

export function quotedTrue(): string {
  return "TRUE";
}

export function unquotedTrue(): boolean {
  return true;
}

export function quotedFalse(): string {
  return "FALSE";
}

export function unquotedFalse(): boolean {
  return false;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof BinaryData) return value.bytes;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export function quotedBinary(value: unknown): string {
  const bytes = toBytes(value);
  if (bytes) {
    return `'${quoteString(Buffer.from(bytes).toString("latin1"))}'`;
  }
  return `'${quoteString(String(value))}'`;
}

export function sanitizeAsSqlComment(value: unknown): string {
  let comment = String(value);
  comment = comment.replace(/^\s*\/\*\+?\s?/, "").replace(/\s?\*\/\s*$/, "");
  comment = comment.replace(/\*\//g, "* /");
  comment = comment.replace(/\/\*/g, "/ *");
  return comment;
}

export function columnNameMatcher(): RegExp {
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
}

export function columnNameWithOrderMatcher(): RegExp {
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}

export function quotedDate(value: TemporalDateLike): string {
  if (value instanceof TimeWithZone) value = value.utc().toTime().toInstant();
  if (value instanceof Temporal.Instant) return formatInstantForSql(value);
  if (value instanceof Temporal.ZonedDateTime) return formatInstantForSql(value.toInstant());
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTimeForSql(value);
  if (value instanceof Temporal.PlainDate) return formatPlainDateForSql(value);
  if (value instanceof Temporal.PlainTime) {
    const dt = new Temporal.PlainDateTime(
      2000,
      1,
      1,
      value.hour,
      value.minute,
      value.second,
      value.millisecond,
      value.microsecond,
      value.nanosecond,
    );
    return formatPlainDateTimeForSql(dt);
  }
  throw new TypeError(
    `quotedDate: cannot format ${(value as object).constructor?.name ?? typeof value} — use a Temporal type`,
  );
}

export function quotedTime(this: QuotingDispatchHost, value: QuotedTimeValue): string {
  if (value instanceof TimeValue) {
    const obj = value.getobj();
    value =
      obj instanceof TimeWithZone
        ? obj
        : obj.toZonedDateTimeISO(defaultSqlTimezone()).toPlainDateTime();
  }
  value =
    value instanceof TimeWithZone
      ? value.change({ year: 2000, month: 1, day: 1 })
      : value instanceof Temporal.PlainTime
        ? new Temporal.PlainDateTime(
            2000,
            1,
            1,
            value.hour,
            value.minute,
            value.second,
            value.millisecond,
            value.microsecond,
            value.nanosecond,
          )
        : value.with({ year: 2000, month: 1, day: 1 });
  return this.quotedDate(value).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

/** @internal */
function typeCastedBinds(
  this: { typeCast: (v: unknown) => unknown },
  binds: unknown[] | null | undefined,
): unknown[] | undefined {
  return binds?.map((value: unknown) => {
    if (value instanceof ModelAttribute) {
      return this.typeCast(value.valueForDatabase);
    }
    return this.typeCast(value);
  });
}

/** @internal */
export function lookupCastType(this: { typeMap: TypeMap }, sqlType: string | null): Type {
  return this.typeMap.lookup(sqlType);
}

/** @internal */
export interface Quoting {
  quote(value: unknown): string;

  quoteString(s: string): string;

  quoteTableName(tableName: unknown): string;

  quoteColumnName(columnName: unknown): string;

  quoteTableNameForAssignment(table: string, attr: string): string;

  quoteDefaultExpression(value: unknown, column: unknown): string;

  quotedTrue(): string;

  quotedFalse(): string;

  unquotedTrue(): boolean | number;

  unquotedFalse(): boolean | number;

  quotedBinary(value: unknown): string;

  typeCast(value: unknown): unknown;

  castBoundValue(value: unknown): unknown;

  sanitizeAsSqlComment(value: unknown): string;
}

export const Quoting = {
  typeCastedBinds,
};
