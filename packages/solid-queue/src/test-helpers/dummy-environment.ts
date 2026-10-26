import { afterAll } from "vitest";
import { getEnv } from "@blazetrails/activesupport";
import { ActiveRecord, Base, DatabaseTasks, HashConfig } from "@blazetrails/activerecord";
import { SolidQueue } from "../solid-queue.js";
import { loadQueueSchema, loadShardSchemas } from "./queue-schema.js";

const configurations = Base.configurations();
const primary = configurations.configsFor({ envName: "arunit", name: "primary" })!;
const envName = String(ActiveRecord.ConnectionHandling.DEFAULT_ENV());

function databaseNameFrom(name: string): string {
  const database = String(primary.database);
  if (database === ":memory:") {
    const worker = getEnv("VITEST_POOL_ID") ?? "1";
    return `${import.meta.dirname}/../../tmp/test_${name}_${worker}.sqlite3`;
  }
  const dot = database.lastIndexOf(".");
  if (primary.adapter !== "sqlite3" || dot < database.lastIndexOf("/")) {
    return `${database}_${name}`;
  }
  return `${database.slice(0, dot)}_${name}${database.slice(dot)}`;
}

const dummyConfigs = ["shard_one", "shard_two", "queue"].map(
  (name) =>
    new HashConfig(envName, name, {
      ...primary.configurationHash,
      pool: primary.adapter === "sqlite3" ? 50 : 20,
      database: databaseNameFrom(name),
    }),
);
Base.configurations([...configurations.configurations, ...dummyConfigs]);
DatabaseTasks.root = import.meta.dirname;
for (const dbConfig of dummyConfigs) await DatabaseTasks.purge(dbConfig);
await loadShardSchemas();
await loadQueueSchema();
await Base.establishConnection(primary);

SolidQueue.connectsTo = { database: { writing: ":queue" } };

afterAll(async () => {
  const { Record } = await import("../record.js");
  const { ShardedRecord } = await import("./sharded-record.js");
  await Record.removeConnection();
  for (const shard of ShardedRecord.shardKeys()) {
    await Base.connectionHandler.removeConnectionPool(ShardedRecord.name, { shard });
  }
});
