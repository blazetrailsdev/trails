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
 *   branches via `dispatchQuotedDate`.
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { BigDecimal } from "@blazetrails/activesupport";
import { Attribute as ModelAttribute, BinaryData } from "@blazetrails/activemodel";
import { NotImplementedError } from "../../errors.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import {
  formatInstantForSql,
  formatPlainDateTimeForSql,
  formatPlainDateForSql,
} from "./sql-datetime.js";

/**
 * Host shape the standalone {@link quote} / {@link quoteTableName} dispatch
 * through, mirroring Rails where `quote` calls `self.quoted_date` /
 * `self.quoted_time` and `quote_table_name` calls `self.quote_column_name`.
 * Threading `this` lets an adapter override (e.g. PostgreSQL's BC-aware
 * `quotedDate`) flow into the inherited `quote`. A host receiver is required —
 * every invocation goes through an adapter via `.call(this, value)`; a host
 * that omits `quotedDate` / `quotedTime` / `quotedBinary` falls back to the
 * module-level helpers.
 */
export interface QuotingDispatchHost {
  /** @internal */
  quote?(value: unknown): string;
  /** @internal */
  quotedDate?(value: TemporalDateLike): string;
  /** @internal */
  quotedTime?(value: Temporal.PlainTime | Temporal.PlainDateTime): string;
  /** @internal */
  quotedBinary?(value: unknown): string;
  /** @internal */
  quoteColumnName?(name: string): string;
  /** @internal */
  quotedTrue?(): string;
  /** @internal */
  quotedFalse?(): string;
  /** @internal */
  unquotedTrue?(): boolean | number;
  /** @internal */
  unquotedFalse?(): boolean | number;
}

type TemporalDateLike =
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime;

/**
 * ANSI double-quote identifier quoter (`""`-escaped). Not a Rails-layer
 * method — Rails' abstract `Quoting` has no `quote_identifier`. This is the
 * SQL-92 fallback used only by {@link ABSTRACT_SCHEMA_QUOTER} when DDL is
 * rendered without a live adapter; every real adapter quotes through its own
 * dialect-specific helper.
 *
 * @internal
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

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
export function quoteTableName(this: QuotingDispatchHost, name: string): string {
  if (typeof this.quoteColumnName === "function") {
    return this.quoteColumnName(name);
  }
  return quoteColumnName(name);
}

/**
 * Quote a value for use in SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote
 */
export function quote(this: QuotingDispatchHost, value: unknown): string {
  // rb:75 — `when String, Symbol, ActiveSupport::Multibyte::Chars`.
  if (typeof value === "string") {
    return `'${quoteString(value)}'`;
  }
  if (typeof value === "symbol") {
    const desc = value.description;
    if (desc === undefined) throw new TypeError("Cannot quote a Symbol without a description");
    return `'${quoteString(desc)}'`;
  }
  // Rails: `when true then quoted_true` / `when false then quoted_false`
  // (rb:77-78) — self-dispatched, so SQLite's `1`/`0` override applies to the
  // inherited `quote`. Thread `this` to mirror that.
  if (typeof value === "boolean")
    return value ? dispatchQuotedTrue(this) : dispatchQuotedFalse(this);
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
  if (value instanceof BinaryData) return dispatchQuotedBinary(this, value);
  // ArrayBuffer views have no Ruby analogue (#4868): Rails only ever sees
  // `Type::Binary::Data` here, so they must be normalized to bytes rather than
  // falling to the raise below. Kept at the rb:83 position and self-dispatched,
  // so a view and a `BinaryData` take the same path to the adapter override.
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return dispatchQuotedBinary(this, bytes);
  }
  // Rails dispatches date/time literals through `self.quoted_time` (Time::Value)
  // and `self.quoted_date` (Date/Time) so adapter overrides — e.g. PostgreSQL's
  // BC-suffixing `quoted_date` — are honored. Thread `this` to mirror that.
  if (value instanceof Temporal.PlainTime) return `'${dispatchQuotedTime(this, value)}'`;
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return `'${dispatchQuotedDate(this, value)}'`;
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
  // ArrayBuffer views have no Ruby analogue (#4868): Rails only ever sees a
  // `Type::Binary::Data` here. `quote` already normalizes a view to bytes at the
  // rb:83 position; `type_cast` must do the same at rb:96, or a bare Uint8Array
  // bind (MySQL's binary driver binds are not `Data`-wrapped) falls through to
  // the raise below with "can't cast Uint8Array".
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  // Rails: `when true then unquoted_true` / `when false then unquoted_false`
  // (rb:98-99) — self-dispatched, so MySQL's `1`/`0` override applies to the
  // inherited `type_cast`. Thread `this` to mirror that.
  if (typeof value === "boolean")
    return value ? dispatchUnquotedTrue(this) : dispatchUnquotedFalse(this);
  if (value === null || value === undefined) return value;
  // Rails: `when BigDecimal then value.to_s("F")` — bound as a fixed-form string.
  if (value instanceof BigDecimal) return value.toString("F");
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "string") return value;
  // Rails dispatches `Type::Time::Value` through `self.quoted_time` and
  // `Date`/`Time` through `self.quoted_date` (abstract/quoting.rb:103-104), the
  // same self-dispatch `quote` uses. Thread `this` so adapter overrides — e.g.
  // PostgreSQL's BC-suffixing `quotedDate` — flow into `type_cast` too.
  if (value instanceof Temporal.PlainTime) return dispatchQuotedTime(this, value);
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return dispatchQuotedDate(this, value);
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
  lookupCastType?(sqlType: string): unknown;
}

