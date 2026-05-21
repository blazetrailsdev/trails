/**
 * Test helpers for writing adapter-agnostic SQL assertions.
 *
 * Mirrors Rails' canonical pattern. In `activerecord/test/cases/` Rails
 * inlines the regex-escaped quoted identifier at the call site:
 *
 *     assert_match %r{ ... #{Regexp.escape(quote_table_name("posts.title"))} ... }, sql
 *
 * In Rails, `quote_table_name` is just `@connection.quote_table_name` —
 * the live adapter resolves quoting at runtime. Tests have no `if mysql?`
 * branches; the same assertion runs identically on every adapter.
 *
 * The trails equivalent: `quoteTableName` / `quoteColumnName` here are
 * the active adapter's quoting functions, selected once at module load
 * via {@link adapterType}. `escapeRegExp` is the Ruby `Regexp.escape`
 * equivalent. Together they let assertions read like Rails:
 *
 *     expect(sql).toMatch(
 *       new RegExp(`SELECT \\* FROM ${escapeRegExp(quoteTableName("posts"))}`),
 *     );
 *
 * Rails uses `quote_table_name` (never `quote_column_name`) in these
 * regex assertions — it handles both bare and dotted identifiers, so it's
 * the universal helper. Adding a fourth adapter only requires extending
 * the dispatch.
 */

import * as mysqlQuoting from "../connection-adapters/mysql/quoting.js";
import * as pgQuoting from "../connection-adapters/postgresql/quoting.js";
import * as sqliteQuoting from "../connection-adapters/sqlite3/quoting.js";
import { adapterType } from "../test-adapter.js";

const _impl =
  adapterType === "mysql" ? mysqlQuoting : adapterType === "postgres" ? pgQuoting : sqliteQuoting;

/** Active adapter's `quoteTableName(name)`. Handles dotted identifiers. */
export const quoteTableName: (name: string) => string = _impl.quoteTableName;

/** Active adapter's `quoteColumnName(name)`. Single segment only. */
export const quoteColumnName: (name: string) => string = _impl.quoteColumnName;

/** Ruby `Regexp.escape` equivalent — escapes regex metacharacters in `s`. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
