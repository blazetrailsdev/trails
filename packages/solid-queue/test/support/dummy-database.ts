import { getEnv } from "@blazetrails/activesupport";
import { ActiveRecord, Base, HashConfig } from "@blazetrails/activerecord";

const configurations = Base.configurations();
export const primary = configurations.configsFor({ envName: "arunit", name: "primary" })!;
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

export const dummyConfigs = ["shard_one", "shard_two", "queue"].map(
  (name) =>
    new HashConfig(envName, name, {
      ...primary.configurationHash,
      pool: primary.adapter === "sqlite3" ? 50 : 20,
      ...(primary.adapter === "sqlite3" ? { timeout: 5000 } : {}),
      database: databaseNameFrom(name),
    }),
);
export const primaryConfig =
  primary.database === ":memory:"
    ? new HashConfig(envName, "primary", {
        ...primary.configurationHash,
        timeout: 5000,
        database: databaseNameFrom("primary"),
      })
    : primary;
Base.configurations([...configurations.configurations, ...dummyConfigs]);
