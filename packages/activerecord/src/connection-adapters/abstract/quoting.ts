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

/**
 * Receiver shape for the `this`-typed functions in this module, standing in for
 * the `self` Rails' `Quoting` module sends to: `quote` sends `quote_string`,
 * `quoted_true`, `quoted_binary`, `quoted_time` and `quoted_date`
 * (abstract/quoting.rb:73-89), and `ClassMethods#quote_table_name` sends
 * `quote_column_name` (rb:65-68). Every member is required, exactly as a Ruby self-send has no
 * conditional arm — a receiver that defines none of them inherits the abstract
 * ones, and one missing a quoter is a compile error here rather than a silent
 * fall back to the ANSI answer.
 */
/**
 * Receiver shape for `Quoting::ClassMethods` (abstract/quoting.rb:8-69), whose
 * only member either function here sends is `quote_column_name`. Narrower than
 * {@link QuotingDispatchHost} because Rails' class-level `quote_table_name` runs
 * on the adapter class, which carries no instance quoting members.
 */
export interface QuotingClassMethods {
  quoteColumnName(name: string): string;
}

export interface QuotingDispatchHost {
  quote(value: unknown): string;
  quotedDate(value: TemporalDateLike): string;
  quotedTime(value: QuotedTimeValue): string;
  quotedBinary(value: unknown): string;
  quoteString(s: string): string;
  quoteColumnName(name: string): string;
  quoteTableName(name: string): string;
  quotedTrue(): string;
  quotedFalse(): string;
  unquotedTrue(): boolean | number;
  unquotedFalse(): boolean | number;
}

/**
 * What `quoted_time` is handed: Rails' `Type::Time::Value` (the `DelegateClass`
 * `Type::Time#serialize` wraps a cast time in), plus the bare `Temporal` shapes
 * an adapter's own wire parsers produce for a `time` column.
 */
export type QuotedTimeValue = TimeValue | Temporal.PlainTime | Temporal.PlainDateTime;

type TemporalDateLike =
  | TimeWithZone
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime;

/**
 * Quotes the column name. Must be implemented by subclasses — the abstract
 * layer raises, mirroring Rails where every adapter defines its own.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#quote_column_name
 * (activerecord/.../abstract/quoting.rb L61 — `raise NotImplementedError`)
 */
export function quoteColumnName(_columnName: string): string {
  // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/quoting.rb:61
  throw new NotImplementedError();
}

/**
 * Quotes the table name. Defaults to column-name quoting with no dot-split;
 * schema-qualified handling is adapter-specific (PG/MySQL/SQLite each override).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#quote_table_name
 * (activerecord/.../abstract/quoting.rb L66 — `quote_column_name(table_name)`)
 */
export function quoteTableName(this: QuotingClassMethods, name: string): string {
  return this.quoteColumnName(name);
}

/**
 * Quote a value for use in SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote
 */
