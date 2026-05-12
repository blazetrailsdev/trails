import { describe, expect, it, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { PostgreSQLSchemaStatements } from "./schema-statements-class.js";
import type { DatabaseAdapter } from "../../adapter.js";

function makeFakeAdapter() {
  const executed: string[] = [];
  const clearedTables: string[] = [];
  const adapter = {
    adapterName: "postgres" as const,
    executeMutation: vi.fn(async (sql: string) => {
      executed.push(sql);
    }),
    schemaCache: {
      clearDataSourceCacheBang: vi.fn((_pool: unknown, name: string) => {
        clearedTables.push(name);
      }),
    },
    pool: null,
    quoteTableName: (name: string) => `"${name}"`,
  } as unknown as DatabaseAdapter;
  return { adapter, executed, clearedTables };
}

describe("PostgreSQLSchemaStatements#dropTable", () => {
  it("emits a single DROP TABLE statement with all table names joined", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropTable("posts", "comments");
    expect(executed).toEqual([`DROP TABLE "posts", "comments"`]);
  });

  it("appends CASCADE when force: 'cascade'", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropTable("posts", { force: "cascade" });
    expect(executed).toEqual([`DROP TABLE "posts" CASCADE`]);
  });

  it("appends IF EXISTS when ifExists: true", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropTable("posts", { ifExists: true });
    expect(executed).toEqual([`DROP TABLE IF EXISTS "posts"`]);
  });

  it("combines IF EXISTS, multiple tables, and CASCADE", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropTable("posts", "comments", { ifExists: true, force: "cascade" });
    expect(executed).toEqual([`DROP TABLE IF EXISTS "posts", "comments" CASCADE`]);
  });

  it("clears the schema cache for each table", async () => {
    const { adapter, clearedTables } = makeFakeAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropTable("posts", "comments");
    expect(clearedTables).toEqual(["posts", "comments"]);
  });

  it("throws ArgumentError when called with no table names", async () => {
    const { adapter } = makeFakeAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await expect(
      (ss as unknown as { dropTable: () => Promise<void> }).dropTable(),
    ).rejects.toBeInstanceOf(ArgumentError);
  });
});
