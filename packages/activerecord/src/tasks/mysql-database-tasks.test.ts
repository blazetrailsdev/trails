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
  it("test_db_retrieves_charset", async () => {
    const tasks = new MySQLDatabaseTasks(config());
    const charsetMock = vi.fn(async () => "utf8mb4");
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({ charset: charsetMock });
    await expect(tasks.charset()).resolves.toBe("utf8mb4");
    expect(charsetMock).toHaveBeenCalledOnce();
  });

  it("test_db_retrieves_collation", async () => {
    const tasks = new MySQLDatabaseTasks(config());
    const collationMock = vi.fn(async () => "utf8mb4_general_ci");
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({ collation: collationMock });
    await expect(tasks.collation()).resolves.toBe("utf8mb4_general_ci");
    expect(collationMock).toHaveBeenCalledOnce();
  });

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
    const closeMock = vi.fn(async () => {});
    let constructorOpts: unknown;

    class FakeMysql2Adapter {
      constructor(opts: unknown) {
        constructorOpts = opts;
      }
      async execute(sql: string, binds?: unknown[]) {
        executeCalls.push({ sql, binds });
        return [{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_bin" }];
      }
      close = closeMock;
    }

    vi.resetModules();
    vi.doMock("../connection-adapters/mysql2-adapter.js", () => ({
      Mysql2Adapter: FakeMysql2Adapter,
    }));

    let dropCallCount = 0;
    let createCallArg: unknown;

    try {
      const mod = await import("./mysql-database-tasks.js");
      const tasks = new mod.MySQLDatabaseTasks(
        new HashConfig("development", "primary", {
          adapter: "mysql2",
          database: "trails_test",
        }),
      );
      vi.spyOn(tasks, "drop").mockImplementation(async () => {
        dropCallCount++;
      });
      vi.spyOn(tasks, "create").mockImplementation(async (override) => {
        createCallArg = override;
      });
      await tasks.purge();
    } finally {
      vi.doUnmock("../connection-adapters/mysql2-adapter.js");
      vi.resetModules();
    }

    // savedCharset must connect without a database (information_schema.SCHEMATA
    // is server-global; connecting to the target DB would fail with error 1049
    // if it doesn't exist yet).
    expect((constructorOpts as Record<string, unknown>).database).toBeUndefined();

    // savedCharset must have queried information_schema.SCHEMATA with the DB name
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0].sql).toMatch(/FROM information_schema\.SCHEMATA/i);
    expect(executeCalls[0].binds).toEqual(["trails_test"]);

    // purge must drop then recreate with the saved charset/collation
    expect(dropCallCount).toBe(1);
    expect(createCallArg).toEqual({ charset: "utf8mb4", collation: "utf8mb4_bin" });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("test_truncate_all_queries_information_schema_and_truncates_each_user_table", async () => {
    const executeCalls: Array<{ sql: string; binds?: unknown[] }> = [];
    const mutationCalls: string[] = [];
    const closeMock = vi.fn(async () => {});

    class FakeMysql2Adapter {
      constructor(_opts: unknown) {
        void _opts;
      }
      async execute(sql: string, binds?: unknown[], _name?: string) {
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
      }
      async executeMutation(sql: string, _binds?: unknown[], _name?: string) {
        mutationCalls.push(sql);
      }
      close = closeMock;
    }

    vi.resetModules();
    vi.doMock("../connection-adapters/mysql2-adapter.js", () => ({
      Mysql2Adapter: FakeMysql2Adapter,
    }));

    try {
      const mod = await import("./mysql-database-tasks.js");
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
    expect(executeCalls[0].binds).toEqual(["trails_test"]);

    // FK checks toggled around per-table truncates.
    expect(mutationCalls[0]).toBe("SET FOREIGN_KEY_CHECKS = 0");
    expect(mutationCalls[mutationCalls.length - 1]).toBe("SET FOREIGN_KEY_CHECKS = 1");
    expect(mutationCalls).toContain("TRUNCATE TABLE `widgets`");
    expect(mutationCalls).toContain("TRUNCATE TABLE `posts`");
    expect(mutationCalls).toContain("TRUNCATE TABLE `comments`");
    // The bookkeeping rows returned by the mock are excluded.
    expect(mutationCalls).not.toContain("TRUNCATE TABLE `schema_migrations`");
    expect(mutationCalls).not.toContain("TRUNCATE TABLE `ar_internal_metadata`");

    // Adapter was closed.
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
