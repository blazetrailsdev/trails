import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type ColumnInfo, type SqliteConnection, SQLite3Constants } from "../sqlite-adapter.js";
import { File, getOs } from "@blazetrails/ruby-compat";
import { betterSqlite3Driver } from "./better-sqlite3.js";

describe("SqliteDriver — better-sqlite3 round-trip", () => {
  let driver: SqliteConnection;

  beforeAll(async () => {
    driver = await betterSqlite3Driver.open({ database: ":memory:" });
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
    expect(cols[0].name).toBe("id");
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
    expect(betterSqlite3Driver.databaseExists?.({ database: ":memory:" })).toBe(true);
  });

  it("databaseExists() treats a relative file: URI as a literal filename", async () => {
    const relName = `bs3-rel-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
    const literal = `file:${relName}`;
    try {
      const conn = await betterSqlite3Driver.open({ database: literal });
      await conn.exec("CREATE TABLE t (x INTEGER)");
      await conn.exec("DROP TABLE IF EXISTS t");
      await conn.close();
      expect(File.isExist(literal)).toBe(true);
      expect(File.isExist(`/${relName}`)).toBe(false);
      expect(betterSqlite3Driver.databaseExists?.({ database: literal })).toBe(true);
    } finally {
      for (const p of [literal, `${literal}-wal`, `${literal}-shm`]) {
        try {
          File.delete(p);
        } catch {}
      }
    }
  });

  it("capabilities reflect better-sqlite3 traits", () => {
    expect(betterSqlite3Driver.capabilities.inProcessSync).toBe(true);
    expect(betterSqlite3Driver.capabilities.streaming).toBe(true);
    expect(betterSqlite3Driver.capabilities.foreignKeysOnByDefault).toBe(false);
  });
});

describe("SqliteDriver — better-sqlite3 restoreFromPath", () => {
  const templatePath = `${getOs().tmpdir()}/bs3-restore-template-${process.pid}.sqlite`;
  const destPath = `${getOs().tmpdir()}/bs3-restore-dest-${process.pid}.sqlite`;

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
        File.delete(p);
      } catch {}
    }
  };

  beforeAll(async () => {
    removeTempFiles();
    const tpl = await betterSqlite3Driver.open({ database: templatePath });
    await tpl.exec(
      // eslint-disable-next-line blazetrails/require-table-teardown
      "CREATE TABLE gadgets (id INTEGER PRIMARY KEY, label TEXT);" +
        "INSERT INTO gadgets (label) VALUES ('alpha'), ('beta');",
    );
    await tpl.close();
  });

  afterAll(removeTempFiles);

  it("restores a template DB into a fresh destination via the backup primitive", async () => {
    await betterSqlite3Driver.restoreFromPath!(templatePath, destPath);

    const probe = await betterSqlite3Driver.open({ database: destPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM gadgets")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    await probe.close();
  });
});

describe("SqliteDriver — better-sqlite3 binds unsupplied placeholders as NULL", () => {
  let driver: SqliteConnection;

  beforeAll(async () => {
    driver = await betterSqlite3Driver.open({ database: ":memory:" });
    const create = await driver.prepare("CREATE TABLE doodads (id INTEGER PRIMARY KEY, name TEXT)");
    await create.run();
    const insert = await driver.prepare("INSERT INTO doodads (name) VALUES (?)");
    await insert.run(["alpha"]);
  });

  afterAll(async () => {
    await driver.close();
  });

  it("runs a statement with placeholders and no values at all, like the Ruby sqlite3 gem", async () => {
    const stmt = await driver.prepare("SELECT * FROM doodads WHERE id = ?");
    expect(await stmt.all()).toEqual([]);
  });

  it("pads only the trailing placeholders left unsupplied", async () => {
    const stmt = await driver.prepare("SELECT * FROM doodads WHERE name = ? OR id = ?");
    expect(await stmt.all(["alpha"])).toEqual([{ id: 1, name: "alpha" }]);
  });

  it("EXPLAIN QUERY PLAN runs against a statement whose binds were never supplied", async () => {
    const stmt = await driver.prepare("EXPLAIN QUERY PLAN SELECT * FROM doodads WHERE id = ?");
    expect((await stmt.all()).length).toBeGreaterThan(0);
  });

  it("does not raise on an ordinary query given a short bind list", async () => {
    const select = await driver.prepare("SELECT * FROM doodads WHERE name = ? AND id = ?");
    expect(await select.all(["alpha"])).toEqual([]);
    const update = await driver.prepare("UPDATE doodads SET name = ? WHERE id = ?");
    expect((await update.run(["beta"])).changes).toBe(0);
  });

  it("shared-cache open either shares a cache or fails to open", async () => {
    const conns: SqliteConnection[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        conns.push(
          await betterSqlite3Driver.open({
            database: "file::memory:?cache=shared",
            flags: SQLite3Constants.Open.READWRITE | SQLite3Constants.Open.SHAREDCACHE,
          }),
        );
      }
    } catch (e) {
      expect((e as Error).message).toContain("SQLITE_OPEN_SHAREDCACHE");
      return;
    }
    const [a, b] = conns;
    await a.exec("CREATE TABLE shared_cache_probe (x INTEGER)");
    await b.exec("PRAGMA read_uncommitted=ON");
    const probe = await b.prepare("SELECT count(*) AS n FROM shared_cache_probe");
    expect(await probe.all()).toEqual([{ n: 0 }]);
    await a.exec("DROP TABLE IF EXISTS shared_cache_probe");
    for (const c of conns) await c.close();
  });
});
