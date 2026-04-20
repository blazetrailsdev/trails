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
  it("test_charset_defaults_to_utf8mb4", () => {
    expect(new MySQLDatabaseTasks(config()).charset()).toBe("utf8mb4");
  });

  it("test_charset_reads_encoding_from_config", () => {
    expect(new MySQLDatabaseTasks(config({ encoding: "latin1" })).charset()).toBe("latin1");
  });

  it("test_collation_reads_from_config", () => {
    expect(new MySQLDatabaseTasks(config({ collation: "utf8mb4_general_ci" })).collation()).toBe(
      "utf8mb4_general_ci",
    );
  });

  it("test_collation_returns_null_when_unset", () => {
    expect(new MySQLDatabaseTasks(config()).collation()).toBeNull();
  });

  it("test_using_database_configurations_is_true", () => {
    expect(MySQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_mysql_and_trilogy_patterns", () => {
    DatabaseTasks.clearRegisteredTasks();
    MySQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("mysql2")).toBeDefined();
    expect(DatabaseTasks.resolveTask("trilogy")).toBeDefined();
  });

  it("test_truncate_all_queries_information_schema_and_truncates_each_user_table", async () => {
    const executeCalls: Array<{ sql: string; binds?: unknown[] }> = [];
    const mutationCalls: string[] = [];
    const closeMock = vi.fn(async () => {});

    class FakeMysql2Adapter {
      constructor(_opts: unknown) {
        void _opts;
      }
      async execute(sql: string, binds?: unknown[]) {
        executeCalls.push({ sql, binds });
        // information_schema.tables result — returns three user tables
        // plus the two bookkeeping tables that truncateAll must skip.
        return [{ table_name: "widgets" }, { table_name: "posts" }, { table_name: "comments" }];
      }
      async executeMutation(sql: string) {
        mutationCalls.push(sql);
      }
      close = closeMock;
    }

    vi.resetModules();
    vi.doMock("../connection-adapters/mysql2-adapter.js", () => ({
      Mysql2Adapter: FakeMysql2Adapter,
    }));

    try {
      const mod =
        (await import("./mysql-database-tasks.js")) as typeof import("./mysql-database-tasks.js");
      await new mod.MySQLDatabaseTasks(
        new HashConfig("development", "primary", {
          adapter: "mysql2",
          database: "trails_test",
        }),
      ).truncateAll();
    } finally {
      vi.doUnmock("../connection-adapters/mysql2-adapter.js");
      vi.resetModules();
    }

    // Exactly one information_schema query with the db name bound.
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0].sql).toMatch(/FROM information_schema\.tables/i);
    expect(executeCalls[0].sql).toMatch(
      /table_name NOT IN \('schema_migrations', 'ar_internal_metadata'\)/,
    );
    expect(executeCalls[0].binds).toEqual(["trails_test"]);

    // FK checks toggled around per-table truncates.
    expect(mutationCalls[0]).toBe("SET FOREIGN_KEY_CHECKS = 0");
    expect(mutationCalls[mutationCalls.length - 1]).toBe("SET FOREIGN_KEY_CHECKS = 1");
    expect(mutationCalls).toContain("TRUNCATE TABLE `widgets`");
    expect(mutationCalls).toContain("TRUNCATE TABLE `posts`");
    expect(mutationCalls).toContain("TRUNCATE TABLE `comments`");

    // Adapter was closed.
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
