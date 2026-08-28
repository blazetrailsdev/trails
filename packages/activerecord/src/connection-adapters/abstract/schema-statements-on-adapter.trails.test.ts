import { describe, it, expect, afterEach } from "vitest";
import { SQLite3Adapter } from "../sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../better-sqlite3-adapter.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import { Result } from "../../result.js";
import { ForeignKeyDefinition } from "./schema-definitions.js";
import { fixtures } from "../../test-fixtures.js";
import { NotImplementedError } from "../../errors.js";
import { ambientConnection, withRocketTables } from "../../support/rocket-tables.js";
import { adapterType } from "../../test-adapter.js";

const guardsIfNotExists = adapterType !== "sqlite";

let adapter: SQLite3Adapter | undefined;

afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

class StubAdapter extends AbstractAdapter {
  override get typeRegistryKey() {
    return "sqlite" as const;
  }
  execute(_sql: string) {
    return Promise.resolve([] as Record<string, unknown>[]);
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
}

class CapturingAdapter extends AbstractAdapter {
  lastSql = "";
  lastParams: unknown[] = [];
  constructor(private readonly dialect: "sqlite" | "postgres" | "mysql2") {
    super();
  }
  override get typeRegistryKey() {
    return this.dialect as any;
  }
  execute(sql: string, params?: unknown[]) {
    this.lastSql = sql;
    this.lastParams = params ?? [];
    return Promise.resolve([] as Record<string, unknown>[]);
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
  override internalExecQuery(sql: string, _name?: string | null, binds?: unknown[]) {
    this.lastSql = sql;
    this.lastParams = binds ?? [];
    return Promise.resolve(new Result([], []));
  }
}

class SqliteCapturingAdapter extends AbstractAdapter {
  allSql: string[] = [];
  static override quoteColumnName(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }
  constructor(private readonly firstRows: Record<string, unknown>[] = []) {
    super();
  }
  get lastSql() {
    return this.allSql.at(-1) ?? "";
  }
  override get typeRegistryKey() {
    return "sqlite" as any;
  }
  execute(sql: string) {
    this.allSql.push(sql);
    return Promise.resolve(
      this.allSql.length === 1 ? this.firstRows : ([] as Record<string, unknown>[]),
    );
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
  override async internalExecQuery(sql: string) {
    const rows = await this.execute(sql);
    return Result.fromRowHashes(rows);
  }
}

describe("SchemaStatements mixed into AbstractAdapter", () => {
  fixtures([], { useTransactionalTests: false });

  it("tableAliasFor resolves tableAliasLength via the DatabaseLimits mixin", () => {
    const stub = new StubAdapter();
    expect(stub.tableAliasLength()).toBe(64);
    expect(stub.tableAliasFor("a.very.long.schema.qualified.table.name")).toBe(
      "a_very_long_schema_qualified_table_name",
    );
    const long = "x".repeat(80);
    expect(stub.tableAliasFor(long)).toBe("x".repeat(64));
  });

  it("dropTable with no table names is a no-op, with or without options", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.dropTable();
    await sqlite.dropTable({ ifExists: true });
    expect(sqlite.allSql).toEqual([]);
  });

  it("indexes() sqlite arm quotes the table name so an embedded quote does not break the PRAGMA", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.indexes("things");
    expect(sqlite.allSql[0]).toBe('PRAGMA index_list("things")');
    await sqlite.indexes('a"b');
    expect(sqlite.allSql.at(-1)).toBe('PRAGMA index_list("a""b")');
  });

  it("indexes() sqlite arm quotes the index name as a string literal in the index_info PRAGMA", async () => {
    const sqlite = new SqliteCapturingAdapter([{ name: 'idx"x', unique: 1 }]);
    await sqlite.indexes("things");
    expect(sqlite.allSql).toEqual([
      'PRAGMA index_list("things")',
      `SELECT sql FROM sqlite_master WHERE name = 'idx"x' AND type = 'index' ` +
        `UNION ALL ` +
        `SELECT sql FROM sqlite_temp_master WHERE name = 'idx"x' AND type = 'index'`,
      `PRAGMA index_info('idx"x')`,
    ]);
  });

  it("columnExists returns false for a value containing quotes instead of erroring", async () => {
    const conn = await ambientConnection();
    expect(await conn.columnExists("posts", "title")).toBe(true);
    expect(await conn.columnExists("posts", "title = 'active'")).toBe(false);
  });

  it("createTable is callable directly on the adapter", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("things", (t) => {
      t.string("name");
      t.integer("quantity");
    });
    expect(await adapter.tableExists("things")).toBe(true);
    const cols = await adapter.columns("things");
    const names = cols.map((c) => c.name);
    expect(names).toContain("name");
    expect(names).toContain("quantity");
    await adapter.dropTable("things");
  });

