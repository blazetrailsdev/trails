import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { newSqlitePool } from "../support/pooled-sqlite-adapter.js";
import type { ConnectionPool } from "./abstract/connection-pool.js";

describe("SQLite3Adapter schema introspection", () => {
  let adapter: SQLite3Adapter;
  let pool: ConnectionPool;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sqlite-introspect-"));
    const file = path.join(tmpDir, "db.sqlite3");
    pool = newSqlitePool(file);
    adapter = (await pool.checkout()) as unknown as SQLite3Adapter;
  });

  afterEach(async () => {
    await adapter
      .exec(
        "DROP TABLE IF EXISTS widgets; DROP TABLE IF EXISTS memberships; DROP TABLE IF EXISTS temp_widgets",
      )
      .catch(() => undefined);
    await pool.disconnect();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("shares one frozen Column instance between structurally identical columns", async () => {
    await adapter.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT)");
    await adapter.executeMutation("CREATE TABLE memberships (id INTEGER PRIMARY KEY, label TEXT)");

    const widgetLabel = (await adapter.columns("widgets")).find((c) => c.name === "label");
    const membershipLabel = (await adapter.columns("memberships")).find((c) => c.name === "label");

    expect(widgetLabel).toBeDefined();
    expect(membershipLabel).toBe(widgetLabel);
    expect(Object.isFrozen(widgetLabel)).toBe(true);
  });

  it("tables returns user-created tables, hiding sqlite_* internals", async () => {
    await adapter.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
    expect(await adapter.tables()).toEqual(["widgets"]);
  });

  it("primaryKey returns the single-column pk name", async () => {
    await adapter.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    expect(await adapter.primaryKey("widgets")).toBe("id");
  });

  it("primaryKey returns null for composite primary keys", async () => {
    await adapter.executeMutation(
      "CREATE TABLE memberships (user_id INTEGER, group_id INTEGER, PRIMARY KEY (user_id, group_id))",
    );
    expect(await adapter.primaryKey("memberships")).toEqual(["user_id", "group_id"]);
  });

  it("columns returns Column metadata keyed by name", async () => {
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, weight REAL)",
    );
    const cols = await adapter.columns("widgets");
    const names = cols.map((c) => c.name);
    expect(names).toEqual(["id", "name", "weight"]);
    const name = cols.find((c) => c.name === "name");
    expect(name?.null).toBe(false);
    expect(name?.sqlType).toBe("TEXT");
  });

  it("columns reflects a STORED generated column's expression as default_function", async () => {
    await adapter.executeMutation(
      `CREATE TABLE "widgets" ("id" INTEGER PRIMARY KEY, "price" INTEGER, "tax" INTEGER, "total" INTEGER GENERATED ALWAYS AS ("price" + "tax") STORED)`,
    );
    const cols = await adapter.columns("widgets");
    const total = cols.find((c) => c.name === "total");
    expect(total?.defaultFunction).toBe(`"price" + "tax"`);
    expect((total as { isVirtual(): boolean }).isVirtual()).toBe(true);
  });

  it("indexes returns user-created indexes and skips auto-indexes", async () => {
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, email TEXT UNIQUE, owner TEXT)",
    );
    await adapter.executeMutation("CREATE INDEX widgets_on_owner ON widgets (owner)");
    const indexes = (await adapter.indexes("widgets")) as Array<{
      table: string;
      name: string;
      columns: string[];
      unique: boolean;
      orders: Record<string, string>;
    }>;
    expect(indexes).toMatchObject([
      {
        table: "widgets",
        name: "widgets_on_owner",
        columns: ["owner"],
        unique: false,
        orders: {},
      },
    ]);
  });

  it("indexes captures DESC column ordering", async () => {
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT, weight REAL)",
    );
    await adapter.executeMutation(
      `CREATE INDEX widgets_on_name_weight ON widgets ("name" ASC, "weight" DESC)`,
    );
    const indexes = (await adapter.indexes("widgets")) as Array<{
      name: string;
      columns: string[];
      orders: Record<string, string>;
    }>;
    expect(indexes).toMatchObject([
      {
        table: "widgets",
        name: "widgets_on_name_weight",
        columns: ["name", "weight"],
        unique: false,
        orders: { weight: "desc" },
      },
    ]);
  });

  it("indexes surfaces expression-index columns from the index SQL", async () => {
    await adapter.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    await adapter.executeMutation("CREATE INDEX widgets_on_lower_name ON widgets (lower(name))");
    const indexes = (await adapter.indexes("widgets")) as Array<{
      name: string;
      columns: string[] | string;
    }>;
    const idx = indexes.find((i) => i.name === "widgets_on_lower_name");
    expect(idx?.columns).toBe("lower(name)");
  });

  it("indexes keeps the WHERE clause of temp-table indexes", async () => {
    await adapter.executeMutation(
      "CREATE TEMP TABLE temp_widgets (id INTEGER PRIMARY KEY, name TEXT)",
    );
    await adapter.executeMutation(
      "CREATE INDEX temp_widgets_on_name ON temp_widgets (name) WHERE name IS NOT NULL",
    );
    const indexes = (await adapter.indexes("temp_widgets")) as Array<{
      name: string;
      where?: string;
    }>;
    const idx = indexes.find((i) => i.name === "temp_widgets_on_name");
    expect(idx?.where).toBe("name IS NOT NULL");
  });

  it("alterTable preserves expression, partial and unique indexes across the rebuild", async () => {
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT, code TEXT, doomed TEXT)",
    );
    await adapter.executeMutation("CREATE INDEX widgets_on_lower_name ON widgets (lower(name))");
    await adapter.executeMutation(
      "CREATE UNIQUE INDEX widgets_on_code ON widgets (code) WHERE code IS NOT NULL",
    );
    await adapter.executeMutation(`CREATE INDEX widgets_on_name_desc ON widgets ("name" DESC)`);

    const byNameSorted = (list: readonly unknown[]): Array<{ name: string }> =>
      [...(list as Array<{ name: string }>)].sort((a, b) => a.name.localeCompare(b.name));
    const before = byNameSorted(await adapter.indexes("widgets"));
    await adapter.removeColumn("widgets", "doomed");

    const indexes = (await adapter.indexes("widgets")) as Array<{
      name: string;
      columns: string[] | string;
      unique: boolean;
      where?: string;
      orders?: Record<string, string>;
    }>;
    expect(byNameSorted(indexes)).toEqual(before);
    const byName = Object.fromEntries(indexes.map((i) => [i.name, i]));
    expect(byName["widgets_on_lower_name"]?.columns).toBe("lower(name)");
    expect(byName["widgets_on_code"]?.unique).toBe(true);
    expect(byName["widgets_on_code"]?.where).toBe("code IS NOT NULL");
    expect(byName["widgets_on_name_desc"]?.orders).toBe("desc");
  });

  it("dataSourceExists matches both tables and views, hides sqlite_* internals", async () => {
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)",
    );
    await adapter.executeMutation("CREATE VIEW widget_names AS SELECT name FROM widgets");
    expect(await adapter.dataSourceExists("widgets")).toBe(true);
    expect(await adapter.dataSourceExists("widget_names")).toBe(true);
    expect(await adapter.dataSourceExists("missing")).toBe(false);
    expect(await adapter.dataSourceExists("sqlite_sequence")).toBe(false);
    expect(await adapter.dataSourceExists("sqlite_schema")).toBe(false);
  });
});
