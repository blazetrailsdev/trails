import { describe, it, expect, vi } from "vitest";
import { PostgreSQLDatabaseTasks } from "./postgresql-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

function config(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("development", "primary", {
    adapter: "postgresql",
    database: "trails_test",
    ...overrides,
  });
}

describe("PostgreSQLDatabaseTasks", () => {
  it("test_charset_defaults_to_utf8", () => {
    expect(new PostgreSQLDatabaseTasks(config()).charset()).toBe("utf8");
  });

  it("test_charset_reads_encoding_from_config", () => {
    expect(new PostgreSQLDatabaseTasks(config({ encoding: "UTF8" })).charset()).toBe("UTF8");
  });

  it("test_collation_reads_from_config", () => {
    expect(new PostgreSQLDatabaseTasks(config({ collation: "C" })).collation()).toBe("C");
  });

  it("test_collation_returns_null_when_unset", () => {
    expect(new PostgreSQLDatabaseTasks(config()).collation()).toBeNull();
  });

  it("test_using_database_configurations_is_true", () => {
    expect(PostgreSQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_with_database_tasks", () => {
    DatabaseTasks.clearRegisteredTasks();
    PostgreSQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("postgresql")).toBeDefined();
  });

  it("test_truncate_all_queries_pg_tables_and_issues_cascade_truncate", async () => {
    const executeCalls: Array<{ sql: string; binds?: unknown[] }> = [];
    const mutationCalls: string[] = [];
    const closeMock = vi.fn(async () => {});

    class FakePostgreSQLAdapter {
      constructor(_opts: unknown) {
        void _opts;
      }
      async execute(sql: string, binds?: unknown[]) {
        executeCalls.push({ sql, binds });
        // pg_tables result — three user tables in `public`. truncateAll
        // filters out schema_migrations and ar_internal_metadata at the
        // query level, so the mock doesn't need to return them.
        return [{ tablename: "widgets" }, { tablename: "posts" }, { tablename: "comments" }];
      }
      async executeMutation(sql: string) {
        mutationCalls.push(sql);
      }
      close = closeMock;
    }

    vi.resetModules();
    vi.doMock("../connection-adapters/postgresql-adapter.js", () => ({
      PostgreSQLAdapter: FakePostgreSQLAdapter,
    }));

    try {
      const mod =
        (await import("./postgresql-database-tasks.js")) as typeof import("./postgresql-database-tasks.js");
      await new mod.PostgreSQLDatabaseTasks(
        new HashConfig("development", "primary", {
          adapter: "postgresql",
          database: "trails_test",
        }),
      ).truncateAll();
    } finally {
      vi.doUnmock("../connection-adapters/postgresql-adapter.js");
      vi.resetModules();
    }

    // Queries pg_tables scoped to the public schema, skipping the
    // bookkeeping tables.
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0].sql).toMatch(/FROM pg_tables/i);
    expect(executeCalls[0].sql).toMatch(/schemaname = 'public'/);
    expect(executeCalls[0].sql).toMatch(
      /tablename NOT IN \('schema_migrations', 'ar_internal_metadata'\)/,
    );

    // One TRUNCATE statement with all three tables, RESTART IDENTITY
    // CASCADE, double-quoted.
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0]).toBe(
      `TRUNCATE TABLE "widgets", "posts", "comments" RESTART IDENTITY CASCADE`,
    );

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
