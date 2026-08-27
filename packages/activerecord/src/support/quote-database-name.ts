/** @internal */

export function quotePgDatabaseName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteMysqlDatabaseName(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}
