import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ColumnInfo, SqliteConnection } from "../sqlite-adapter.js";
import { getFs } from "@blazetrails/activesupport/fs-adapter";
import { getOs } from "@blazetrails/activesupport/os-adapter";
import { libsqlDriver } from "./libsql.js";
import { LibSQLAdapter } from "../connection-adapters/libsql-adapter.js";

describe("SqliteDriver — libsql round-trip", () => {
  let driver: SqliteConnection;

  beforeAll(async () => {
    driver = await libsqlDriver.open({ database: ":memory:" });
    const create = await driver.prepare(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER)",
    );
    await create.run();
    const insert = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    await insert.run(["sprocket", 42]);
    await insert.run(["gear", 7]);
  });

  afterAll(async () => {
    await driver.close();
  });

  it("retrieves a row by name", async () => {
    const select = await driver.prepare("SELECT id, name, qty FROM widgets WHERE name = ?");
    const row = (await select.get(["sprocket"])) as Record<string, unknown>;
    expect(row["name"]).toBe("sprocket");
    expect(row["qty"]).toBe(42);
  });

  it("run() returns changes and lastInsertRowid", async () => {
    const insert = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    const result = await insert.run(["bolt", 99]);
    expect(result.changes).toBe(1);
    expect(
      typeof result.lastInsertRowid === "number" || typeof result.lastInsertRowid === "bigint",
    ).toBe(true);
  });

  it("returns all rows", async () => {
    const select = await driver.prepare("SELECT id, name, qty FROM widgets ORDER BY id");
    const rows = (await select.all()) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map((r) => r["name"]);
    expect(names).toContain("sprocket");
    expect(names).toContain("gear");
  });

  it("iterate() yields rows incrementally", async () => {
    const select = await driver.prepare("SELECT id, name FROM widgets ORDER BY id");
    const collected: unknown[] = [];
    for (const row of select.iterate() as Iterable<unknown>) collected.push(row);
    expect(collected.length).toBeGreaterThanOrEqual(2);
  });

  it("named binds work as a single object", async () => {
    const select = await driver.prepare("SELECT qty FROM widgets WHERE name = $name");
    const row = (await select.get({ name: "sprocket" })) as Record<string, unknown>;
    expect(row["qty"]).toBe(42);
  });

  it("columns() matches ColumnInfo shape", async () => {
    const stmt = await driver.prepare("SELECT id, name, qty FROM widgets");
    const cols: ColumnInfo[] = stmt.columns();
    expect(cols.length).toBe(3);
    for (const col of cols) {
      expect(typeof col.name).toBe("string");
      expect(col.column === null || typeof col.column === "string").toBe(true);
      expect(col.table === null || typeof col.table === "string").toBe(true);
      expect(col.database === null || typeof col.database === "string").toBe(true);
      expect(col.type === null || typeof col.type === "string").toBe(true);
    }
    expect(cols[0]!.name).toBe("id");
  });

  it("setReadBigInts enables bigint returns", async () => {
    const stmt = await driver.prepare("SELECT qty FROM widgets WHERE name = ?");
    stmt.setReadBigInts(true);
    const row = (await stmt.get(["sprocket"])) as Record<string, unknown>;
    expect(typeof row["qty"]).toBe("bigint");
  });

  it("exec runs SQL", async () => {
    await driver.exec("CREATE TABLE IF NOT EXISTS tmp_exec (x INTEGER)");
    await driver.exec("DROP TABLE tmp_exec");
  });

  it("pragma returns a value", async () => {
    const result = await driver.pragma("journal_mode");
    expect(result).toBeDefined();
  });

  it("isOpen() is true while connected", () => {
    expect(driver.isOpen()).toBe(true);
  });

  it("statement.reader is true for SELECT, false for INSERT", async () => {
    const sel = await driver.prepare("SELECT 1");
    expect(sel.reader).toBe(true);

    const ins = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    expect(ins.reader).toBe(false);
  });

  it("databaseExists() reports memory databases as present", () => {
    expect(libsqlDriver.databaseExists?.({ database: ":memory:" })).toBe(true);
  });

  it("capabilities reflect libsql traits", () => {
    expect(libsqlDriver.capabilities.inProcessSync).toBe(true);
    expect(libsqlDriver.capabilities.streaming).toBe(true);
    expect(libsqlDriver.capabilities.foreignKeysOnByDefault).toBe(false);
    // libsql disables runtime extension loading, unlike better-sqlite3.
    expect(libsqlDriver.capabilities.loadExtension).toBe(false);
  });
});