  it("dropTable removes the table", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("temp_table", (t) => {
      t.string("value");
    });
    expect(await adapter.tableExists("temp_table")).toBe(true);
    await adapter.dropTable("temp_table");
    expect(await adapter.tableExists("temp_table")).toBe(false);
  });

  it("addColumn and columnExists work on adapter", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("widgets", { id: false }, (t) => {
      t.string("title");
    });
    expect(await adapter.columnExists("widgets", "title")).toBe(true);
    await adapter.addColumn("widgets", "color", "string");
    expect(await adapter.columnExists("widgets", "color")).toBe(true);
    await adapter.dropTable("widgets");
  });

  it("delegating methods (foreignKeys, removeForeignKey) do not infinitely recurse on base adapter", async () => {
    class FkStub extends StubAdapter {
      useForeignKeys() {
        return true;
      }
    }
    const stub = new FkStub();
    await expect(stub.foreignKeys("any_table")).rejects.toThrow(
      new NotImplementedError("foreign_keys is not implemented"),
    );
    await expect(
      stub.removeForeignKey("products", { name: "fk_products_user_id" }),
    ).rejects.toThrow(new NotImplementedError("foreign_keys is not implemented"));
  });

  it("adapter overrides that call super reach the base body without self-dispatching", async () => {
    class SuperCallingAdapter extends SqliteCapturingAdapter {
      changeColumnDefaultCalls = 0;
      addCheckConstraintCalls = 0;
      async supportsCheckConstraints() {
        return true;
      }
      static override quoteColumnName(name: string) {
        return `"${name}"`;
      }
      override async columns(_tableName: string) {
        return [{ name: "title", sqlType: "varchar" }] as any;
      }
      async changeColumnDefault(tableName: string, columnName: string, options: any) {
        this.changeColumnDefaultCalls += 1;
        return super.changeColumnDefault(tableName, columnName, options);
      }
      async addCheckConstraint(tableName: string, expression: string, options: any = {}) {
        this.addCheckConstraintCalls += 1;
        return super.addCheckConstraint(tableName, expression, options);
      }
    }
    const stub = new SuperCallingAdapter();
    await stub.changeColumnDefault("widgets", "title", { from: null, to: "hi" });
    expect(stub.changeColumnDefaultCalls).toBe(1);
    expect(stub.allSql.at(-1)).toMatch(/ALTER TABLE "widgets" ALTER COLUMN "title" SET DEFAULT/);

    await stub.addCheckConstraint("widgets", "price > 0", { name: "price_check" });
    expect(stub.addCheckConstraintCalls).toBe(1);
    expect(stub.allSql.at(-1)).toMatch(/CHECK \(price > 0\)/);
  });

  it("the DDL bodies are the adapter's own, so a subclass override wins", async () => {
    class OverridingAdapter extends SqliteCapturingAdapter {
      renameColumnCalls = 0;
      async renameColumn(tableName: string, oldName: string, newName: string) {
        this.renameColumnCalls += 1;
        return super.renameColumn(tableName, oldName, newName);
      }
    }
    const stub = new OverridingAdapter();
    await stub.renameColumn("widgets", "title", "name");
    expect(stub.renameColumnCalls).toBe(1);
  });

  it("removeForeignKey ifExists probe matches on to_table only, not name (Rails)", async () => {
    class FkStub extends StubAdapter {
      useForeignKeys() {
        return true;
      }
      foreignKeys(_table: string) {
        return Promise.resolve([
          new ForeignKeyDefinition("products", "other", "other_id", "id", "real_fk_name"),
        ]);
      }
    }
    const stub = new FkStub();
    await expect(
      stub.removeForeignKey("products", { name: "wrong_name", toTable: "other", ifExists: true }),
    ).rejects.toThrow(/no foreign key/i);
  });

  it("addForeignKey is a no-op when use_foreign_keys? is false (Rails guard)", async () => {
    let executed = false;
    class NoFkAdapter extends StubAdapter {
      executeMutation(_sql: string) {
        executed = true;
        return Promise.resolve(0);
      }
    }
    const stub = new NoFkAdapter();
    expect((stub as any).useForeignKeys()).toBe(false);
    await stub.addForeignKey("articles", "authors", { column: "author_id" });
    expect(executed).toBe(false);
  });

  it("removeForeignKey is a no-op when use_foreign_keys? is false (Rails guard)", async () => {
    let executed = false;
    class NoFkAdapter extends StubAdapter {
      executeMutation(_sql: string) {
        executed = true;
        return Promise.resolve(0);
      }
    }
    const stub = new NoFkAdapter();
    expect((stub as any).useForeignKeys()).toBe(false);
    await expect(
      stub.removeForeignKey("articles", { name: "fk_whatever" }),
    ).resolves.toBeUndefined();
    expect(executed).toBe(false);
  });

  it("addForeignKey/removeForeignKey no-op when config foreign_keys:false despite supports_foreign_keys?", async () => {
    let executed = false;
    class DisabledFkAdapter extends StubAdapter {
      constructor() {
        super();
        (this as any)._config = { foreignKeys: false };
      }
      supportsForeignKeys() {
        return true;
      }
      executeMutation(_sql: string) {
        executed = true;
        return Promise.resolve(0);
      }
    }
    const stub = new DisabledFkAdapter();
    expect(stub.supportsForeignKeys()).toBe(true);
    expect((stub as any).isForeignKeysEnabled()).toBe(false);
    expect((stub as any).useForeignKeys()).toBe(false);
    await stub.addForeignKey("articles", "authors", { column: "author_id" });
    await expect(
      stub.removeForeignKey("articles", { name: "fk_whatever" }),
    ).resolves.toBeUndefined();
    expect(executed).toBe(false);
  });

  it("isForeignKeysEnabled defaults to true when config omits foreign_keys (Rails fetch default)", () => {
    const stub = new StubAdapter();
    expect((stub as any).isForeignKeysEnabled()).toBe(true);
  });

  it("isForeignKeysEnabled is false when config stores foreign_keys: nil (Rails fetch semantics)", () => {
    class NullFkAdapter extends StubAdapter {
      constructor() {
        super();
        (this as any)._config = { foreignKeys: null };
      }
      supportsForeignKeys() {
        return true;
      }
    }
    const stub = new NullFkAdapter();
    expect((stub as any).isForeignKeysEnabled()).toBe(false);
    expect((stub as any).useForeignKeys()).toBe(false);
  });

  it("validColumnDefinitionOptions includes ifExists (Rails OPTION_NAMES)", () => {
    const stub = new StubAdapter();
    const opts = (stub as any).validColumnDefinitionOptions() as string[];
    expect(opts).toContain("ifExists");
    expect(opts).toContain("ifNotExists");
  });

  it.skipIf(!guardsIfNotExists)(
    "addForeignKey with ifNotExists is a no-op when the FK already exists",
    async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });
        const before = (await conn.foreignKeys("astronauts")).length;
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          ifNotExists: true,
        });
        expect((await conn.foreignKeys("astronauts")).length).toBe(before);
      });
    },
  );

  it.skipIf(guardsIfNotExists)(
    "addForeignKey with ifNotExists re-adds the FK on SQLite (no override guard)",
    async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          ifNotExists: true,
        });
        const fks = await conn.foreignKeys("astronauts");
        expect(fks.length).toBe(2);
        expect(fks.every((fk) => fk.toTable === "rockets" && fk.column === "rocket_id")).toBe(true);
      });
    },
  );

  it("addForeignKey with ifNotExists creates the FK when none exists", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        ifNotExists: true,
      });
      expect((await conn.foreignKeys("astronauts")).length).toBe(1);
    });
  });

  it("addForeignKey with ifNotExists creates a second FK to the same table on a different column", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets");
      await conn.addForeignKey("astronauts", "rockets", {
        column: "favorite_rocket_id",
        ifNotExists: true,
      });
      const fks = await conn.foreignKeys("astronauts");
      expect(fks.length).toBe(2);
      expect(fks.every((fk) => fk.toTable === "rockets")).toBe(true);
      expect(fks.map((fk) => fk.column).sort()).toEqual(["favorite_rocket_id", "rocket_id"]);
    });
  });

  it.skipIf(!guardsIfNotExists)(
    "addForeignKey with ifNotExists is a no-op when a composite FK already exists",
    async () => {
      const conn = await ambientConnection();
      await conn.createTable("rockets", { force: true, primaryKey: ["tenant_id", "id"] }, (t) => {
        t.integer("tenant_id");
        t.integer("id");
      });
      await conn.createTable("astronauts", { force: true }, (t) => {
        t.integer("rocket_id");
        t.integer("rocket_tenant_id");
      });
      try {
        await conn.addForeignKey("astronauts", "rockets", {
          column: ["rocket_tenant_id", "rocket_id"],
          primaryKey: ["tenant_id", "id"],
        });
        expect((await conn.foreignKeys("astronauts"))[0].column).toEqual([
          "rocket_tenant_id",
          "rocket_id",
        ]);
        const before = (await conn.foreignKeys("astronauts")).length;
        await conn.addForeignKey("astronauts", "rockets", {
          column: ["rocket_tenant_id", "rocket_id"],
          primaryKey: ["tenant_id", "id"],
          ifNotExists: true,
        });
        expect((await conn.foreignKeys("astronauts")).length).toBe(before);
      } finally {
        await conn.dropTable("astronauts", "rockets", { ifExists: true });
      }
    },
  );
});
