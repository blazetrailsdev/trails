import type { ArelConnection } from "../visitors/connection.js";
import { defaultQuoter } from "../visitors/default-quoter.js";
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
 * the call site*: no visitor silently falls back to a default. The underlying
 * `defaultQuoter` values are the invention RFC 0007 is deleting — once every call
 * site names its connection, the visitor constructor defaults go away and these
 * bindings become the only reference, at which point they collapse into this file.
 *
 * @internal
 */
export const testConnection: ArelConnection = defaultQuoter;

/**
 * Port of the Arel suite's `FakeRecord::Connection` quoting
 * (`test/cases/arel/support/fake_record.rb:55-90`).
 *
 * Rails' Arel tests run against this double, not against an adapter, which is
 * why their expected SQL embeds `'t'`/`'f'` for booleans — a rendering no real
 * adapter produces (SQLite quotes `0`, the abstract adapter `FALSE`). Porting it
 * is what makes those assertions reachable verbatim instead of weakened.
 *
 * Only the quoting surface is ported: the rest of `FakeRecord` (schema cache,
 * `Table.engine` wiring) exists to satisfy Rails' `engine.with_connection`
 * indirection, which trails' explicit-connection `toSql(connection)` replaces.
 *
 * @internal
 */
export const fakeRecordConnection: ArelConnection = {
  ...defaultQuoter,

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
    if (thing === null || thing === undefined) return "NULL";
    if (typeof thing === "number" || typeof thing === "bigint") return String(thing);
    if (thing instanceof Temporal.PlainDate) {
      return `'${String(thing.year).padStart(4, "0")}-${String(thing.month).padStart(2, "0")}-${String(thing.day).padStart(2, "0")}'`;
    }
    if (thing instanceof Temporal.PlainDateTime) {
      const p = (n: number): string => String(n).padStart(2, "0");
      return `'${String(thing.year).padStart(4, "0")}-${p(thing.month)}-${p(thing.day)} ${p(thing.hour)}:${p(thing.minute)}:${p(thing.second)}'`;
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
