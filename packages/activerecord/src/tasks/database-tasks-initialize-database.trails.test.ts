import { it, expect, afterEach, vi } from "vitest";
import pg from "pg";
import { DatabaseTasks, initializeDatabase } from "./database-tasks.js";
import { UrlConfig } from "../database-configurations/url-config.js";
import { Base } from "../base.js";
import { describeIfPg, PG_TEST_URL } from "../support/describe-if-pg.js";
import { restoreWorkerConnection } from "../support/connection.js";
import { fixtures } from "../test-helpers/use-fixtures.js";

async function adminQuery(sql: string): Promise<pg.QueryResult> {
  const client = new pg.Client({ connectionString: PG_TEST_URL });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

describeIfPg("initializeDatabase against an absent PostgreSQL database", () => {
  fixtures({}, { useTransactionalTests: false });
  const database = `trails_init_db_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  afterEach(async () => {
    vi.restoreAllMocks();
    await Base.removeConnection();
    await restoreWorkerConnection();
    await adminQuery(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  });

  it("creates the database and retries on a live pool", async () => {
    const url = new URL(PG_TEST_URL);
    url.pathname = `/${database}`;
    vi.spyOn(DatabaseTasks, "dbDir", "get").mockReturnValue("db/absent-for-initialize-database");
    const dbConfig = new UrlConfig("test", "primary", url.toString());

    expect(await initializeDatabase(dbConfig)).toBe(true);

    const res = await adminQuery(`SELECT 1 FROM pg_database WHERE datname = '${database}'`);
    expect(res.rowCount).toBe(1);
  });
});
