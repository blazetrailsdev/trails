import { afterAll } from "vitest";
import { getEnv, seconds } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/activerecord";
import { DatabaseTasks } from "@blazetrails/activerecord/tasks/database-tasks.js";
import { setEnv } from "@blazetrails/ruby-compat";
import { dummyConfigs, primary, primaryConfig } from "./dummy-database.js";
import { Engine } from "../../lib/engine.js";
import { loadQueueSchema, loadShardSchemas } from "./queue-schema.js";
import "./dummy/config/initializers/solid-queue-record.js";

setEnv(
  "NODE_OPTIONS",
  [getEnv("NODE_OPTIONS"), `--import ${import.meta.dirname}/fork-loader.mjs`]
    .filter(Boolean)
    .join(" "),
);
setEnv(
  "SOLID_QUEUE_DUMMY_DATABASES",
  JSON.stringify(
    [primaryConfig, ...dummyConfigs].map((config) => ({
      envName: config.envName,
      name: config.name,
      configuration: config.configurationHash,
    })),
  ),
);
DatabaseTasks.root = import.meta.dirname;
for (const dbConfig of dummyConfigs) await DatabaseTasks.purge(dbConfig);
if (primaryConfig !== primary) await DatabaseTasks.purge(primaryConfig);
await loadShardSchemas();
await loadQueueSchema();
await Base.establishConnection(primaryConfig);

Engine.config.solidQueue.connectsTo = { database: { writing: ":queue" } };
Engine.config.solidQueue.shutdownTimeout = seconds(2);

afterAll(async () => {
  const { Record } = await import("../../lib/record.js");
  const { ShardedRecord } = await import("./sharded-record.js");
  await Record.removeConnection();
  for (const shard of ShardedRecord.shardKeys()) {
    await Base.connectionHandler.removeConnectionPool(ShardedRecord.name, { shard });
  }
  if (primaryConfig !== primary) await Base.establishConnection(primary);
});
