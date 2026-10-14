import { getEnv } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";
import { schemaFormat } from "./active-record.js";

export class TestDatabases {
  static async createAndLoadSchema(i: number, { envName }: { envName: string }): Promise<void> {
    const old = getEnv("VERBOSE");
    setEnv("VERBOSE", "false");

    try {
      for (const dbConfig of Base.configurations().configsFor({ envName })) {
        dbConfig._database = `${dbConfig.database}-${i}`;

        await DatabaseTasks.reconstructFromSchema(dbConfig, schemaFormat(), undefined);
      }
    } finally {
      await Base.establishConnection();
      setEnv("VERBOSE", old);
    }
  }
}
