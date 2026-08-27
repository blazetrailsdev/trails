export interface DatabaseLimitsHost {
  maxIdentifierLength(): number;
}

export function maxIdentifierLength(): number {
  return 64;
}

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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function exceedsBindParamsLimit(
  conn: { preparedStatements?: boolean; bindParamsLength?(): number } | null | undefined,
  bindCount: number,
): boolean {
  if (!conn?.preparedStatements || typeof conn.bindParamsLength !== "function") return false;
  return bindCount > conn.bindParamsLength();
}
