/**
 * Quote a SQL identifier (table name, column name, index name).
 * Uses double quotes for SQLite/PG, backticks for MySQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_column_name
 */
export function quoteIdentifier(name: string, adapter?: "sqlite" | "postgres" | "mysql"): string {
  if (adapter === "mysql") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quote a table name. Handles schema-qualified names (schema.table).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name
 */
export function quoteTableName(name: string, adapter?: "sqlite" | "postgres" | "mysql"): string {
  return name
    .split(".")
    .map((part) => quoteIdentifier(part, adapter))
    .join(".");
}