export function quote(this: QuotingDispatchHost, value: unknown): string {
  // rb:75-76 — `when String, Symbol, ActiveSupport::Multibyte::Chars` then
  // `"'#{quote_string(value.to_s)}'"`. `quote_string` is self-dispatched, so the
  // surrounding quotes are added here, once, and the dialect's escape rules come
  // from the adapter's override.
  if (typeof value === "string") {
    return `'${this.quoteString(value)}'`;
  }
  if (typeof value === "symbol") {
    const desc = value.description;
    if (desc === undefined) throw new TypeError("Cannot quote a Symbol without a description");
    return `'${this.quoteString(desc)}'`;
  }
  // Rails: `when true then quoted_true` / `when false then quoted_false`
  // (rb:77-78) — self-dispatched, so SQLite's `1`/`0` override applies to the
  // inherited `quote`. Thread `this` to mirror that.
  if (typeof value === "boolean") return value ? this.quotedTrue() : this.quotedFalse();
  if (value === null || value === undefined) return "NULL";
  // BigDecimals need to be put in a non-normalized (fixed, ".0"-bearing) form
  // and quoted bare — Rails: `when BigDecimal then value.to_s("F")`.
  //
  // Rails must keep this ahead of Numeric (rb:81-82) because Ruby's BigDecimal
  // *is* a Numeric, so a later arm would never be reached. That constraint does
  // not carry over: this chain dispatches on typeof/instanceof, under which
  // BigDecimal is an "object" and the Numeric arm below cannot swallow it. The
  // order is kept to mirror rb:81-82, not because TS depends on it.
  if (value instanceof BigDecimal) return value.toString("F");
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  // Rails: `when Type::Binary::Data then quoted_binary(value)` (rb:83) —
  // self-dispatched so an adapter's `quoted_binary` override (PG's bytea escape,
  // MySQL/SQLite's `x'..'` hex) is honored. Thread `this` to mirror that. The
  // `Data` is passed through unwrapped, as Rails does; each override unwraps it
  // itself (`value.to_s` / `value.hex`).
  if (value instanceof BinaryData) return this.quotedBinary(value);
  // ArrayBuffer views have no Ruby analogue (#4868): Rails only ever sees
  // `Type::Binary::Data` here, so they must be normalized to bytes rather than
  // falling to the raise below. Kept at the rb:83 position and self-dispatched,
  // so a view and a `BinaryData` take the same path to the adapter override.
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return this.quotedBinary(bytes);
  }
  // Rails dispatches date/time literals through `self.quoted_time` (Time::Value)
  // and `self.quoted_date` (Date/Time) so adapter overrides — e.g. PostgreSQL's
  // BC-suffixing `quoted_date` — are honored. Thread `this` to mirror that.
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
  // Rails: when Class then "'#{value}'"
  if (typeof value === "function" && value.name) {
    return `'${value.name}'`;
  }
  throw new TypeError(`can't quote ${(value as object).constructor?.name ?? typeof value}`);
}

/**
 * Cast a value to a type the database understands.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#type_cast
 */
export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  // Rails: `when Symbol, ActiveSupport::Multibyte::Chars, Type::Binary::Data
  // then value.to_s` (rb:96). For a `Data`, `to_s` is the BINARY-encoded String
  // — the raw bytes — so our analogue is `.bytes`, NOT `toString()`, which
  // UTF-8-decodes and would replace every byte >= 0x80 with U+FFFD (see
  // {@link quotedBinary}). `BinaryType#serialize` emits a `Data`, so every bind
  // path for a binary attribute lands here.
  if (typeof value === "symbol") return value.description ?? String(value);
  if (value instanceof BinaryData) return value.bytes;
  // Rails: `when true then unquoted_true` / `when false then unquoted_false`
  // (rb:98-99) — self-dispatched, so MySQL's `1`/`0` override applies to the
  // inherited `type_cast`. Thread `this` to mirror that.
  if (typeof value === "boolean") return value ? this.unquotedTrue() : this.unquotedFalse();
  if (value === null || value === undefined) return value;
  // Rails: `when BigDecimal then value.to_s("F")` — bound as a fixed-form string.
  if (value instanceof BigDecimal) return value.toString("F");
  if (typeof value === "number" || typeof value === "bigint") return value;
  // Rails: `when nil, Numeric, String then value` (rb:102). A Ruby String here
  // is frequently a BINARY/ASCII-8BIT one — `execute(sql, binds)` callers bind
  // raw bytes that way, which is what sqlite3's `test_type_cast_binary_encoding_
  // _without_logger` (test/cases/adapters/sqlite3/quoting_test.rb:32) and
  // `test_type_cast_should_not_mutate_encoding` (sqlite3_adapter_test.rb:482)
  // pass. A JS string is UTF-16 and cannot carry arbitrary bytes, so the byte
  // views are this arm's analogue, not a fourth branch: they pass through
  // untouched exactly as Rails passes the String through.
  if (typeof value === "string") return value;
  if (ArrayBuffer.isView(value)) return value;
  // Rails dispatches `Type::Time::Value` through `self.quoted_time` and
  // `Date`/`Time` through `self.quoted_date` (abstract/quoting.rb:103-104), the
  // same self-dispatch `quote` uses. Thread `this` so adapter overrides — e.g.
  // PostgreSQL's BC-suffixing `quotedDate` — flow into `type_cast` too.
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

/**
 * Cast a value to be used as a bound parameter of unknown type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#cast_bound_value
 */
export function castBoundValue(value: unknown): unknown {
  return value;
}

/**
 * Host interface for quoting methods that need adapter context.
 */
export interface QuotingHost {
  /** @internal */
  lookupCastType(sqlType: string | null): unknown;
}

