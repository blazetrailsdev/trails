import { describe, it, expect, vi } from "vitest";
import { MySQLDatabaseTasks } from "./mysql-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Result } from "../result.js";

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
    expect(DatabaseTasks["classForAdapter"]("mysql2")).toBeDefined();
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
      async execQuery(sql: string, _name?: string | null, binds?: unknown[]) {
        executeCalls.push({ sql, binds });
        return Result.fromRowHashes([
          { table_name: "widgets" },
          { table_name: "posts" },
          { table_name: "comments" },
          { table_name: "schema_migrations" },
          { table_name: "ar_internal_metadata" },
        ]);
      },
      async execute(sql: string) {
        executeCalls.push({ sql });
        return [];
      },
      async executeMutation(sql: string) {
        mutationCalls.push(sql);
      },
    });

    await tasks.truncateAll();

    expect(establishCalls).toEqual([undefined]);

    expect(executeCalls[0].sql).toMatch(/FROM information_schema\.tables/i);
    expect(executeCalls[0].binds).toEqual(["trails_test"]);
    expect(executeCalls.filter((c) => /FROM information_schema\.tables/i.test(c.sql))).toHaveLength(
      1,
    );
    expect(mutationCalls).toEqual([]);

    const ddl = executeCalls.slice(1).map((c) => c.sql);
    expect(ddl[0]).toBe("SET FOREIGN_KEY_CHECKS = 0");
    expect(ddl[ddl.length - 1]).toBe("SET FOREIGN_KEY_CHECKS = 1");
    expect(ddl).toContain("TRUNCATE TABLE `widgets`");
    expect(ddl).toContain("TRUNCATE TABLE `posts`");
    expect(ddl).toContain("TRUNCATE TABLE `comments`");
    expect(ddl).not.toContain("TRUNCATE TABLE `schema_migrations`");
    expect(ddl).not.toContain("TRUNCATE TABLE `ar_internal_metadata`");
  });
});
