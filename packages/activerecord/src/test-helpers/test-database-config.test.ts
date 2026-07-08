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

  it("defaults to sqlite when no URL env vars are set", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    const { adapter, envConfig } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
    expect(envConfig.adapter).toMatch(/sqlite/i);
    expect(DatabaseTasks.resolveTask("sqlite3")).toBeDefined();
  });

  it("inherits Rails' default pool size (5) on the file-backed lane", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker.sqlite3");
    const { envConfig } = await buildTestDatabaseConfig();
    expect(envConfig.pool).toBe(5);
  });

  it("pins pool 1 on a bare :memory: primary", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { envConfig } = await buildTestDatabaseConfig();
    expect(envConfig.pool).toBe(1);
  });

  it("picks postgres when PG_TEST_URL is set", async () => {
    vi.stubEnv("PG_TEST_URL", "postgresql://localhost/trails_test");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("postgres");
  });

  it("picks mysql when MYSQL_TEST_URL is set and PG_TEST_URL is absent", async () => {
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "mysql2://localhost/trails_test");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("mysql");
  });

  it("throws when ARCONN=postgresql but PG_TEST_URL is absent", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    await expect(buildTestDatabaseConfig()).rejects.toThrow(/ARCONN=postgresql but PG_TEST_URL/);
  });

  it("throws when ARCONN=mysql2 but MYSQL_TEST_URL is absent", async () => {
    vi.stubEnv("ARCONN", "mysql2");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    await expect(buildTestDatabaseConfig()).rejects.toThrow(/ARCONN=mysql2 but MYSQL_TEST_URL/);
  });

  it("does not throw when ARCONN=postgresql and PG_TEST_URL is set", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    vi.stubEnv("PG_TEST_URL", "postgresql://localhost/trails_test");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("postgres");
  });

  it("does not throw when ARCONN=sqlite3 and no URL env vars are set", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("PG_TEST_URL", "");
    vi.stubEnv("MYSQL_TEST_URL", "");
    const { adapter } = await buildTestDatabaseConfig();
    expect(adapter).toBe("sqlite");
  });
});
