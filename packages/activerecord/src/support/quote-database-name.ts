/**
 * Identifier quoting for a database name in harness-built DDL.
 *
 * Rails quotes the name `drop_database` is handed rather than interpolating it
 * (`postgresql/schema_statements.rb:53-54`,
 * `abstract_mysql_adapter.rb:292-293`, both via `quote_table_name`). The escape
 * rule is `quote_column_name`'s — double the quote character
 * (`postgresql/quoting.rb:46-48`, `mysql/quoting.rb:46-48`) — which is the
 * spelling trails' own ported `DatabaseTasks.drop` already uses
 * (`tasks/postgresql-database-tasks.ts:354`, `tasks/mysql-database-tasks.ts:355`).
 * These are the same rule for `globalSetup`, which builds its DDL against the
 * raw `pg` / `mysql2` drivers instead of through an adapter and so cannot reach
 * those methods.
 *
 * Load-bearing on the sweep paths in `template-global-setup.ts`: those build
 * DDL from names read back out of `pg_database` / `information_schema.schemata`,
 * not from names this codebase composed. A leftover carrying a quote character
 * after the run token would otherwise turn every future `globalSetup` into a
 * syntax error instead of being dropped — wedging the server for exactly the
 * sweep that exists to unwedge it.
 *
 * Rails calls `quote_table_name`, whose MySQL spelling adds a
 * `.gsub(".", "`.`")` qualified-name split. That part is deliberately NOT
 * mirrored here: a database name is never schema-qualified, and splitting on a
 * dot would corrupt precisely the dotted leftover this exists to drop.
 *
 * Hard rules (RFC 0023): no `node:*` imports, no `process.*`, async fs only —
 * none needed here.
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
