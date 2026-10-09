/**
 * Quoting — SQL value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting
 *
 * @boundary-file: SQL quoting accepts caller-supplied values of unknown type,
 *   so the dispatcher branches on runtime shape.
 *
 *   Rails' `when Date, Time then "'#{quoted_date(value)}'"` (quoting.rb:85)
 *   accepts Ruby's native time objects; trails' analogues are the Temporal
 *   types, `Time`, `TimeWithZone`, and a JS `Date`, which ruby-compat classes
 *   as `Time` (`rbClassOf`).
 *
 *   Rails' `when nil, Numeric, String then value` (quoting.rb:102) hands a
 *   Float to the driver unchanged. trails' whole-valued Float is a boxed
 *   `new Number(x)` (the seat `ActiveModel::Type::Float#cast_value` produces),
 *   which a JS driver cannot bind, so `typeCast` passes its `valueOf()`.
 */

import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { BigDecimal, Chars, TimeWithZone } from "@blazetrails/activesupport";
import { Attribute as ModelAttribute, BinaryData, type ValueType } from "@blazetrails/activemodel";
import { rbObjAsString, rbObjClassname, sprintf, TypeError } from "@blazetrails/ruby-compat";
import type { TypeMap } from "../../type/type-map.js";
import { NotImplementedError } from "../../errors.js";
import { Value as TimeValue } from "../../type/time.js";
import { toFs as timeToFs } from "@blazetrails/activesupport";
import { toFs as dateToFs } from "@blazetrails/activesupport/core-ext/date/conversions";
import {
  toFs as dateTimeToFs,
  usec as dateTimeUsec,
} from "@blazetrails/activesupport/core-ext/date-time/conversions";

export interface QuotingClassMethods {
  quoteColumnName(columnName: unknown): string;
}

export interface QuotingDispatchHost {
  readonly defaultTimezone: string;
  quote(value: unknown): string;
  quotedDate(value: TemporalDateLike): string;
  quotedTime(value: QuotedTimeValue): string;
  quotedBinary(value: BinaryData): string;
  quoteString(s: string): string;
  quoteColumnName(columnName: unknown): string;
  quoteTableName(tableName: unknown): string;
  quotedTrue(): string;
  quotedFalse(): string;
  unquotedTrue(): boolean | number;
  unquotedFalse(): boolean | number;
}

export const ClassMethods = {
  quoteColumnName(_columnName: unknown): string {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/quoting.rb:61
    throw new NotImplementedError();
  },
};

export type QuotedTimeValue = TimeValue | TimeWithZone | RubyTime;

export type TemporalDateLike =
  | TimeWithZone
  | RubyTime
  | Date
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate;

export function quote(this: QuotingDispatchHost, value: unknown): string {
  if (typeof value === "string" || value instanceof Chars) {
    return `'${this.quoteString(rbObjAsString(value))}'`;
  }
  if (value === true) return this.quotedTrue();
  if (value === false) return this.quotedFalse();
  if (value === null || value === undefined) return "NULL";
  if (value instanceof BigDecimal) return value.toString("F");
  if (typeof value === "number" || typeof value === "bigint" || value instanceof Number) {
    return rbObjAsString(value);
  }
  if (value instanceof BinaryData) return this.quotedBinary(value);
  if (value instanceof TimeValue) return `'${this.quotedTime(value)}'`;
  if (
    value instanceof TimeWithZone ||
    value instanceof RubyTime ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Date
  ) {
    return `'${this.quotedDate(value)}'`;
  }
  if (typeof value === "function" && value.name) {
    return `'${value.name}'`;
  }
  throw new TypeError(`can't quote ${rbObjClassname(value)}`);
}

/** @inventedArm if — CONVERGEABLE activerecord-converge-invented-arms-change-table-drop-table-and-float-type-cast */
export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  if (value instanceof Chars || value instanceof BinaryData) return rbObjAsString(value);
  if (value === true) return this.unquotedTrue();
  if (value === false) return this.unquotedFalse();
  if (value instanceof BigDecimal) return value.toString("F");
  if (value instanceof Number) return value.valueOf();
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (value instanceof TimeValue) return this.quotedTime(value);
  if (
    value instanceof TimeWithZone ||
    value instanceof RubyTime ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Date
  ) {
    return this.quotedDate(value);
  }
  throw new TypeError(`can't cast ${rbObjClassname(value)}`);
}

export function castBoundValue(value: unknown): unknown {
  return value;
}

export function lookupCastTypeFromColumn(
  this: QuotingHost,
  column: { sqlType: string | null },
): ValueType {
  return this.lookupCastType(column.sqlType);
}

export function quoteString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export interface QuotingHost {
  /** @internal */
  lookupCastType(sqlType: string | null): ValueType;
}

