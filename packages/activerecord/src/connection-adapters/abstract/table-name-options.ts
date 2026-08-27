/** @internal */
export interface TableNameOptionsSource {
  readonly tableNamePrefix: string;
  readonly tableNameSuffix: string;
  readonly pluralizeTableNames: boolean;
  getPrimaryKey(baseName: string): string;
}

let _source: TableNameOptionsSource | null = null;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function registerTableNameOptions(source: TableNameOptionsSource): void {
  _source = source;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function globalTableNamePrefix(): string {
  return _source?.tableNamePrefix ?? "";
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function globalTableNameSuffix(): string {
  return _source?.tableNameSuffix ?? "";
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function globalPluralizeTableNames(): boolean {
  return _source?.pluralizeTableNames ?? true;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function globalGetPrimaryKey(baseName: string): string {
  return _source?.getPrimaryKey(baseName) ?? "id";
}
