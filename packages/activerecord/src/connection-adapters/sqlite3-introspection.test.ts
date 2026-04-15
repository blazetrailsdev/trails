import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

describe("SQLite3Adapter schema introspection", () => {
  let adapter: SQLite3Adapter;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sqlite-introspect-"));
    adapter = new SQLite3Adapter(path.join(tmpDir, "db.sqlite3"));
  });

  afterEach(async () => {
    await adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
    expect(await adapter.primaryKey("memberships")).toBeNull();
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
    const id = cols.find((c) => c.name === "id");
    expect(id?.primaryKey).toBe(true);
  });

  it("indexes returns user-created indexes and skips auto-indexes", async () => {
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, email TEXT UNIQUE, owner TEXT)",
    );
    await adapter.executeMutation("CREATE INDEX widgets_on_owner ON widgets (owner)");
    const indexes = (await adapter.indexes("widgets")) as Array<{
      name: string;
      columns: string[];
      unique: boolean;
    }>;
    // Only the explicitly-created index should surface; the auto-index for
    // UNIQUE(email) and the primary-key rowid mapping are filtered out.
    expect(indexes).toEqual([{ name: "widgets_on_owner", columns: ["owner"], unique: false }]);
  });

  it("introspection PRAGMAs work against schema-qualified names", async () => {
    // Attach a separate sqlite file under the `aux` alias. PRAGMAs that
    // accept a schema prefix must use the `PRAGMA aux.table_info(widgets)`
    // form; `PRAGMA table_info("aux"."widgets")` returns zero rows
    // because SQLite treats the whole quoted argument as a bare table
    // name. This test guards against that regression — which is what
    // Copilot flagged on #527.
    const auxPath = path.join(tmpDir, "aux.sqlite3");
    await adapter.executeMutation(`ATTACH DATABASE '${auxPath}' AS aux`);
    await adapter.executeMutation(
      "CREATE TABLE aux.widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    );
    await adapter.executeMutation("CREATE INDEX aux.widgets_on_name ON widgets (name)");

    expect(await adapter.primaryKey("aux.widgets")).toBe("id");
    const cols = await adapter.columns("aux.widgets");
    expect(cols.map((c) => c.name)).toEqual(["id", "name"]);
    const indexes = (await adapter.indexes("aux.widgets")) as Array<{
      name: string;
      columns: string[];
    }>;
    expect(indexes).toEqual([{ name: "widgets_on_name", columns: ["name"], unique: false }]);
  });

  it("tableExists/dataSourceExists resolve schema-qualified names correctly", async () => {
    // Companion to the PRAGMA test: sqlite_master lookups must route to
    // `<schema>.sqlite_master` for ATTACHed DBs. Matching on
    // `name='aux.widgets'` in the main catalog would return false even
    // though the table does exist in aux.
    const auxPath = path.join(tmpDir, "aux2.sqlite3");
    await adapter.executeMutation(`ATTACH DATABASE '${auxPath}' AS aux`);
    await adapter.executeMutation("CREATE TABLE aux.widgets (id INTEGER PRIMARY KEY)");
    await adapter.executeMutation("CREATE VIEW aux.widget_view AS SELECT id FROM aux.widgets");

    expect(await adapter.tableExists("aux.widgets")).toBe(true);
    expect(await adapter.dataSourceExists("aux.widgets")).toBe(true);
    expect(await adapter.dataSourceExists("aux.widget_view")).toBe(true);
    expect(await adapter.tableExists("aux.missing")).toBe(false);
  });
});
