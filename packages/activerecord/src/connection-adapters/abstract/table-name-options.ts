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
  /** `Base.get_primary_key(base_name)` — read by `TableDefinition#set_primary_key`. */
  getPrimaryKey(baseName: string): string;
}

let _source: TableNameOptionsSource | null = null;

/** @internal */
export function registerTableNameOptions(source: TableNameOptionsSource): void {
  _source = source;
}

/** @internal */
export function globalTableNamePrefix(): string {
  return _source?.tableNamePrefix ?? "";
}

/** @internal */
export function globalTableNameSuffix(): string {
  return _source?.tableNameSuffix ?? "";
}

/** @internal */
export function globalPluralizeTableNames(): boolean {
  return _source?.pluralizeTableNames ?? true;
}

/**
 * @internal Rails' `TableDefinition#set_primary_key` names the implicit PK
 * column with `Base.get_primary_key(table_name.to_s.singularize)`, which
 * honours `Base.primary_key_prefix_type`. Before `Base` has loaded (adapter
 * used standalone) there is no prefix type to apply, so "id" is the answer.
 */
export function globalGetPrimaryKey(baseName: string): string {
  return _source?.getPrimaryKey(baseName) ?? "id";
}
