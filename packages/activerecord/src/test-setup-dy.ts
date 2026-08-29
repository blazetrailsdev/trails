import { connect } from "./support/connection.js";
import { getEnv } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { DatabaseTasks } from "./tasks/database-tasks.js";

const { adapter, envConfig } = await connect();

const pgExclusive = adapter === "postgres" && !!getEnv("AR_PG_EXCLUSIVE_DB");
const mysqlExclusive = adapter === "mysql" && !!getEnv("AR_MYSQL_EXCLUSIVE_DB");
const ownsDatabase =
  (adapter === "sqlite" && envConfig.database !== ":memory:") || pgExclusive || mysqlExclusive;

const { recordBootLaidTables, dropAllTables, purgeToCanonicalTables } =
  await import("./support/drop-all-tables.js");
const { loadSchema, loadAdapterSpecificSchema } = await import("./support/load-schema-helper.js");
const { canonicalSchemaUpToDate, stampCanonicalSchema, adapterSpecificTables } =
  await import("./support/canonical-schema-stamp.js");
const { recordBootOutcome } = await import("./support/boot-outcome.js");

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
  if (ownsDatabase) {
    await DatabaseTasks.purge(envConfig);
  } else {
    await dropAllTables(await Base.leaseConnection());
  }
  const canonicalConn = await Base.leaseConnection();
  await loadSchema(canonicalConn);
  await stampCanonicalSchema(canonicalConn);
  await recordBootOutcome("fullLoad", await canonicalSchemaUpToDate(canonicalConn));
}

const _conn = (await Base.leaseConnection()) as unknown as {
  tableExists(n: string): Promise<boolean>;
};
const missingTables: string[] = [];
for (const t of ["accounts", "topics", "posts", "defaults"]) {
  if (!(await _conn.tableExists(t))) missingTables.push(t);
}
if (missingTables.length > 0) {
  throw new Error(
    `[test-setup-dy] schema load incomplete — missing tables: ${missingTables.join(", ")}`,
  );
}

await recordBootLaidTables(await Base.leaseConnection());

const { provisionSecondDatabase } = await import("./support/setup-second-pool.js");
await provisionSecondDatabase();

const { captureWritingPoolBaseline } = await import("./cases/helper.js");
captureWritingPoolBaseline();
