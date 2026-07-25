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
    const { adapter, envConfig } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
    expect(envConfig.adapter).toMatch(/sqlite/i);
    expect(DatabaseTasks.resolveTask("sqlite3")).toBeDefined();
  });

  it("falls back to the default_connection (sqlite3) when ARCONN is unset", async () => {
    vi.stubEnv("ARCONN", "");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
  });

  it("inherits Rails' default pool size (5) on the file-backed lane", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker.sqlite3");
    const { envConfig } = await buildTestDatabaseConfig();
    expect(envConfig.pool).toBe(5);
  });

  it("falls back to a file-backed sqlite DB when AR_TEST_WORKER_DB is unset", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { envConfig } = await buildTestDatabaseConfig();
    expect(envConfig.database).not.toBe(":memory:");
    expect(envConfig.database).toMatch(/\.sqlite$/);
    expect(envConfig.pool).toBe(5);
  });

  it("reuses one fallback database path across calls", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const first = (await buildTestDatabaseConfig()).envConfig.database;
    const second = (await buildTestDatabaseConfig()).envConfig.database;
    expect(second).toBe(first);
  });

  it("prefers AR_TEST_WORKER_DB over the fallback database", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker.sqlite3");
    const { envConfig } = await buildTestDatabaseConfig();
    expect(envConfig.database).toBe("/tmp/ar-test-worker.sqlite3");
  });

  it("pins pool 1 on the sqlite3_mem :memory: connection", async () => {
    vi.stubEnv("ARCONN", "sqlite3_mem");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { adapter, envConfig } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
    expect(envConfig.pool).toBe(1);
  });

  it("selects the postgresql connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("postgres");
  });

  it("selects the mysql2 connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "mysql2");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("mysql");
  });

  it("fails loudly when ARCONN names an unconfigured connection", async () => {
    vi.stubEnv("ARCONN", "oracle");
    await expect(buildTestDatabaseConfig()).rejects.toThrow(/Connection "oracle" not found/);
  });

  // The adapter-name guard (`connection.rb:35-37`) used to be tripped by a
  // missing `*_TEST_URL`. Sub-settings always carry defaults, so there is no
  // absent-details state left to trip it; what it now asserts is the structural
  // invariant over the connections table, exercised here for every entry.
  it.each(["sqlite3", "sqlite3_mem", "postgresql", "mysql2"])(
    "builds an adapter whose name is contained in the connection name (%s)",
    async (name) => {
      vi.stubEnv("ARCONN", name);
      const { envConfig } = await buildTestDatabaseConfig();
      expect(name).toContain(String(envConfig.adapter));
    },
  );
});
