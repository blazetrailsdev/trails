/**
 * Database statements — query execution interface.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements
 */

export function toSql(arel: unknown, binds: unknown[] = []): string {
  if (typeof arel === "string") return arel;
  if (arel && typeof (arel as any).toSql === "function") {
    return (arel as any).toSql();
  }
  throw new TypeError("Cannot convert to SQL");
}

export function selectAll(
  sql: string,
  _name?: string | null,
  _binds?: unknown[],
): Promise<Record<string, unknown>[]> {
  throw new Error("selectAll must be implemented by adapter subclass");
}

export function selectOne(
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Record<string, unknown> | undefined> {
  return selectAll(sql, name, binds).then((rows) => rows[0]);
}

export function selectValue(
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown> {
  return selectOne(sql, name, binds).then((row) => {
    if (!row) return undefined;
    const keys = Object.keys(row);
    return keys.length > 0 ? row[keys[0]] : undefined;
  });
}

export function selectValues(
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[]> {
  return selectAll(sql, name, binds).then((rows) =>
    rows.map((row) => {
      const keys = Object.keys(row);
      return keys.length > 0 ? row[keys[0]] : undefined;
    }),
  );
}

export function selectRows(
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<unknown[][]> {
  return selectAll(sql, name, binds).then((rows) => rows.map((row) => Object.values(row)));
}

export function execute(_sql: string, _name?: string | null): Promise<unknown> {
  throw new Error("execute must be implemented by adapter subclass");
}

export function insert(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown> {
  return execute(sql, name);
}

export function update(sql: string, name?: string | null, binds?: unknown[]): Promise<number> {
  return execute(sql, name) as Promise<number>;
}

export function remove(sql: string, name?: string | null, binds?: unknown[]): Promise<number> {
  return execute(sql, name) as Promise<number>;
}
