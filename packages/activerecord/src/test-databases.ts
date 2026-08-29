import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

export async function eachDatabase(
  adapters: DatabaseAdapter[],
  callback: (adapter: DatabaseAdapter, index: number) => void | Promise<void>,
): Promise<void> {
  for (let i = 0; i < adapters.length; i++) {
    await callback(adapters[i], i);
  }
}

function isInMemorySqlite(name: string): boolean {
  return name === ":memory:";
}

export async function createAndLoadSchema(
  i: number,
  { envName }: { envName: string } = { envName: "test" },
): Promise<void> {
  const old = process.env.VERBOSE;
  process.env.VERBOSE = "false";

  try {
    const configs = Base.configurations().configsFor({ envName });
    for (const dbConfig of configs) {
      const baseName = dbConfig.database;
      if (!baseName) {
        throw new Error(
          `Cannot suffix database name for ${envName}/${dbConfig.name ?? "(unnamed)"}: ` +
            `neither database nor a parseable URL is available`,
        );
      }
      if (!isInMemorySqlite(baseName)) {
        dbConfig._database = `${baseName}-${i}`;
      }
      await DatabaseTasks.reconstructFromSchema(dbConfig, DatabaseTasks.schemaFormat, undefined);
    }
  } finally {
    try {
      await Base.establishConnection();
    } finally {
      if (old !== undefined) {
        process.env.VERBOSE = old;
      } else {
        delete process.env.VERBOSE;
      }
    }
  }
}
