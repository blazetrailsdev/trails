import { connect } from "./connection.js";
import { getEnv } from "@blazetrails/activesupport";
import { RuntimeError, getOs } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { DatabaseTasks } from "../../lib/tasks/database-tasks.js";
import { SQLiteDatabaseTasks } from "../../lib/tasks/sqlite-database-tasks.js";

const { adapter, envConfig } = await connect();

const pgExclusive = adapter === "postgres" && !!getEnv("AR_PG_EXCLUSIVE_DB");
const mysqlExclusive = adapter === "mysql" && !!getEnv("AR_MYSQL_EXCLUSIVE_DB");
const ownsDatabase =
  (adapter === "sqlite" && envConfig.database !== ":memory:") || pgExclusive || mysqlExclusive;

const { recordBootLaidTables, dropAllTables, purgeToCanonicalTables } =
  await import("./drop-all-tables.js");
const { loadSchema, loadAdapterSpecificSchema } = await import("./load-schema-helper.js");
const { canonicalSchemaUpToDate, stampCanonicalSchema, adapterSpecificTables } =
  await import("./canonical-schema-stamp.js");
const { recordBootOutcome } = await import("./boot-outcome.js");

if (await canonicalSchemaUpToDate(await Base.leaseConnection())) {
  const conn = await Base.leaseConnection();
  const laid = await adapterSpecificTables(conn);
  await purgeToCanonicalTables(conn, laid ?? []);
  const present = new Set(await conn.tables());
  const intact = laid !== null && laid.every((name) => present.has(name));
  if (!intact) await loadAdapterSpecificSchema(conn);
  await stampCanonicalSchema(conn, undefined, intact ? laid : undefined);
  await recordBootOutcome("fastPath", await canonicalSchemaUpToDate(conn));
} else {
  if (adapter === "sqlite" && ownsDatabase) {
    await new SQLiteDatabaseTasks(envConfig, getOs().cwd()).purge();
  } else if (ownsDatabase) {
    await DatabaseTasks.purge(envConfig);
  } else {
    await dropAllTables(await Base.leaseConnection());
  }
  const canonicalConn = await Base.leaseConnection();
  await loadSchema(canonicalConn);
  await stampCanonicalSchema(canonicalConn);
  await recordBootOutcome("fullLoad", await canonicalSchemaUpToDate(canonicalConn));
}

await Base.connectionPool().schemaMigration.createTable();

const _conn = (await Base.leaseConnection()) as unknown as {
  tableExists(n: string): Promise<boolean>;
};
const missingTables: string[] = [];
for (const t of ["accounts", "topics", "posts", "defaults"]) {
  if (!(await _conn.tableExists(t))) missingTables.push(t);
}
if (missingTables.length > 0) {
  throw new RuntimeError(
    `[test-setup-dy] schema load incomplete — missing tables: ${missingTables.join(", ")}`,
  );
}

await recordBootLaidTables(await Base.leaseConnection());

const { provisionSecondDatabase } = await import("./setup-second-pool.js");
await provisionSecondDatabase();

const { captureWritingPoolBaseline } = await import("../cases/helper.js");
captureWritingPoolBaseline();
