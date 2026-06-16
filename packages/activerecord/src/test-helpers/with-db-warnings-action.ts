import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { SQLWarning } from "../errors.js";

type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((w: SQLWarning) => void);

/**
 * Scope `AbstractAdapter.dbWarningsAction` (+ optional ignore list) to a
 * single block, restoring the prior values afterwards even on throw. Mirrors
 * Rails' `ActiveRecord::TestCase#with_db_warnings_action` (test_case.rb:164),
 * which toggles the global `ActiveRecord.db_warnings_action` /
 * `ActiveRecord.db_warnings_ignore` around the block.
 *
 * Unlike Rails — which disconnects so the connection re-reads the action at
 * `configure_connection` — trails' adapters read `dbWarningsAction` live on
 * each warning-bearing query, so no reconnect is needed.
 *
 * `dbWarningsAction` is declared on the base adapter, so setting it here is a
 * single global toggle observed by every concrete adapter (PostgreSQL/MySQL
 * escalate under `"raise"`; SQLite has no warning channel and so is a no-op,
 * matching Rails).
 */
export async function withDbWarningsAction(
  action: DbWarningsAction,
  warningsToIgnore: (string | RegExp)[] | (() => Promise<void> | void),
  fn?: () => Promise<void> | void,
): Promise<void> {
  const body = (
    typeof warningsToIgnore === "function" ? warningsToIgnore : fn
  ) as () => Promise<void> | void;
  const ignore = Array.isArray(warningsToIgnore) ? warningsToIgnore : [];
  const savedAction = AbstractAdapter.dbWarningsAction;
  const savedIgnore = AbstractAdapter.dbWarningsIgnore;
  AbstractAdapter.dbWarningsAction = action;
  AbstractAdapter.dbWarningsIgnore = ignore;
  try {
    await body();
  } finally {
    AbstractAdapter.dbWarningsAction = savedAction;
    AbstractAdapter.dbWarningsIgnore = savedIgnore;
  }
}
