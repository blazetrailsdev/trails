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

export function bindParamsLength(): number {
  return 65535;
}
