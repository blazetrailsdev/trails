import { ActiveRecord, Base } from "@blazetrails/activerecord";
import { getEnv } from "@blazetrails/activesupport";

const arunit = Base.configurations().configsFor({ envName: "arunit", name: "primary" })!;

function databaseName(): string {
  const database = String(arunit.database);
  if (database === ":memory:") {
    const worker = getEnv("VITEST_POOL_ID") ?? "1";
    return `${import.meta.dirname}/../../../tmp/test_actiontext_${worker}.sqlite3`;
  }
  const dot = database.lastIndexOf(".");
  if (arunit.adapter !== "sqlite3" || dot < database.lastIndexOf("/")) {
    return `${database}_actiontext`;
  }
  return `${database.slice(0, dot)}_actiontext${database.slice(dot)}`;
}

const primary = {
  ...arunit.configurationHash,
  database: databaseName(),
  migrationsPaths: `${import.meta.dirname}/../db/migrate`,
  ...(arunit.adapter === "sqlite3" ? {} : { schemaDump: false }),
};

export default {
  [String(ActiveRecord.ConnectionHandling.DEFAULT_ENV())]: {
    primary,
  },
};
