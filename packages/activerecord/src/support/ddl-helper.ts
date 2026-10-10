import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

export async function withExampleTable<T>(
  connection: AbstractAdapter,
  tableName: string,
  definition: string | null = null,
  block: () => Promise<T> | T,
): Promise<T> {
  try {
    await connection.execute(`CREATE TABLE ${tableName}(${definition ?? ""})`);
    return await block();
  } finally {
    await connection.dropTable(tableName);
  }
}
