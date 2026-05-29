import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ColumnInfo, SqliteConnection } from "../sqlite-adapter.js";
import { getFs } from "../fs-adapter.js";
import { getOs } from "../os-adapter.js";
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
    expect(betterSqlite3Driver.databaseExists?.({ database: ":memory:" })).toBe(true);
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

  // All temp DB files this suite touches (main + WAL sidecars), so setup can
  // pre-clean and teardown can remove every artifact.
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
    // Pre-clean so a prior interrupted run's leftover template (same pid path)
    // can't make CREATE TABLE throw "table gadgets already exists".
    removeTempFiles();
    const tpl = await betterSqlite3Driver.open({ database: templatePath });
    await tpl.exec(
      "CREATE TABLE gadgets (id INTEGER PRIMARY KEY, label TEXT);" +
        "INSERT INTO gadgets (label) VALUES ('alpha'), ('beta');",
    );
    await tpl.close();
  });

  afterAll(removeTempFiles);

  it("restores a template DB into a fresh destination via the backup primitive", async () => {
    await betterSqlite3Driver.restoreFromPath!(templatePath, destPath);

    // A fresh connection to the restored destination sees the template's rows.
    const probe = await betterSqlite3Driver.open({ database: destPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM gadgets")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    await probe.close();
  });
});