describe("SqliteDriver — libsql local-file round-trip", () => {
  const dbPath = `${getOs().tmpdir()}/libsql-roundtrip-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
  const sidecars = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const removeFiles = (): void => {
    for (const p of sidecars) {
      try {
        getFs().unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  };

  beforeAll(removeFiles);
  afterAll(removeFiles);

  it("round-trips inserts, selects, and schema ops against a local .db file", async () => {
    const conn = await libsqlDriver.open({ database: dbPath });
    await conn.exec("CREATE TABLE gadgets (id INTEGER PRIMARY KEY, label TEXT)");
    const insert = await conn.prepare("INSERT INTO gadgets (label) VALUES (?)");
    await insert.run(["alpha"]);
    await insert.run(["beta"]);
    await conn.close();

    expect(libsqlDriver.databaseExists?.({ database: dbPath })).toBe(true);

    // A fresh connection sees the persisted rows.
    const probe = await libsqlDriver.open({ database: dbPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM gadgets")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    const row = (await (
      await probe.prepare("SELECT label FROM gadgets WHERE id = ?")
    ).get([1])) as { label: string };
    expect(row.label).toBe("alpha");
    await probe.close();
  });
});

describe("LibSQLAdapter — local-file smoke", () => {
  const dbPath = `${getOs().tmpdir()}/libsql-adapter-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
  const sidecars = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const removeFiles = (): void => {
    for (const p of sidecars) {
      try {
        getFs().unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  };

  let adapter: LibSQLAdapter;

  beforeAll(async () => {
    removeFiles();
    adapter = new LibSQLAdapter(dbPath);
    await adapter.executeMutation(
      "CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
    );
  });

  afterAll(async () => {
    await adapter.close();
    removeFiles();
  });

  it("inserts and selects rows through the adapter", async () => {
    await adapter.executeMutation("INSERT INTO items (name) VALUES ('apple')");
    await adapter.executeMutation("INSERT INTO items (name) VALUES ('banana')");
    const rows = await adapter.execute("SELECT name FROM items ORDER BY id");
    expect(rows.map((r) => (r as { name: string }).name)).toEqual(["apple", "banana"]);
  });

  it("reflects schema ops via the shared AbstractSQLite3Adapter dialect", async () => {
    const tables = await adapter.tables();
    expect(tables).toContain("items");
    const columns = await adapter.columns("items");
    expect(columns.map((c) => c.name)).toContain("name");
  });
});

describe("SqliteDriver — libsql restoreFromPath", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const templatePath = `${getOs().tmpdir()}/libsql-restore-template-${suffix}.sqlite`;
  const destPath = `${getOs().tmpdir()}/libsql-restore-dest-${suffix}.sqlite`;

  const tempFiles = [
    templatePath,
    `${templatePath}-wal`,
    `${templatePath}-shm`,
    destPath,
    `${destPath}-wal`,
    `${destPath}-shm`,
  ];
  const removeTempFiles = (): void => {
    for (const p of tempFiles) {
      try {
        getFs().unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  };

  beforeAll(async () => {
    removeTempFiles();
    const tpl = await libsqlDriver.open({ database: templatePath });
    await tpl.exec(
      "CREATE TABLE gadgets (id INTEGER PRIMARY KEY, label TEXT);" +
        "INSERT INTO gadgets (label) VALUES ('alpha'), ('beta');",
    );
    await tpl.close();
  });

  afterAll(removeTempFiles);

  it("restores a template DB into a fresh destination", async () => {
    await libsqlDriver.restoreFromPath!(templatePath, destPath);

    const probe = await libsqlDriver.open({ database: destPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM gadgets")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    await probe.close();
  });
});