/**
 * Look up the cast type from a column. Delegates to lookupCastType(column.sql_type)
 * on the adapter, matching Rails' internal delegation chain.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#lookup_cast_type_from_column
 */
export function lookupCastTypeFromColumn(
  this: QuotingHost | void,
  column: { sqlType: string | null },
): unknown {
  const sqlType = column.sqlType;
  if (!sqlType) return null;
  if (this && typeof this === "object" && typeof this.lookupCastType === "function") {
    return this.lookupCastType(sqlType);
  }
  return sqlType;
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
export function quoteTableNameForAssignment(table: string, attr: string): string {
  // `quoteTableName` requires a host receiver; this module-level helper has no
  // adapter, so bind a bare host — dispatch falls to the throwing
  // `quoteColumnName`, matching Rails' abstract behaviour.
  return quoteTableName.call({}, `${table}.${attr}`);
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
  column?: { sqlType?: string | null } | null,
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
  // (abstract/quoting.rb:161). Serialize only when the host exposes a cast type
  // with a `serialize` — the adapter-free fallback (ABSTRACT_SCHEMA_QUOTER) and
  // the mysql schema-quoter have no `lookupCastType`, so `lookupCastTypeFromColumn`
  // returns the raw sqlType string and the value passes through unserialized.
  let serialized: unknown = value;
  if (column != null) {
    const castType = lookupCastTypeFromColumn.call(this, {
      sqlType: column.sqlType ?? null,
    }) as { serialize?(v: unknown): unknown } | null;
    if (castType && typeof castType.serialize === "function") {
      serialized = castType.serialize(value);
    }
  }
  // Rails: `quote(value)` (abstract/quoting.rb:162) — self-dispatched, so a host
  // that overrides `quote` (the mysql schema-quoter binds the dialect's) gets its
  // own dialect quoting, including the raw-view branches the abstract `quote`
  // deliberately lacks. Falling straight to the module `quote` here would bypass
  // the dialect entirely and raise `can't quote Uint8Array` on a binary default.
  // Hosts without a `quote` (ABSTRACT_SCHEMA_QUOTER) keep the module helper.
  return dispatchQuote(this, serialized);
}

/**
 * ANSI fallback quoter used only when a schema visitor or definition is built
 * without a live adapter (the standalone `schemaCreation()` convention helpers
 * and isolated unit tests). Every adapter-backed caller passes its own
 * `SchemaQuoter`, so this never quotes DDL for a real connection; it exists so
 * the abstract schema layer stays usable adapter-free rather than silently
 * routing through whatever dialect happens to import these freestanding
 * functions. Mirrors the `ABSTRACT_QUOTER` crutch in `sanitization.ts`.
 */
export const ABSTRACT_SCHEMA_QUOTER: SchemaQuoter = {
  quoteIdentifier,
  // The adapter-free fallback renders schema-qualified names ANSI-style by
  // quoting each dot-separated part. The public `quoteTableName` mirrors Rails
  // (delegates to the throwing `quoteColumnName`), so it can't back this crutch.
  quoteTableName: (name) =>
    name
      .split(".")
      .map((part) => quoteIdentifier(part))
      .join("."),
  quoteDefaultExpression,
};

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
  // `ArrayBuffer.isView` (#4868) rather than `instanceof Uint8Array`: it also
  // catches a DataView or a non-byte typed array, and threading
  // byteOffset/byteLength keeps a subarray view from reading its whole backing
  // buffer. A bare ArrayBuffer is not a view, so it needs its own branch.
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

export function isSqlLiteral(value: unknown): value is { value: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    value.constructor?.name === "SqlLiteral" &&
    typeof (value as any).value === "string"
  );
}

