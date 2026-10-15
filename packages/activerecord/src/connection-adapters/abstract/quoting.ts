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
import { actsLike, BigDecimal, Chars, TimeWithZone } from "@blazetrails/activesupport";
import { Attribute as ModelAttribute, BinaryData, type ValueType } from "@blazetrails/activemodel";
import {
  rbFSend,
  rbObjAsString,
  rbObjClassname,
  rbObjRespondTo,
  Rational,
  sprintf,
  TypeError,
} from "@blazetrails/ruby-compat";
import type { TypeMap } from "../../type/type-map.js";
import { NotImplementedError } from "../../errors.js";
import { Value as TimeValue } from "../../type/time.js";

export interface QuotingClassMethods {
  quoteColumnName(columnName: unknown): string;
  quoteTableName(tableName: unknown): string;
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
  columnNameMatcher(): RegExp {
    return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
  },

  columnNameWithOrderMatcher(): RegExp {
    return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
  },

  quoteColumnName(_columnName: unknown): string {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/quoting.rb:61
    throw new NotImplementedError();
  },

  quoteTableName(this: QuotingClassMethods, tableName: unknown): string {
    return this.quoteColumnName(tableName);
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
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Number ||
    value instanceof Rational
  ) {
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

export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  if (value instanceof Chars || value instanceof BinaryData) return rbObjAsString(value);
  if (value === true) return this.unquotedTrue();
  if (value === false) return this.unquotedFalse();
  if (value instanceof BigDecimal) return value.toString("F");
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    value instanceof Number ||
    typeof value === "bigint" ||
    value instanceof Rational ||
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
  if (actsLike.call(value, "time")) {
    if (this.defaultTimezone === "utc") {
      if (!rbFSend(value, "isUtc")) value = rbFSend(value, "getutc") as TemporalDateLike;
    } else {
      value = rbFSend(value, "getlocal") as TemporalDateLike;
    }
  }

  const result = rbFSend(value, "toFs", "db") as string;
  if (rbObjRespondTo(value, "usec") && (rbFSend(value, "usec") as number) > 0) {
    return result + "." + sprintf("%06d", rbFSend(value, "usec"));
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

/** @internal */
export function lookupCastType(
  this: { typeMap: TypeMap },
  sqlType: string | number | null,
): ValueType {
  return this.typeMap.lookup(sqlType as string | null);
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
