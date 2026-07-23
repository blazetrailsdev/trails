import { describe, it, expect, vi } from "vitest";
import { PostgreSQLDatabaseTasks, normalizeSchemaSearchPath } from "./postgresql-database-tasks.js";
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
  it("test_db_retrieves_charset", async () => {
    const tasks = new PostgreSQLDatabaseTasks(config());
    const encodingMock = vi.fn(async () => "UTF8");
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({ encoding: encodingMock });
    await expect(tasks.charset()).resolves.toBe("UTF8");
    expect(encodingMock).toHaveBeenCalledOnce();
  });

  it("test_db_retrieves_collation", async () => {
    const tasks = new PostgreSQLDatabaseTasks(config());
    const collationMock = vi.fn(async () => "en_US.UTF-8");
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({ collation: collationMock });
    await expect(tasks.collation()).resolves.toBe("en_US.UTF-8");
    expect(collationMock).toHaveBeenCalledOnce();
  });

  it("test_using_database_configurations_is_true", () => {
    expect(PostgreSQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_with_database_tasks", () => {
    DatabaseTasks.clearRegisteredTasks();
    PostgreSQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("postgresql")).toBeDefined();
  });

  it("test_purge_drops_then_recreates_with_already_connected_flag", async () => {
    const calls: Array<string> = [];
    const tasks = new PostgreSQLDatabaseTasks(config());
    vi.spyOn(tasks, "drop").mockImplementation(async () => {
      calls.push("drop");
    });
    vi.spyOn(tasks, "create").mockImplementation(async (alreadyConnected?: boolean) => {
      calls.push(alreadyConnected ? "create(true)" : "create");
    });
    await tasks.purge();
    expect(calls).toEqual(["drop", "create(true)"]);
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
        // pg_tables result — three user tables plus the two bookkeeping
        // tables. truncateAll subtracts the configured schema_migrations /
        // ar_internal_metadata names in JS (mirroring Rails truncate_tables),
        // so they must NOT appear in the TRUNCATE statement.
        return [
          { tablename: "widgets" },
          { tablename: "posts" },
          { tablename: "comments" },
          { tablename: "schema_migrations" },
          { tablename: "ar_internal_metadata" },
        ];
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
      const mod = await import("./postgresql-database-tasks.js");
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

    // Queries pg_tables scoped to the public schema.
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0].sql).toMatch(/FROM pg_tables/i);
    expect(executeCalls[0].sql).toMatch(/schemaname = 'public'/);

    // One TRUNCATE statement with only the user tables (bookkeeping rows
    // returned by the mock are excluded), RESTART IDENTITY CASCADE,
    // double-quoted.
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0]).toBe(
      `TRUNCATE TABLE "widgets", "posts", "comments" RESTART IDENTITY CASCADE`,
    );
    expect(mutationCalls[0]).not.toContain("schema_migrations");
    expect(mutationCalls[0]).not.toContain("ar_internal_metadata");

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  describe("structureDump schema filtering", () => {
    it("normalizes $user and quoted entries out of --schema= args", () => {
      // Uses the exported normalizeSchemaSearchPath helper — same code
      // path structureDump calls, so the test can't drift.
      expect(normalizeSchemaSearchPath("'$user', public, \"custom\"")).toEqual([
        "public",
        "custom",
      ]);
    });

    it("handles empty and whitespace-only entries", () => {
      expect(normalizeSchemaSearchPath("  , public, ,")).toEqual(["public"]);
    });
  });
});
