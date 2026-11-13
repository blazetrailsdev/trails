import { Base } from "@blazetrails/activerecord";
import { getEnv } from "@blazetrails/activesupport";

const arunit = Base.configurations().configsFor({ envName: "arunit", name: "primary" })!;

function databaseName(): string {
  const database = String(arunit.database);
  if (database === ":memory:") {
    const worker = getEnv("VITEST_POOL_ID") ?? "1";
    return `${import.meta.dirname}/../storage/test_actionmailbox_${worker}.sqlite3`;
  }
  const dot = database.lastIndexOf(".");
  if (arunit.adapter !== "sqlite3" || dot < database.lastIndexOf("/")) {
    return `${database}_actionmailbox`;
  }
  return `${database.slice(0, dot)}_actionmailbox${database.slice(dot)}`;
}

export default {
  test: { ...arunit.configurationHash, database: databaseName() },
};