/**
 * Look up the cast type from a column. Delegates to lookupCastType(column.sql_type)
 * on the adapter, matching Rails' internal delegation chain.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#lookup_cast_type_from_column
 * (abstract/quoting.rb:125-127 — `lookup_cast_type(column.sql_type)`)
 */
export function lookupCastTypeFromColumn(
  this: QuotingHost,
  column: { sqlType: string | null },
): unknown {
  return this.lookupCastType(column.sqlType);
}

/**
 * Quotes a string, escaping any ' (single quote) and \ (backslash) characters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_string
 */
export function quoteString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/**
 * Quote a table name for assignment (table.column form).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name_for_assignment
 */
export function quoteTableNameForAssignment(
  this: QuotingDispatchHost,
  table: string,
  attr: string,
): string {
  // Rails: `quote_table_name("#{table}.#{attr}")` (abstract/quoting.rb:152-154) —
  // self-sent, which MySQL's `table`.`attr` override depends on.
  return this.quoteTableName(`${table}.${attr}`);
}

/**
 * Quote a column default expression for use in DDL.
 *
 * Raw SQL defaults should be expressed as:
 * - A function: `() => "CURRENT_TIMESTAMP"` (mirrors Rails `-> { "CURRENT_TIMESTAMP" }`)
 * - An Arel SqlLiteral: `new SqlLiteral("CURRENT_TIMESTAMP")` (mirrors `Arel.sql(...)`)
 *
 * Non-Proc values are serialized through the column's cast type before quoting
 * (rb:161 `lookup_cast_type(column.sql_type).serialize(value)`), then quoted via
 * `quote()`. The returned literal is **bare** — the ` DEFAULT ` keyword is owned
 * by the caller (`add_column_options!`, `schema_creation.rb:150`), matching Rails.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#quote_default_expression
 */
export function quoteDefaultExpression(
  this: QuotingDispatchHost & QuotingHost,
  value: unknown,
  column: { sqlType?: string | null },
): string {
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
  // Rails: `value = lookup_cast_type(column.sql_type).serialize(value)`
  // (abstract/quoting.rb:161) — dispatched unconditionally, since every host of
  // this module is an adapter carrying a type map.
  const castType = this.lookupCastType(column.sqlType ?? null) as {
    serialize?(v: unknown): unknown;
  } | null;
  const serialized: unknown =
    castType && typeof castType.serialize === "function" ? castType.serialize(value) : value;
  // Rails: `quote(value)` (abstract/quoting.rb:162) — self-sent, so the receiver's
  // dialect quoting applies, including the raw-view branches the abstract `quote`
  // deliberately lacks.
  return this.quote(serialized);
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_true
 */
export function quotedTrue(): string {
  return "TRUE";
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#unquoted_true
 */
export function unquotedTrue(): boolean {
  return true;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_false
 */
export function quotedFalse(): string {
  return "FALSE";
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#unquoted_false
 */
export function unquotedFalse(): boolean {
  return false;
}

/**
 * Normalise every byte source `quotedBinary` may receive to a `Uint8Array`, or
 * `null` if the value is not one. Rails' `quoted_binary` family takes a
 * `Type::Binary::Data` and calls `value.to_s` / `value.hex`; trails' `quote`
 * unwraps to bytes before dispatching, and the adapters' boundary branches pass
 * raw views — so an implementation has to accept that union to be callable
 * either way.
 *
 * The abstract, MySQL, SQLite and PostgreSQL `quotedBinary` all route through
 * this, so every adapter accepts the same union.
 *
 * @internal
 */
export function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof BinaryData) return value.bytes;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

/**
 * Quote binary data for SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quoted_binary
 * (abstract/quoting.rb:206 — `"'#{quote_string(value.to_s)}'"`).
 *
 * Rails' `value` is a `Type::Binary::Data` whose `to_s` is the raw byte
 * string. JS has no such coercion — `String(new Uint8Array([0x1f, 0x8b]))` is
 * `"31,139"`, the comma-joined decimals — so bytes are decoded latin1 to reach
 * the byte string `quote_string` expects. Every real adapter overrides this
 * with a dialect binary literal; this is the abstract fallback.
 */
export function quotedBinary(value: unknown): string {
  // Rails quotes `value.to_s`, which for `Type::Binary::Data` is a BINARY-encoded
  // String — byte-exact. `String(value)` can't stand in for it: for a Uint8Array
  // it yields "1,2,3", for an ArrayBuffer "[object ArrayBuffer]", and for a
  // BinaryData it runs `toString()`, which UTF-8-decodes and silently replaces
  // any invalid sequence with U+FFFD (0xde 0xad 0xbe 0xef → 3 lossy chars). So
  // normalise every byte source and decode latin1, which maps bytes 1:1. Rails'
  // signature takes the `Data` itself (rb:206), which is what `quote` passes;
  // `dispatchQuotedBinary` also receives raw views from trails-only callers.
  const bytes = toBytes(value);
  if (bytes) {
    return `'${quoteString(Buffer.from(bytes).toString("latin1"))}'`;
  }
  return `'${quoteString(String(value))}'`;
}

/**
 * Sanitize a string to appear within a SQL comment.
 * Strips surrounding comment markers and escapes internal ones.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#sanitize_as_sql_comment
 */
export function sanitizeAsSqlComment(value: unknown): string {
  let comment = String(value);
  comment = comment.replace(/^\s*\/\*\+?\s?/, "").replace(/\s?\*\/\s*$/, "");
  comment = comment.replace(/\*\//g, "* /");
  comment = comment.replace(/\/\*/g, "/ *");
  return comment;
}

/**
 * Regexp for column names (with or without a table name prefix).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#column_name_matcher
 */
export function columnNameMatcher(): RegExp {
  // Direct JS translation of Rails' abstract adapter column_name_matcher.
  // Ruby source uses \g<2> for recursion; JS approximates at 2 levels
  // (handles length(trim(col)) and similar real-world cases).
  //
  // Rails Ruby:
  //   /((?:\w+\.)?\w+ | \w+\((?:|\g<2>)\)) (?:(?:\s+AS)?\s+\w+)?
  //   (?:\s*,\s*\g<1>)*/ix
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:(?:\s+AS)?\s+\w+)?)*$/i;
}

/**
 * Regexp for column names with order.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting::ClassMethods#column_name_with_order_matcher
 */
export function columnNameWithOrderMatcher(): RegExp {
  // Direct JS translation of Rails' abstract adapter column_name_with_order_matcher.
  // No COLLATE (abstract has none); NULLS FIRST/LAST included per Rails abstract pattern.
  //
  // Rails Ruby:
  //   /((?:\w+\.)?\w+ | \w+\((?:|\g<2>)\)) (?:\s+ASC|\s+DESC)?
  //   (?:\s+NULLS\s+(?:FIRST|LAST))? (?:\s*,\s*\g<1>)*/ix
  return /^((?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?\w+)\)))\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*$/i;
}

