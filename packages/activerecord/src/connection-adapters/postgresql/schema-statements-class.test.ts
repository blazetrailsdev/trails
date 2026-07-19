import { describe, expect, it, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { PostgreSQLSchemaStatements } from "./schema-statements-class.js";
import { ForeignKeyDefinition } from "../abstract/schema-definitions.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";

function makeFakeAdapter() {
  const executed: string[] = [];
  const clearedTables: string[] = [];
  const adapter = {
    adapterName: "postgres" as const,
    execute: vi.fn(async (sql: string) => {
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

function makeSchemaAdapter() {
  const execed: string[] = [];
  const adapter = {
    adapterName: "postgres" as const,
    _schemaSearchPathMemo: null as string | null,
    exec: vi.fn(async (sql: string) => {
      execed.push(sql);
    }),
    execute: vi.fn(async (sql: string) => {
      execed.push(sql);
    }),
    schemaQuery: vi.fn(async () => [{ search_path: '"$user", public' }]),
  } as unknown as DatabaseAdapter;
  return { adapter, execed };
}

describe("PostgreSQLSchemaStatements#dropSchema", () => {
  it("always appends CASCADE", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropSchema("things");
    expect(execed).toEqual([`DROP SCHEMA "things" CASCADE`]);
  });

  it("appends IF EXISTS before CASCADE when ifExists: true", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.dropSchema("things", { ifExists: true });
    expect(execed).toEqual([`DROP SCHEMA IF EXISTS "things" CASCADE`]);
  });
});

describe("PostgreSQLSchemaStatements#schemaSearchPath", () => {
  it("memoizes the search path and only queries once", async () => {
    const { adapter } = makeSchemaAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    expect(await ss.schemaSearchPath()).toBe('"$user", public');
    expect(await ss.schemaSearchPath()).toBe('"$user", public');
    expect(
      (adapter as unknown as { schemaQuery: ReturnType<typeof vi.fn> }).schemaQuery,
    ).toHaveBeenCalledTimes(1);
  });

  it("setSchemaSearchPath updates the memo without re-querying", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.setSchemaSearchPath("my_schema, public");
    expect(execed).toEqual([`SET search_path TO my_schema, public`]);
    expect(await ss.schemaSearchPath()).toBe("my_schema, public");
    expect(
      (adapter as unknown as { schemaQuery: ReturnType<typeof vi.fn> }).schemaQuery,
    ).not.toHaveBeenCalled();
  });

  it("setSchemaSearchPath with null is a no-op", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.setSchemaSearchPath(null);
    expect(execed).toEqual([]);
    expect(
      (adapter as unknown as { _schemaSearchPathMemo: string | null })._schemaSearchPathMemo,
    ).toBeNull();
  });

  it("setSchemaSearchPath with empty string is a no-op", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.setSchemaSearchPath("");
    expect(execed).toEqual([]);
    expect(
      (adapter as unknown as { _schemaSearchPathMemo: string | null })._schemaSearchPathMemo,
    ).toBeNull();
  });
});

describe("PostgreSQLSchemaStatements#addForeignKey use_foreign_keys? guard", () => {
  it("is a no-op when the adapter does not support foreign keys (Rails super guard)", async () => {
    // Rails PG add_foreign_key is `assert_valid_deferrable(deferrable); super`,
    // and the abstract super begins with `return unless use_foreign_keys?`.
    // The override replicates the abstract body inline, so it must replicate the
    // guard too — otherwise a real PG migration (which lands in this override,
    // not the base method) emits ADD CONSTRAINT even when FKs are disabled.
    const executed: string[] = [];
    const adapter = {
      adapterName: "postgres" as const,
      supportsForeignKeys: () => false,
      exec: vi.fn(async (sql: string) => {
        executed.push(sql);
      }),
      execute: vi.fn(async (sql: string) => {
        executed.push(sql);
      }),
    } as unknown as DatabaseAdapter;
    const ss = new PostgreSQLSchemaStatements(adapter);
    expect(ss.isUseForeignKeys()).toBe(false);
    await ss.addForeignKey("articles", "authors", { column: "author_id" });
    expect(executed).toEqual([]);
  });

  it("with ifNotExists is a no-op when a composite FK already exists", async () => {
    // A composite `column: [...]` must match the existing FK by value, not by
    // array identity — the guard routes through foreignKeyExists -> isDefinedFor
    // for an element-wise compare, so the duplicate ADD CONSTRAINT is skipped.
    const executed: string[] = [];
    const adapter = {
      adapterName: "postgres" as const,
      supportsForeignKeys: () => true,
      execute: vi.fn(async (sql: string) => {
        executed.push(sql);
      }),
    } as unknown as DatabaseAdapter;
    const ss = new PostgreSQLSchemaStatements(adapter);
    const fk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      ["rocket_tenant_id", "rocket_id"],
      ["tenant_id", "id"],
      "fk_rails_composite",
    );
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([fk]);

    await ss.addForeignKey("astronauts", "rockets", {
      column: ["rocket_tenant_id", "rocket_id"],
      primaryKey: ["tenant_id", "id"],
      ifNotExists: true,
    });
    expect(executed).toEqual([]);
  });
});
