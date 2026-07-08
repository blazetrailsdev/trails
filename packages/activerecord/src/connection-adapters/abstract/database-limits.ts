/**
 * Database limits — adapter-specific size constraints.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseLimits
 */

/** Host for the DatabaseLimits mixin — the concrete adapter `this` resolves to. */
export interface DatabaseLimitsHost {
  maxIdentifierLength(): number;
}

export function maxIdentifierLength(): number {
  return 64;
}

// Rails' DatabaseLimits derives these from `max_identifier_length` on the
// receiver (database_limits.rb:11-23), so an adapter overriding
// `max_identifier_length` propagates through. Dispatch via `this` — not the
// module-level `maxIdentifierLength` — to preserve that.
export function tableNameLength(this: DatabaseLimitsHost): number {
  return this.maxIdentifierLength();
}

export function tableAliasLength(this: DatabaseLimitsHost): number {
  return this.maxIdentifierLength();
}

export function indexNameLength(this: DatabaseLimitsHost): number {
  return this.maxIdentifierLength();
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
