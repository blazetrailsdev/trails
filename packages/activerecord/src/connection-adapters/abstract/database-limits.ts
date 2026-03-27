/**
 * Database limits — adapter-specific size constraints.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseLimits
 */

export function tableName_length(): number {
  return maxIdentifier_length();
}

export function tableAlias_length(): number {
  return maxIdentifier_length();
}

export function columnName_length(): number {
  return maxIdentifier_length();
}

export function indexName_length(): number {
  return maxIdentifier_length();
}

export function maxIdentifier_length(): number {
  return 64;
}