/**
 * Rails writes this inline as `Arel::Nodes::SqlLiteral === value` at each
 * branch (abstract/quoting.rb `quote`/`type_cast`); there is no
 * `sql_literal?` predicate to mirror. Factored out here only because TS
 * cannot spell `===`-style case matching. Adapter-internal rather than public
 * API — sqlite3-adapter.ts imports it for the same branch — hence `@internal`.
 *
 * @internal
 */
export function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}

/**
 * Format a date/time value for SQL without surrounding quotes.
 * Temporal.Instant and ZonedDateTime respect default_timezone.
 *
 * @internal
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
  // Rails: `value.acts_like?(:time)` (abstract/quoting.rb:185-191), which an
  // `ActiveSupport::TimeWithZone` answers true (time_with_zone.rb:504-506). Both
  // the `getutc` and the `getlocal` arm name the same instant, and rendering it
  // in `default_timezone` is what `formatInstantForSql` already does.
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

/**
 * Format a time value for SQL, stripping the date prefix.
 *
 * Mirrors Rails' `quoted_time` (abstract/quoting.rb:203), which normalises the
 * date to 2000-01-01 then returns `quoted_date(value).sub(/\A\d\d\d\d-\d\d-\d\d /, "")`
 * — dispatching through `self.quoted_date`. We thread `this` the same way so an
 * adapter `quotedDate` override is honored here too.
 *
 * A `Type::Time::Value` is unwrapped first: Rails' `value.change(year: 2000,
 * month: 1, day: 1)` reads the `::Time`'s components in `default_timezone`,
 * which is what `quoted_date` would have read them in too.
 *
 * @internal
 */
