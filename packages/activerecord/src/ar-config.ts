/**
 * Module-level configuration flags for ActiveRecord.
 *
 * Rails stores these as singleton_class.attr_accessor on the ActiveRecord
 * module itself (active_record.rb:321-322).
 */

/** @internal */
export let indexNestedAttributeErrors = false;

/** @internal */
export function setIndexNestedAttributeErrors(value: boolean): void {
  indexNestedAttributeErrors = value;
}

/**
 * A list of table names or regular expressions to match tables to ignore
 * when dumping the schema cache. Mirrors
 * `ActiveRecord.schema_cache_ignored_tables` (active_record.rb:197).
 *
 * @internal
 */
export let schemaCacheIgnoredTables: ReadonlyArray<string | RegExp> = [];

/** @internal */
export function setSchemaCacheIgnoredTables(value: ReadonlyArray<string | RegExp>): void {
  schemaCacheIgnoredTables = value;
}

/**
 * Returns true when `tableName` matches an entry in
 * `schemaCacheIgnoredTables`. Mirrors
 * `ActiveRecord.schema_cache_ignored_table?` (active_record.rb:205).
 *
 * @internal
 */
export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  for (const entry of schemaCacheIgnoredTables) {
    if (entry instanceof RegExp) {
      // Reset lastIndex so /g and /y patterns don't alternate between
      // matches across calls (same precaution SchemaDumper#isIgnored takes).
      entry.lastIndex = 0;
      if (entry.test(tableName)) return true;
    } else if (entry === tableName) {
      return true;
    }
  }
  return false;
}
