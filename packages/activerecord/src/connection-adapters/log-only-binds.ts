/**
 * Log-only binds — a bind array tagged for instrumentation only.
 *
 * The unprepared StatementCache path (PartialQuery) inlines its bind values
 * into the SQL string via the adapter quoter, so the statement reaches the
 * driver with no placeholders. Rails still hands those bind values to
 * `find_by_sql` so the `sql.active_record` query log shows them
 * (statement_cache.rb#execute passes `bind_values`). We mirror that here: the
 * tagged array flows into the notification payload's `binds` /
 * `type_casted_binds`, but each adapter's execute path sends an empty bind list
 * to the driver (the values are already inlined).
 */

const LOG_ONLY = Symbol.for("blazetrails.logOnlyBinds");

/** Tag `binds` so adapters log them but never forward them to the driver. */
export function markLogOnlyBinds(binds: unknown[]): unknown[] {
  (binds as unknown as Record<symbol, unknown>)[LOG_ONLY] = true;
  return binds;
}

/** True when `binds` was tagged by {@link markLogOnlyBinds}. */
export function isLogOnlyBinds(binds: unknown[] | null | undefined): boolean {
  return !!binds && (binds as unknown as Record<symbol, unknown>)[LOG_ONLY] === true;
}
