/**
 * No Rails counterpart file. Rails' schema-definition code reads
 * `ActiveRecord::Base.table_name_prefix` / `.table_name_suffix` directly
 * (e.g. `TableDefinition#new_foreign_key_definition`,
 * schema_definitions.rb:575-581). Importing `Base` from the connection-adapter
 * layer is a cycle (base.ts → connection-handler.ts → adapters), so `Base`
 * registers itself here at load and the adapter layer reads the globals through
 * this indirection.
 */

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
 * @noRailsEquivalent PERMANENT Ruby reads ActiveRecord::Base.table_name_prefix at call time (model_schema.rb:37); a TS import from here would close a module cycle.
 */
export function registerTableNameOptions(source: TableNameOptionsSource): void {
  _source = source;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT lazily-wired read of ActiveRecord::Base.table_name_prefix, which Ruby names directly (model_schema.rb:37).
 */
export function globalTableNamePrefix(): string {
  return _source?.tableNamePrefix ?? "";
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT lazily-wired read of ActiveRecord::Base.table_name_suffix, which Ruby names directly (model_schema.rb:56).
 */
export function globalTableNameSuffix(): string {
  return _source?.tableNameSuffix ?? "";
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT lazily-wired read of ActiveRecord::Base.pluralize_table_names, which Ruby names directly (model_schema.rb:97).
 */
export function globalPluralizeTableNames(): boolean {
  return _source?.pluralizeTableNames ?? true;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT lazily-wired call of ActiveRecord::Base.get_primary_key, which Ruby names directly (attribute_methods/primary_key.rb:103).
 */
export function globalGetPrimaryKey(baseName: string): string {
  return _source?.getPrimaryKey(baseName) ?? "id";
}