export function quoteColumnName(this: object, columnName: unknown): string {
  return (this.constructor as unknown as QuotingClassMethods).quoteColumnName(columnName);
}

export function quoteTableName(this: QuotingClassMethods, tableName: unknown): string {
  return this.quoteColumnName(tableName);
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
  value = this.lookupCastType(column.sqlType ?? null).serialize(value);
  return this.quote(value);
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

export function quotedDate(this: { defaultTimezone: string }, value: TemporalDateLike): string {
  if (actsLikeTime(value)) {
    if (this.defaultTimezone === "utc") {
      if (!isUtc(value)) value = getutc(value);
    } else {
      value = getlocal(value);
    }
  }

  const result = toFs(value, "db");
  if (!(value instanceof Temporal.PlainDate) && usec(value) > 0) {
    return result + "." + sprintf("%06d", usec(value));
  } else {
    return result;
  }
}

export function quotedTime(this: QuotingDispatchHost, value: QuotedTimeValue): string {
  value = value.change({ year: 2000, month: 1, day: 1 });
  return this.quotedDate(value).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

export function quotedBinary(value: BinaryData): string {
  return `'${quoteString(Buffer.from(value.toString()).toString("latin1"))}'`;
}

export function sanitizeAsSqlComment(value: unknown): string {
  let comment = String(value);
  comment = comment.replace(/^\s*\/\*\+?\s?/, "").replace(/\s?\*\/\s*$/, "");
  comment = comment.replace(/\*\//g, "* /");
  comment = comment.replace(/\/\*/g, "/ *");
  return comment;
}

/** @internal */
export function typeCastedBinds(
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

type TimeLike = TimeWithZone | RubyTime | Date | Temporal.Instant | Temporal.ZonedDateTime;

/** @internal */
export function lookupCastType(
  this: { typeMap: TypeMap },
  sqlType: string | number | null,
): ValueType {
  return this.typeMap.lookup(sqlType as string | null);
}

export function columnNameMatcher(): RegExp {
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
}

export function columnNameWithOrderMatcher(): RegExp {
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
}

function actsLikeTime(value: unknown): value is TimeLike {
  return (
    value instanceof TimeWithZone ||
    value instanceof RubyTime ||
    value instanceof Date ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.ZonedDateTime
  );
}

function instantOf(value: TimeLike): Temporal.Instant {
  if (value instanceof TimeWithZone) value = value.utc();
  if (value instanceof RubyTime) return value.toZonedDateTime().toInstant();
  if (value instanceof Date) return Temporal.Instant.fromEpochMilliseconds(value.getTime());
  if (value instanceof Temporal.ZonedDateTime) return value.toInstant();
  return value;
}

/** Ruby's `Time#utc?` (`vendor/ruby/v3.3.11/time.c:4340`). */
function isUtc(value: TimeLike): boolean {
  if (value instanceof TimeWithZone || value instanceof RubyTime) return value.isUtc();
  if (value instanceof Temporal.ZonedDateTime) return value.timeZoneId === "UTC";
  return false;
}

/** Ruby's `Time#getutc` (`vendor/ruby/v3.3.11/time.c:4425`). */
function getutc(value: TimeLike): Temporal.ZonedDateTime {
  return instantOf(value).toZonedDateTimeISO("UTC");
}

/** Ruby's `Time#getlocal` (`vendor/ruby/v3.3.11/time.c:4374`). */
function getlocal(value: TimeLike): Temporal.ZonedDateTime {
  return instantOf(value).toZonedDateTimeISO(Temporal.Now.timeZoneId());
}

function toFs(value: TemporalDateLike, format: string): string {
  if (value instanceof TimeWithZone) return value.toFs(format);
  if (value instanceof Temporal.PlainDate) return dateToFs(value, format);
  if (value instanceof Temporal.ZonedDateTime || value instanceof Temporal.PlainDateTime) {
    return dateTimeToFs(value, format);
  }
  return timeToFs(value, format);
}

/** Ruby's `Time#usec` (`vendor/ruby/v3.3.11/time.c:3861`) and `DateTime#usec` (`activesupport/lib/active_support/core_ext/date_time/conversions.rb:89`). */
function usec(value: Exclude<TemporalDateLike, Temporal.PlainDate>): number {
  if (value instanceof Temporal.ZonedDateTime || value instanceof Temporal.PlainDateTime) {
    return dateTimeUsec(value);
  }
  return (value as TimeWithZone | RubyTime).usec;
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

  quotedBinary(value: BinaryData): string;

  typeCast(value: unknown): unknown;

  castBoundValue(value: unknown): unknown;

  sanitizeAsSqlComment(value: unknown): string;
}

export const Quoting = {
  typeCastedBinds,
};
