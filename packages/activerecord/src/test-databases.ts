import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

export async function createAndLoadSchema(
  i: number,
  { envName }: { envName: string } = { envName: "test" },
): Promise<void> {
  const old = process.env.VERBOSE;
  process.env.VERBOSE = "false";

  try {
    const configs = Base.configurations().configsFor({ envName });
    for (const dbConfig of configs) {
      dbConfig._database = `${dbConfig.database}-${i}`;
      await DatabaseTasks.reconstructFromSchema(dbConfig, Base.schemaFormat, undefined);
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
