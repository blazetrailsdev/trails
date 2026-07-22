import type { ArelConnection } from "../visitors/connection.js";
import type { ArelEngine } from "../nodes/node.js";
import { ToSql } from "../visitors/to-sql.js";
import { defaultQuoter, mysqlDefaultQuoter, postgresqlDefaultQuoter } from "./default-quoter.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

/**
 * Explicit connections for Arel visitor construction in tests.
 *
 * Rails' Arel tests build visitors with a real connection —
 * `Visitors::ToSql.new Table.engine.lease_connection`
 * (`arel/nodes/sql_literal_test.rb:10`, `arel/visitors/sqlite_test.rb:9`), where
 * `Arel::Table.engine` is `ActiveRecord::Base`. Rails has no connection-less
 * visitor path at all: `Node#to_sql` and `TreeManager#to_sql` both go through
 * `engine.with_connection { |c| c.visitor.accept(...) }`
 * (`arel/nodes/node.rb:148-153`, `arel/tree_manager.rb:53`).
 *
 * trails cannot copy that literally here: `@blazetrails/activerecord` depends on
 * `@blazetrails/arel`, so arel-side tests importing a real adapter back would be
 * circular. Rails has no such constraint — Arel and ActiveRecord ship in one gem.
 * So arel's own tests use these stubs, while activerecord's tests supply the real
 * adapter as Rails does.
 *
 * The point of routing through this module is that the connection is *explicit at
 * the call site*: no visitor falls back to a default — the constructor defaults
 * (and the production `defaultQuoter` surface) were deleted by RFC 0007. The
 * quoting hosts now live next door in `test-helpers/default-quoter.ts`, a
 * permanent test-only stub (see its header for why the package split forces it).
 *
 * @internal
 */
export const testConnection: ArelConnection = defaultQuoter;

/**
 * The MySQL/PostgreSQL analogues of {@link testConnection}. Unlike the generic
 * `defaultQuoter`, they render adapter-specific forms (PG array literals, MySQL
 * backticks) the Arel visitor tests assert on.
 *
 * @internal
 */
export const mysqlTestConnection: ArelConnection = mysqlDefaultQuoter;

/** @internal */
export const postgresqlTestConnection: ArelConnection = postgresqlDefaultQuoter;

// Stands in for a method FakeRecord does not define. Rails gets this for free —
// an undefined method on the double raises NoMethodError — so raising here is the
// faithful behaviour, and it turns any future reachability into a loud failure
// naming the method rather than silent default-quoter output.
function unreachableOnFakeRecord(name: string): () => never {
  return () => {
    throw new Error(
      `${name} is not defined on FakeRecord: Rails' Arel visitor never calls it on this double. ` +
        `Reaching it means the visitor diverged from Rails — fix the visitor, not this double.`,
    );
  };
}

