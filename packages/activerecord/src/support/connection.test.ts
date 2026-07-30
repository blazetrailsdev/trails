import { describe, it, expect, afterEach, vi } from "vitest";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import { connect, testConfigurationHashes } from "./connection.js";
import { SQLITE_FIXTURE_DATABASE, SQLITE_FIXTURE_DATABASE_2 } from "./config.js";

// Only the cases asserting `connect`'s own side effects call it; everything
// that merely checks which entry `ARCONN` resolves to uses
// `testConfigurationHashes`, which is the resolver alone. `connect` mirrors
// `ARTest.connect` and so establishes the primary pool (`connection.rb:31-33`),
// and a resolver assertion has no business opening one for a backend this
// worker is not running against.
describe("connect", () => {
  const originalConfigurations = Base.configurations();

  afterEach(() => {
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.clearRegisteredTasks();
    Base.configurations(originalConfigurations);
    Base.removeConnection();
    Base._adapter = null;
    vi.unstubAllEnvs();
  });

  it("sets databaseConfiguration and returns the arunit config", async () => {
    const { configs, envConfig } = await connect();
    expect(DatabaseTasks.databaseConfiguration).toBeInstanceOf(DatabaseConfigurations);
    expect(envConfig.envName).toBe("arunit");
    expect(configs.findDbConfig("arunit")).toBeDefined();
  });

  it("publishes the three named entries expand_config builds", async () => {
    const { configurationHashes } = await testConfigurationHashes();
    expect(configurationHashes.map((c) => c.envName)).toEqual([
      "arunit",
      "arunit2",
      "arunit_without_prepared_statements",
    ]);
    expect(configurationHashes.every((c) => c.name === "primary")).toBe(true);
  });

  it("gives arunit2 its own database and disables prepared statements on the third entry", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    const { configurationHashes } = await testConfigurationHashes();
    const [arunit, arunit2, withoutPrepared] = configurationHashes;
    expect(arunit2.database).not.toBe(arunit.database);
    // `expand_config`'s literal name (`support/config.rb:28`), with any worker
    // slot suffix trailing it.
    expect(arunit2.database).toMatch(/^activerecord_unittest2(_\d+)?$/);
    expect(withoutPrepared.database).toBe(arunit.database);
    expect(withoutPrepared.configurationHash.preparedStatements).toBe(false);
  });

  it("keeps per-entry options rather than cloning arunit onto the others", async () => {
    vi.stubEnv("ARCONN", "mysql2");
    const [arunit, arunit2, withoutPrepared] = (await testConfigurationHashes())
      .configurationHashes;
    // config.example.yml:5,25 — the two entries differ in collation, and only
    // arunit carries the time_zone variable.
    expect(arunit.configurationHash.collation).toBe("utf8mb4_unicode_ci");
    expect(arunit2.configurationHash.collation).toBe("utf8mb4_general_ci");
    expect(arunit.configurationHash.variables).toEqual({ time_zone: "+00:00" });
    expect(arunit2.configurationHash.variables).toBeUndefined();
    // mysql2 omits the third entry, so expand_config synthesizes it.
    expect(withoutPrepared.configurationHash.collation).toBeUndefined();
    expect(withoutPrepared.adapter).toBe("mysql2");
  });

  it("turns prepared statements on for mysql2 when MYSQL_PREPARED_STATEMENTS is set", async () => {
    // config.example.yml:7-11,27-31 — the var flips arunit and arunit2 only;
    // the third entry carries no prepared_statements key on mysql2, so it
    // falls back to Mysql2Adapter#default_prepared_statements
    // (mysql2_adapter.rb:186-188), which is false.
    vi.stubEnv("ARCONN", "mysql2");
    vi.stubEnv("MYSQL_PREPARED_STATEMENTS", undefined);
    const off = (await testConfigurationHashes()).configurationHashes;
    expect(off.map((c) => c.configurationHash.preparedStatements)).toEqual([false, false, false]);

    vi.stubEnv("MYSQL_PREPARED_STATEMENTS", "1");
    const on = (await testConfigurationHashes()).configurationHashes;
    expect(on.map((c) => c.configurationHash.preparedStatements)).toEqual([true, true, false]);
  });

  it("carries min_messages on every postgresql entry", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    const { configurationHashes } = await testConfigurationHashes();
    expect(configurationHashes.every((c) => c.configurationHash.minMessages === "warning")).toBe(
      true,
    );
  });

  it("resolves the established pool from the arunit entry by name", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    await connect();
    expect(Base.connectionDbConfig().envName).toBe("arunit");
  });

  it("selects the sqlite3 connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    const { adapter, envConfig } = await connect();
    expect(adapter).toBe("sqlite");
    expect(envConfig.adapter).toMatch(/sqlite/i);
    expect(DatabaseTasks.resolveTask("sqlite3")).toBeDefined();
  });

  it("falls back to the default_connection (sqlite3) when ARCONN is unset", async () => {
    vi.stubEnv("ARCONN", undefined);
    const { adapter } = await connect();
    expect(adapter).toBe("sqlite");
  });

  it("inherits Rails' default pool size (5) on the file-backed lane", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker.sqlite3");
    const { envConfig } = await testConfigurationHashes();
    expect(envConfig.pool).toBe(5);
  });

  it("names an explicit sibling file for the worker clone's arunit2 entry", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker-abc-1.sqlite");
    const { configurationHashes } = await testConfigurationHashes();
    expect(configurationHashes.map((c) => c.database)).toEqual([
      "/tmp/ar-test-worker-abc-1.sqlite",
      "/tmp/ar-test-worker-abc-1_2.sqlite",
      "/tmp/ar-test-worker-abc-1.sqlite",
    ]);
  });

  it("falls back to a file-backed sqlite DB when AR_TEST_WORKER_DB is unset", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { envConfig } = await testConfigurationHashes();
    expect(envConfig.database).toBe(SQLITE_FIXTURE_DATABASE);
    expect(envConfig.pool).toBe(5);
  });

  // `config.example.yml:88-90` spells the second sqlite file out rather than
  // deriving it, and `expand_config` fills a `database` in only when the entry
  // carries none (`support/config.rb:30-36`). The third entry carries none on
  // every lane, and Rails defaults it to `activerecord_unittest` — the same
  // name `arunit` defaults to (`support/config.rb:28-29`), i.e. the same
  // database. `expandConfig` keeps that identity by pointing it at whatever
  // `arunit` resolved to, because trails' `arunit` name is worker-scoped where
  // Rails' is a constant.
  it("names the configured second database on the sqlite3 arunit2 entry", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { configurationHashes } = await testConfigurationHashes();
    expect(configurationHashes.map((c) => c.database)).toEqual([
      SQLITE_FIXTURE_DATABASE,
      SQLITE_FIXTURE_DATABASE_2,
      SQLITE_FIXTURE_DATABASE,
    ]);
  });

  // `config.example.yml:85` names one fixed file, reused across runs; nothing
  // about the running process (a run token, a worker slot, a tmpdir) may enter
  // the name.
  it("names the same configured database on every call", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const first = (await testConfigurationHashes()).envConfig.database;
    vi.stubEnv("AR_TEST_RUN_TOKEN", "some-other-run");
    vi.stubEnv("VITEST_POOL_ID", "7");
    const second = (await testConfigurationHashes()).envConfig.database;
    expect(second).toBe(first);
  });

  it("prefers AR_TEST_WORKER_DB over the configured fixture database", async () => {
    vi.stubEnv("ARCONN", "sqlite3");
    vi.stubEnv("AR_TEST_WORKER_DB", "/tmp/ar-test-worker.sqlite3");
    const { envConfig } = await testConfigurationHashes();
    expect(envConfig.database).toBe("/tmp/ar-test-worker.sqlite3");
  });

  // `config.example.yml:93-99` carries `adapter` and `database` alone, so the
  // built hash must too — no `pool:`, and therefore Rails' default pool size,
  // the same one the file-backed lane above inherits.
  it("builds the sqlite3_mem entries from adapter and database alone", async () => {
    vi.stubEnv("ARCONN", "sqlite3_mem");
    vi.stubEnv("AR_TEST_WORKER_DB", "");
    const { adapter, envConfig, configurationHashes } = await testConfigurationHashes();
    expect(adapter).toBe("sqlite");
    expect(configurationHashes.slice(0, 2).map((c) => c.configurationHash)).toEqual([
      { adapter: "sqlite3", database: ":memory:" },
      { adapter: "sqlite3", database: ":memory:" },
    ]);
    expect(envConfig.pool).toBe(5);
  });

  it("selects the postgresql connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "postgresql");
    const { adapter } = await testConfigurationHashes();
    expect(adapter).toBe("postgres");
  });

  it("selects the mysql2 connection named by ARCONN", async () => {
    vi.stubEnv("ARCONN", "mysql2");
    const { adapter } = await testConfigurationHashes();
    expect(adapter).toBe("mysql");
  });

  it("fails loudly when ARCONN names an unconfigured connection", async () => {
    vi.stubEnv("ARCONN", "oracle");
    await expect(testConfigurationHashes()).rejects.toThrow(/Connection "oracle" not found/);
  });

  // The adapter-name guard (`connection.rb:35-37`) used to be tripped by a
  // missing `*_TEST_URL`. Sub-settings always carry defaults, so there is no
  // absent-details state left to trip it; what it now asserts is the structural
  // invariant over the connections table, exercised here for every entry.
  it.each(["sqlite3", "sqlite3_mem", "postgresql", "mysql2"])(
    "builds an adapter whose name is contained in the connection name (%s)",
    async (name) => {
      vi.stubEnv("ARCONN", name);
      const { envConfig } = await testConfigurationHashes();
      expect(name).toContain(String(envConfig.adapter));
    },
  );
});
