import { describe, it, expect, afterEach, vi } from "vitest";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { buildTestDatabaseConfig } from "./test-database-config.js";

describe("buildTestDatabaseConfig", () => {
  afterEach(() => {
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.clearRegisteredTasks();
    vi.unstubAllEnvs();
  });

  it("sets databaseConfiguration and returns a test-env config", async () => {
    const { configs, envConfig } = await buildTestDatabaseConfig();
    expect(DatabaseTasks.databaseConfiguration).toBeInstanceOf(DatabaseConfigurations);
    expect(envConfig.envName).toBe("test");
    expect(configs.findDbConfig("test")).toBeDefined();
  });

  it("selects the sqlite3 connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    const { adapter, envConfig } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
    expect(envConfig.adapter).toMatch(/sqlite/i);
    expect(DatabaseTasks.resolveTask("sqlite3")).toBeDefined();
  });

  it("falls back to the default_connection (sqlite3) when ARCONN is unset", async () => {
    vi.stubEnv("ARCONN", "");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
  });

  it("inherits Rails' default pool size (5) on the file-backed lane", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker.sqlite3");
    const { envConfig } = await buildTestDatabaseConfig();
    expect(envConfig.pool).toBe(5);
  });

  it("pins pool 1 on the sqlite3_mem :memory: connection", async () => {
    vi.stubEnv("ARCONN", "sqlite3_mem");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { adapter, envConfig } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
    expect(envConfig.pool).toBe(1);
  });

  it("selects the postgresql connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    vi.stubEnv("PG_TEST_URL", "postgresql://localhost/trails_test");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("postgres");
  });

  it("selects the mysql2 connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "mysql2");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "mysql2://localhost/trails_test");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("mysql");
  });

  it("fails loudly when ARCONN names an unconfigured connection", async () => {
    vi.stubEnv("ARCONN", "oracle");
    await expect(buildTestDatabaseConfig()).rejects.toThrow(/Connection "oracle" not found/);
  });

  it("raises on an ARCONN / resolved-adapter mismatch (postgresql without PG_TEST_URL)", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    await expect(buildTestDatabaseConfig()).rejects.toThrow(
      /connection name did not match the adapter name/,
    );
  });

  it("raises on an ARCONN / resolved-adapter mismatch (mysql2 without MYSQL_TEST_URL)", async () => {
    vi.stubEnv("ARCONN", "mysql2");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    await expect(buildTestDatabaseConfig()).rejects.toThrow(
      /connection name did not match the adapter name/,
    );
  });
});