// Ruby `Time#to_s` — `"YYYY-MM-DD HH:MM:SS +ZZZZ"` (space-separated, no
// fractional seconds, four-digit zone offset). Used by the FakeRecord double's
// `else` arm below for the Time analogues, whose own `toString` is ISO.
function rubyTimeToS(zdt: Temporal.ZonedDateTime): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  const offsetMinutes = zdt.offsetNanoseconds / 60_000_000_000;
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${p(Math.floor(abs / 60))}${p(abs % 60)}`;
  return `${String(zdt.year).padStart(4, "0")}-${p(zdt.month)}-${p(zdt.day)} ${p(zdt.hour)}:${p(zdt.minute)}:${p(zdt.second)} ${offset}`;
}

/**
 * Port of the Arel suite's `FakeRecord::Connection` quoting
 * (`test/cases/arel/support/fake_record.rb:55-90`).
 *
 * Rails' Arel tests run against this double, not against an adapter, which is
 * why their expected SQL embeds `'t'`/`'f'` for booleans — a rendering no real
 * adapter produces (SQLite quotes `0`, the abstract adapter `FALSE`). Porting it
 * is what makes those assertions reachable verbatim instead of weakened.
 *
 * Only the quoting surface is ported; `FakeRecord`'s schema cache is not. The
 * `Table.engine` wiring IS needed — see `fakeRecordEngine` below.
 *
 * @internal
 */
export const fakeRecordConnection: ArelConnection = {
  // FakeRecord defines ONLY the methods Rails' visitor actually calls on it —
  // no `quoted_true`/`quoted_false`/`quoted_binary`/`quote_string`/`unquoted_*`.
  // `ArelConnection` is a TS interface so they must exist; they raise rather than
  // borrowing `defaultQuoter`, which would (a) re-anchor this double on the
  // connection-less quoter RFC 0007 is deleting and (b) silently emit adapter
  // renderings (`TRUE`) from a double whose entire purpose is to emit `'t'`.
  // Verified unreachable, not merely unused: the ToSql visitor calls none of them
  // (they appear nowhere in visitors/to-sql.ts), and `unquotedTrue`/`unquotedFalse`
  // are reached only via quoteArrayLiteral (quote-array.ts:86), which only the PG
  // quoter's own `quote` override calls — an override this double replaces.
  quoteString: unreachableOnFakeRecord("quoteString"),
  quotedBinary: unreachableOnFakeRecord("quotedBinary"),
  quotedTrue: unreachableOnFakeRecord("quotedTrue"),
  quotedFalse: unreachableOnFakeRecord("quotedFalse"),
  unquotedTrue: unreachableOnFakeRecord("unquotedTrue"),
  unquotedFalse: unreachableOnFakeRecord("unquotedFalse"),

  quoteTableName(name: string): string {
    return `"${name}"`;
  },

  quoteColumnName(name: string): string {
    return `"${name}"`;
  },

  // fake_record.rb:71-87. Note the `else` arm escapes `'` as `\'`, not `''`.
  quote(thing: unknown): string {
    if (thing === true) return "'t'";
    if (thing === false) return "'f'";
    // Ruby has one nil; JS has two nullish values. `undefined` joins the NULL arm
    // rather than falling to `else` (which would emit `'undefined'` as a string)
    // because the sibling quoters treat the pair alike (default-quoter.ts
    // `quoteScalar`). Letting it stringify here would make this double the only
    // quoter in the package that renders a nullish as a quoted literal.
    if (thing === null || thing === undefined) return "NULL";
    if (typeof thing === "number" || typeof thing === "bigint") return String(thing);
    if (thing instanceof Temporal.PlainDate) {
      return `'${String(thing.year).padStart(4, "0")}-${String(thing.month).padStart(2, "0")}-${String(thing.day).padStart(2, "0")}'`;
    }
    if (thing instanceof Temporal.PlainDateTime) {
      const p = (n: number): string => String(n).padStart(2, "0");
      return `'${String(thing.year).padStart(4, "0")}-${p(thing.month)}-${p(thing.day)} ${p(thing.hour)}:${p(thing.minute)}:${p(thing.second)}'`;
    }
    // fake_record.rb has no explicit `Time` arm: a Ruby `Time` falls to `else`
    // and renders via `to_s` — `"2024-01-01 00:00:00 +0000"` (attribute_test.rb:273
    // interpolates `'#{current_time}'` and asserts that shape). The Temporal
    // analogues stringify as ISO (`2024-01-01T00:00:00Z`), so `String(thing)`
    // in the fallback would diverge; hand-render Ruby's `Time#to_s` shape
    // instead. An Instant carries no zone and renders in UTC (`+0000`), like a
    // `Time` under `TZ=UTC`.
    if (thing instanceof Temporal.Instant) {
      return `'${rubyTimeToS(thing.toZonedDateTimeISO("UTC"))}'`;
    }
    if (thing instanceof Temporal.ZonedDateTime) {
      return `'${rubyTimeToS(thing)}'`;
    }
    return `'${String(thing).replace(/'/g, "\\'")}'`;
  },

  // fake_record.rb:63-65 — the comment is returned unchanged.
  sanitizeAsSqlComment(value: string): string {
    return value;
  },

  // fake_record.rb:90-92.
  castBoundValue(value: unknown): unknown {
    return value;
  },
};

/**
 * Port of `FakeRecord::Base` as an Arel engine (`fake_record.rb:125-139`).
 *
 * Rails' `Arel::Test#setup` does `Arel::Table.engine = FakeRecord::Base.new`
 * (`test/cases/arel/helper.rb:19-20`), and `FakeRecord::Connection#initialize`
 * builds its visitor as `Arel::Visitors::ToSql.new(self)` (`fake_record.rb:36`)
 * — so the double's `'t'`/`'f'` quoting is what the whole suite compiles
 * through. trails is not there yet: `test-setup-engine.ts` still installs a
 * generic `ToSql` suite-wide, because switching the default would change the
 * expected SQL of every boolean assertion at once. Tracked by story
 * `arel-suite-engine-is-fake-record-base`.
 *
 * Until then this is opt-in, for the cases whose Rails counterpart asserts a
 * FakeRecord rendering.
 *
 * @internal
 */
export const fakeRecordEngine: ArelEngine = {
  connection: { visitor: new ToSql(fakeRecordConnection) },
};
