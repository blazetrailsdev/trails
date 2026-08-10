/**
 * Test-support receiver for the `this`-typed functions in
 * `connection-adapters/abstract/quoting.ts`.
 *
 * Those functions self-send the way Rails' `Quoting` module does — `quote`
 * sends `quote_string` / `quoted_true` / `quoted_date`, `quote_table_name` sends
 * `quote_column_name` (abstract/quoting.rb:73-89, :141-143) — so every unit test
 * that calls one needs a receiver that actually defines them. In Rails that
 * receiver is always a connection adapter; here it is one too, spelled as a bare
 * object on `AbstractAdapter.prototype` so the inherited members are the real
 * ones and a missing override raises from `quote_column_name` rather than
 * silently answering with the ANSI default.
 *
 * `overrides` stands in for a subclass' overrides (Rails' sqlite3/postgresql
 * `quoted_date`), which is what the tests that pass one are pinning.
 */
import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { QuotingDispatchHost } from "../connection-adapters/abstract/quoting.js";

export function quotingHost<T extends object>(overrides?: T): QuotingDispatchHost & T {
  return Object.assign(Object.create(AbstractAdapter.prototype), overrides);
}
