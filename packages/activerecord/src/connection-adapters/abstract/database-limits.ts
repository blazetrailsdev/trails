/**
 * Database limits — adapter-specific size constraints.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseLimits
 */

export function maxIdentifierLength(): number {
  return 64;
}

export function tableNameLength(): number {
  return maxIdentifierLength();
}

export function tableAliasLength(): number {
  return maxIdentifierLength();
}

export function indexNameLength(): number {
  return maxIdentifierLength();
}

/** @internal */
export function bindParamsLength(): number {
  return 65535;
}

/**
 * Whether a compiled query's bind count exceeds the connection's parameter cap
 * while prepared statements are on — the condition under which Rails
 * (`database_statements.rb:36-38`) abandons the prepared compile and recompiles
 * unprepared so every value inlines via `SubstituteBinds`. Centralises the
 * decision shared by the select / count / set-operation / `to_sql_and_binds`
 * compile paths (all reachable once a large multi-value `IN`/`NOT IN` builds a
 * real-bind `HomogeneousIn`).
 *
 * @internal
 */
export function exceedsBindParamsLimit(
  conn: { preparedStatements?: boolean; bindParamsLength?(): number } | null | undefined,
  bindCount: number,
): boolean {
  if (!conn?.preparedStatements || typeof conn.bindParamsLength !== "function") return false;
  return bindCount > conn.bindParamsLength();
}