/**
 * Self-dispatch binary quoting through the host, mirroring Rails' `quote`
 * calling `self.quoted_binary(value)` so an adapter override applies. Falls
 * back to the module-level helper when the host omits it.
 *
 * Takes `unknown` rather than `BinaryData`: the rb:83 branch passes a
 * `BinaryData`, but the abstract view branch passes normalized bytes and
 * SQLite's bare-`ArrayBuffer` branch dispatches the buffer itself. The
 * abstract/MySQL/SQLite/PostgreSQL `quotedBinary` all normalise these through
 * {@link toBytes}.
 * @internal
 */
export function dispatchQuotedBinary(host: QuotingDispatchHost, value: unknown): string {
  if (typeof host.quotedBinary === "function") {
    return host.quotedBinary(value);
  }
  return quotedBinary(value);
}

/**
 * Dispatch through the host's `quotedDate` override if it defines one, else
 * the module-level helper. A host receiver is required — there are no
 * receiver-less callers (every invocation threads an adapter `this`).
 * @internal
 */
export function dispatchQuotedDate(host: QuotingDispatchHost, value: TemporalDateLike): string {
  if (typeof host.quotedDate === "function") {
    return host.quotedDate(value);
  }
  return quotedDate(value);
}

/**
 * Dispatch through the host's `quote` override if it defines one, else the
 * module-level helper. Mirrors Rails' bare `quote(value)` self-dispatch inside
 * `quote_default_expression` (abstract/quoting.rb:162).
 * @internal
 */
export function dispatchQuote(host: QuotingDispatchHost, value: unknown): string {
  if (typeof host.quote === "function") {
    return host.quote(value);
  }
  return quote.call(host, value);
}

/**
 * Dispatch the boolean literals through the host's overrides if it defines
 * them, else the module-level helpers, so an adapter's override applies to the
 * *inherited* `quote` / `type_cast` rather than forcing each adapter to
 * re-implement the whole boolean arm.
 *
 * One helper per Rails method — `when true then quoted_true` and `when false
 * then quoted_false` are four distinct `self.` sends (abstract/quoting.rb:77-78,
 * 98-99) — matching the one-method-per-helper shape of `dispatchQuotedTime` /
 * `dispatchQuotedBinary` / `dispatchQuotedDate`.
 * @internal
 */
export function dispatchQuotedTrue(host: QuotingDispatchHost): string {
  return typeof host.quotedTrue === "function" ? host.quotedTrue() : quotedTrue();
}

/** @internal */
export function dispatchQuotedFalse(host: QuotingDispatchHost): string {
  return typeof host.quotedFalse === "function" ? host.quotedFalse() : quotedFalse();
}

/** @internal */
export function dispatchUnquotedTrue(host: QuotingDispatchHost): boolean | number {
  return typeof host.unquotedTrue === "function" ? host.unquotedTrue() : unquotedTrue();
}

/** @internal */
export function dispatchUnquotedFalse(host: QuotingDispatchHost): boolean | number {
  return typeof host.unquotedFalse === "function" ? host.unquotedFalse() : unquotedFalse();
}

/** @internal */
export function dispatchQuotedTime(host: QuotingDispatchHost, value: Temporal.PlainTime): string {
  if (typeof host.quotedTime === "function") {
    return host.quotedTime(value);
  }
  return quotedTime.call(host, value);
}

/**
 * Format a date/time value for SQL without surrounding quotes.
 * Temporal.Instant and ZonedDateTime respect default_timezone.
 *
 * @internal
 */
export function quotedDate(
  value:
    | Temporal.Instant
    | Temporal.ZonedDateTime
    | Temporal.PlainDateTime
    | Temporal.PlainDate
    | Temporal.PlainTime,
): string {
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
 * @internal
 */
export function quotedTime(
  this: QuotingDispatchHost,
  value: Temporal.PlainTime | Temporal.PlainDateTime,
): string {
  const dt =
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
  return dispatchQuotedDate(this, dt).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

/** @internal */
function typeCastedBinds(
  this: { typeCast: (v: unknown) => unknown },
  binds: unknown[] | null | undefined,
): unknown[] | undefined {
  return binds?.map((value: any) => {
    // Attribute detection is duck-typed rather than `instanceof ModelAttribute`:
    // when the dep tree resolves two copies of `@blazetrails/activemodel` the
    // instanceof check silently misses and the raw Attribute object reaches
    // `typeCast`, which throws "can't cast Attribute".
    if (
      value instanceof ModelAttribute ||
      (value && typeof value === "object" && "valueForDatabase" in value)
    ) {
      const vfd = value.valueForDatabase;
      return this.typeCast(typeof vfd === "function" ? value.valueForDatabase() : vfd);
    }
    return this.typeCast(value);
  });
}

/**
 * Mixin object for AbstractAdapter: bundles standalone Quoting helpers so
 * `include(AbstractAdapter, Quoting)` credits them to the host class.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting (included in AbstractAdapter)
 */
export const Quoting = {
  quotedDate,
  quotedTime,
  typeCastedBinds,
};
