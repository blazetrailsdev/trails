import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

interface DdlConnection {
  execute(sql: string): Promise<unknown>;
  dropTable(name: string): Promise<unknown>;
}

/** Mirrors: DdlHelper#with_example_table */
export async function withExampleTable<T>(
  connection: AbstractAdapter,
  tableName: string,
  fn: () => Promise<T> | T,
): Promise<T>;
export async function withExampleTable<T>(
  connection: AbstractAdapter,
  tableName: string,
  definition: string | null,
  fn: () => Promise<T> | T,
): Promise<T>;
export async function withExampleTable<T>(
  connection: AbstractAdapter,
  tableName: string,
  definitionOrFn: string | null | (() => Promise<T> | T),
  maybeFn?: () => Promise<T> | T,
): Promise<T> {
  const definition = typeof definitionOrFn === "function" ? null : definitionOrFn;
  const fn = (typeof definitionOrFn === "function" ? definitionOrFn : maybeFn)!;

  const ddl = connection as unknown as DdlConnection;
  await ddl.execute(`CREATE TABLE ${tableName}(${definition ?? ""})`);
  try {
    return await fn();
  } finally {
    await ddl.dropTable(tableName);
  }
}
