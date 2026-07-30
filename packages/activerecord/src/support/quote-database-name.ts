/**
 * Identifier quoting for a database name in harness-built DDL.
 *
 * Rails quotes the name `drop_database` is handed rather than interpolating it
 * (`postgresql/schema_statements.rb:53-54`, `abstract_mysql_adapter.rb:292-293`,
 * both via `quote_table_name`); the escape rule is `quote_column_name`'s —
 * double the quote character. `globalSetup` builds its DDL against the raw
 * `pg` / `mysql2` drivers rather than through an adapter, so it cannot reach
 * those methods and repeats the rule here, as trails' ported
 * `DatabaseTasks.drop` already does.
 *
 * Load-bearing on the sweeps in `template-global-setup.ts`, which build DDL
 * from names read out of `pg_database` / `information_schema.schemata` rather
 * than names this codebase composed. A leftover carrying a quote character
 * after the run token would otherwise make `DROP DATABASE` a syntax error,
 * wedging every future run on the sweep meant to unwedge it.
 *
 * Rails' MySQL `quote_table_name` also splits on dots into a qualified name.
 * That is deliberately not mirrored: a database name is never
 * schema-qualified, and the split would corrupt the dotted leftover being
 * dropped.
 *
 * @internal
 */

/** `quote_column_name`'s rule for PostgreSQL (`postgresql/quoting.rb:46-48`). */
export function quotePgDatabaseName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** `quote_column_name`'s rule for MySQL/MariaDB (`mysql/quoting.rb:46-48`). */
export function quoteMysqlDatabaseName(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}