export function quotedTime(this: QuotingDispatchHost, value: QuotedTimeValue): string {
  if (value instanceof TimeValue) {
    value = value.getobj().toZonedDateTimeISO(defaultSqlTimezone()).toPlainDateTime();
  }
  value =
    value instanceof Temporal.PlainTime
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

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#lookup_cast_type
 * (abstract/quoting.rb:234-236)
 *
 * Rails marks it private; TS has no equivalent for a mixed-in member adapters
 * must still dispatch through `this`, so it is public and `@internal`.
 * @internal
 */
export function lookupCastType(this: { typeMap: TypeMap }, sqlType: string | null): Type {
  return this.typeMap.lookup(sqlType);
}

/**
 * Quoting interface — the contract every connection adapter satisfies
 * for value/identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting (mixed into
 * AbstractAdapter; PG/MySQL/SQLite override what differs).
 *
 * Call sites depend on this interface — never on the standalone
 * functions below — so dialect dispatch happens via the active adapter
 * rather than a string-enum parameter.
 *
 * @internal
 */
export interface Quoting {
  /** Mirrors: Quoting#quote — SQL-literal form of a value. */
  quote(value: unknown): string;

  /**
   * Mirrors: Quoting#quote_string — **escape-only**. Doubles `'` and
   * applies any dialect-specific escape rules (MySQL `\\\0\n\r\Z`).
   * Never adds surrounding `'`; `quote` adds those once
   * (abstract/quoting.rb:75-76, 131-133). For a fully-quoted SQL literal
   * use `quote(value)` instead.
   */
  quoteString(s: string): string;

  /** Mirrors: Quoting#quote_table_name (handles schema-qualified names). */
  quoteTableName(name: string): string;

  /** Mirrors: Quoting#quote_column_name. */
  quoteColumnName(name: string): string;

  /** Mirrors: Quoting#quote_table_name_for_assignment (`UPDATE ... SET col = ...`). */
  quoteTableNameForAssignment(table: string, attr: string): string;

  /** Mirrors: Quoting#quote_default_expression (DDL DEFAULT clause).
   * Awaitable: PG's override resolves the column's cast type with a live
   * `SELECT '<sql_type>'::regtype::oid` query (postgresql/quoting.rb:195),
   * so callers must `await` the result; the other adapters return plain
   * strings. */
  quoteDefaultExpression(value: unknown, column: unknown): string | Promise<string>;

  /** Mirrors: Quoting#quoted_true. Abstract/PG/MySQL: `"TRUE"`; SQLite: `"1"`. */
  quotedTrue(): string;

  /** Mirrors: Quoting#quoted_false. */
  quotedFalse(): string;

  /** Mirrors: Quoting#unquoted_true. PG: `true`; MySQL/SQLite: `1`. */
  unquotedTrue(): boolean | number;

  /** Mirrors: Quoting#unquoted_false. */
  unquotedFalse(): boolean | number;

  /** Mirrors: Quoting#quoted_binary — adapter-specific binary literal. */
  quotedBinary(value: unknown): string;

  /** Mirrors: Quoting#type_cast — primitive form for bind params. */
  typeCast(value: unknown): unknown;

  /** Mirrors: Quoting#cast_bound_value — bound-param coercion. */
  castBoundValue(value: unknown): unknown;

  /** Mirrors: Quoting#sanitize_as_sql_comment — strip comment-close sequences from comment text. */
  sanitizeAsSqlComment(value: unknown): string;
}

// `column_name_matcher` / `column_name_with_order_matcher` are deliberately
// NOT on this interface. In Rails they live in `Quoting::ClassMethods`
// (active_record/connection_adapters/abstract/quoting.rb:18, :33) — the
// regexes don't depend on instance state, so they're class methods.
// Trails mirrors that with `static columnNameMatcher()` on each concrete
// adapter (e.g. SQLite3Adapter:97). Call sites resolve them via
// `adapter.constructor.columnNameMatcher()` (relation.ts:211,
// query-methods.ts:155).

/**
 * Mixin object for AbstractAdapter: bundles standalone Quoting helpers so
 * `include(AbstractAdapter, Quoting)` credits them to the host class. The rest
 * of the module's members are wired as one-line delegating methods on
 * `AbstractAdapter` itself (`quoteString`, `quotedTrue`, `quotedDate`, …), so
 * only the ones with no class-level counterpart travel through here.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting (included in AbstractAdapter)
 */
export const Quoting = {
  typeCastedBinds,
};
