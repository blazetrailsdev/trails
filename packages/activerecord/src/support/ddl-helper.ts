/**
 * TS mirror of Rails' test-support `DdlHelper`
 * (activerecord/test/support/ddl_helper.rb).
 */

import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

// The two adapter methods `with_example_table` calls. Narrowed here because
// `execute`/`dropTable` are mixed into AbstractAdapter and not on its own type.
interface DdlConnection {
  execute(sql: string): Promise<unknown>;
  dropTable(name: string): Promise<unknown>;
}

/**
 * Mirrors: DdlHelper#with_example_table
 *
 *   def with_example_table(connection, table_name, definition = nil)
 *     connection.execute("CREATE TABLE #{table_name}(#{definition})")
 *     yield
 *   ensure
 *     connection.drop_table(table_name)
 *   end
 *
 * The drop lives in Ruby's `ensure`, so the table is removed even when the
 * block raises — the `finally` below is that `ensure`.
 */
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
  // Rails' `definition = nil` default, expressed against a trailing block.
  const definition = typeof definitionOrFn === "function" ? null : definitionOrFn;
  const fn = (typeof definitionOrFn === "function" ? definitionOrFn : maybeFn)!;

  await (connection as unknown as DdlConnection).execute(
    `CREATE TABLE ${tableName}(${definition ?? ""})`,
  );
  try {
    return await fn();
  } finally {
    await (connection as unknown as DdlConnection).dropTable(tableName);
  }
}
