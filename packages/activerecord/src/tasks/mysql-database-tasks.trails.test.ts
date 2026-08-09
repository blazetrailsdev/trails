import { describe, it, expect, vi } from "vitest";
import { MySQLDatabaseTasks } from "./mysql-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

function config(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("development", "primary", {
    adapter: "mysql2",
    database: "trails_test",
    ...overrides,
  });
}

describe("MySQLDatabaseTasks", () => {
  it("test_using_database_configurations_is_true", () => {
    expect(MySQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_mysql_and_trilogy_patterns", () => {
    DatabaseTasks.clearRegisteredTasks();
    MySQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("mysql2")).toBeDefined();
  });

  it("test_purge_preserves_existing_database_charset_and_collation", async () => {
    const executeCalls: Array<{ sql: string; binds?: unknown[] }> = [];
    const establishCalls: Array<Record<string, unknown> | undefined> = [];

    const tasks = new MySQLDatabaseTasks(config());
    vi.spyOn(
      tasks as unknown as { establishConnection(hash?: Record<string, unknown>): Promise<void> },
      "establishConnection",
    ).mockImplementation(async (hash?: Record<string, unknown>) => {
      establishCalls.push(hash);
    });
    const createDatabaseCalls: Array<[string, unknown]> = [];
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({
      async execute(sql: string, binds?: unknown[]) {
        executeCalls.push({ sql, binds });
        return [{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_bin" }];
      },
      async createDatabase(name: string, options: unknown) {
        createDatabaseCalls.push([name, options]);
      },
    });

    let dropCallCount = 0;
    vi.spyOn(tasks, "drop").mockImplementation(async () => {
      dropCallCount++;
    });

    await tasks.purge();

    // savedCharset and the recreate must both establish without a database
    // (information_schema.SCHEMATA is server-global; connecting to the target DB
    // would fail with error 1049 if it doesn't exist yet), and the trailing
    // establish returns the pool to the recreated database.
    expect(establishCalls).toHaveLength(3);
    expect(establishCalls[0]).toBeDefined();
    expect(establishCalls[0]!.database).toBeNull();
    expect(establishCalls[1]!.database).toBeNull();
    expect(establishCalls[2]).toBeUndefined();

    // savedCharset must have queried information_schema.SCHEMATA with the DB name
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0].sql).toMatch(/FROM information_schema\.SCHEMATA/i);
    expect(executeCalls[0].binds).toEqual(["trails_test"]);

    // purge must drop then recreate with the saved charset/collation
    expect(dropCallCount).toBe(1);
    expect(createDatabaseCalls).toEqual([
      ["trails_test", { charset: "utf8mb4", collation: "utf8mb4_bin" }],
    ]);
  });

  it("test_truncate_all_queries_information_schema_and_truncates_each_user_table", async () => {
    const executeCalls: Array<{ sql: string; binds?: unknown[] }> = [];
    const mutationCalls: string[] = [];
    const establishCalls: Array<Record<string, unknown> | undefined> = [];

    const tasks = new MySQLDatabaseTasks(config());
    vi.spyOn(
      tasks as unknown as { establishConnection(hash?: Record<string, unknown>): Promise<void> },
      "establishConnection",
    ).mockImplementation(async (hash?: Record<string, unknown>) => {
      establishCalls.push(hash);
    });
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({
      async execute(sql: string, binds?: unknown[]) {
        executeCalls.push({ sql, binds });
        // information_schema.tables result — three user tables plus the two
        // bookkeeping tables that truncateAll must skip (it subtracts the
        // configured names in JS, mirroring Rails truncate_tables).
        return [
          { table_name: "widgets" },
          { table_name: "posts" },
          { table_name: "comments" },
          { table_name: "schema_migrations" },
          { table_name: "ar_internal_metadata" },
        ];
      },
      async executeMutation(sql: string) {
        mutationCalls.push(sql);
      },
    });

    await tasks.truncateAll();

    // truncateAll runs against the target database, so it establishes the full
    // config rather than the no-database admin one.
    expect(establishCalls).toEqual([undefined]);

    // Exactly one information_schema query with the db name bound; the truncate
    // statements that follow run through the same public `execute` Rails'
    // truncate_tables uses (mysql_database_tasks.rb), not executeMutation.
    expect(executeCalls[0].sql).toMatch(/FROM information_schema\.tables/i);
    expect(executeCalls[0].binds).toEqual(["trails_test"]);
    expect(executeCalls.filter((c) => /FROM information_schema\.tables/i.test(c.sql))).toHaveLength(
      1,
    );
    expect(mutationCalls).toEqual([]);

    // FK checks toggled around per-table truncates.
    const ddl = executeCalls.slice(1).map((c) => c.sql);
    expect(ddl[0]).toBe("SET FOREIGN_KEY_CHECKS = 0");
    expect(ddl[ddl.length - 1]).toBe("SET FOREIGN_KEY_CHECKS = 1");
    expect(ddl).toContain("TRUNCATE TABLE `widgets`");
    expect(ddl).toContain("TRUNCATE TABLE `posts`");
    expect(ddl).toContain("TRUNCATE TABLE `comments`");
    // The bookkeeping rows returned by the mock are excluded.
    expect(ddl).not.toContain("TRUNCATE TABLE `schema_migrations`");
    expect(ddl).not.toContain("TRUNCATE TABLE `ar_internal_metadata`");
  });
});
