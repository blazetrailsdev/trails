import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type SqliteConnection, SQLite3Constants } from "../sqlite-adapter.js";
import { File, getOs } from "@blazetrails/ruby-compat";
import { isNodeSqliteAvailable, nodeSqliteDriver } from "./node-sqlite.js";

describe.skipIf(!isNodeSqliteAvailable)("SqliteDriver — node-sqlite round-trip", () => {
  let conn: SqliteConnection;

  beforeAll(async () => {
    conn = await nodeSqliteDriver.open({ database: ":memory:" });
    const create = await conn.prepare(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER)",
    );
    await create.run();
    const insert = await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    await insert.run(["sprocket", 42]);
    await insert.run(["gear", 7]);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("retrieves a row by name", async () => {
    const select = await conn.prepare("SELECT id, name, qty FROM widgets WHERE name = ?");
    const row = (await select.get(["sprocket"])) as Record<string, unknown>;
    expect(row["name"]).toBe("sprocket");
    expect(row["qty"]).toBe(42);
  });

  it("run() returns changes and lastInsertRowid", async () => {
    const insert = await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    const result = await insert.run(["bolt", 99]);
    expect(result.changes).toBe(1);
    expect(
      typeof result.lastInsertRowid === "number" || typeof result.lastInsertRowid === "bigint",
    ).toBe(true);
  });

  it("returns all rows", async () => {
    const select = await conn.prepare("SELECT id, name, qty FROM widgets ORDER BY id");
    const rows = (await select.all()) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map((r) => r["name"]);
    expect(names).toContain("sprocket");
    expect(names).toContain("gear");
  });

  it("iterate() yields rows incrementally", async () => {
    const select = await conn.prepare("SELECT id, name FROM widgets ORDER BY id");
    const collected: unknown[] = [];
    for (const row of select.iterate() as Iterable<unknown>) collected.push(row);
    expect(collected.length).toBeGreaterThanOrEqual(2);
  });

  it("named binds work as a single object", async () => {
    const select = await conn.prepare("SELECT qty FROM widgets WHERE name = $name");
    const row = (await select.get({ name: "sprocket" })) as Record<string, unknown>;
    expect(row["qty"]).toBe(42);
  });

  it("columns() returns column metadata", async () => {
    const stmt = await conn.prepare("SELECT id, name, qty FROM widgets");
    const cols = stmt.columns();
    expect(cols.length).toBe(3);
    expect(cols[0].name).toBe("id");
    expect(cols[0].column === null || typeof cols[0].column === "string").toBe(true);
  });

  it("setReadBigInts enables bigint returns", async () => {
    const stmt = await conn.prepare("SELECT qty FROM widgets WHERE name = ?");
    stmt.setReadBigInts(true);
    const row = (await stmt.get(["sprocket"])) as Record<string, unknown>;
    expect(typeof row["qty"]).toBe("bigint");
  });

  it("exec runs SQL", async () => {
    await conn.exec("CREATE TABLE IF NOT EXISTS tmp_exec (x INTEGER)");
    await conn.exec("DROP TABLE tmp_exec");
  });

  it("pragma returns a value", async () => {
    const result = await conn.pragma("journal_mode");
    expect(result).toBeDefined();
  });

  it("write pragma does not throw and returns []", async () => {
    expect(await conn.pragma("foreign_keys = ON")).toEqual([]);
  });

  it("isOpen() is true while connected", () => {
    expect(conn.isOpen()).toBe(true);
  });

  it("statement.reader is true for SELECT/PRAGMA, false for INSERT/write-PRAGMA", async () => {
    expect((await conn.prepare("SELECT 1")).reader).toBe(true);
    expect((await conn.prepare("PRAGMA journal_mode")).reader).toBe(true);
    expect((await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)")).reader).toBe(
      false,
    );
    expect((await conn.prepare("PRAGMA foreign_keys = ON")).reader).toBe(false);
  });

  it("databaseExists() reports memory databases as present", () => {
    expect(nodeSqliteDriver.databaseExists?.({ database: ":memory:" })).toBe(true);
  });

  it("databaseExists() preserves a relative file: URI (cwd-relative, not /-anchored)", async () => {
    const relName = `node-rel-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
    try {
      const conn = await nodeSqliteDriver.open({ database: `file:${relName}` });
      await conn.exec("CREATE TABLE t (x INTEGER)");
      await conn.exec("DROP TABLE IF EXISTS t");
      await conn.close();
      expect(File.isExist(relName)).toBe(true);
      expect(File.isExist(`/${relName}`)).toBe(false);
      expect(nodeSqliteDriver.databaseExists?.({ database: `file:${relName}` })).toBe(true);
    } finally {
      for (const p of [relName, `${relName}-wal`, `${relName}-shm`]) {
        try {
          File.delete(p);
        } catch {}
      }
    }
  });

  it("capabilities reflect node-sqlite traits", () => {
    expect(nodeSqliteDriver.capabilities.inProcessSync).toBe(true);
    expect(nodeSqliteDriver.capabilities.streaming).toBe(true);
    expect(nodeSqliteDriver.capabilities.foreignKeysOnByDefault).toBe(false);
  });
});

describe.skipIf(!isNodeSqliteAvailable)("SqliteDriver — node-sqlite strict", () => {
  it("rejects unknown double-quoted identifiers under strict: true", async () => {
    const conn = await nodeSqliteDriver.open({ database: ":memory:", strict: true });
    try {
      expect(() => conn.prepare(`SELECT "missing_col" AS v`)).toThrow(/no such column/i);
    } finally {
      await conn.close();
    }
  });

  it("treats unknown double-quoted identifiers as literals under strict: false", async () => {
    const conn = await nodeSqliteDriver.open({ database: ":memory:", strict: false });
    try {
      const stmt = await conn.prepare(`SELECT "missing_col" AS v`);
      const row = (await stmt.get()) as Record<string, unknown>;
      expect(row["v"]).toBe("missing_col");
    } finally {
      await conn.close();
    }
  });
});

describe.skipIf(!isNodeSqliteAvailable)("SqliteDriver — node-sqlite restoreFromPath", () => {
  const templatePath = `${getOs().tmpdir()}/nodesqlite-restore-template-${process.pid}.sqlite`;
  const destPath = `${getOs().tmpdir()}/nodesqlite-restore-dest-${process.pid}.sqlite`;

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
    const tpl = await nodeSqliteDriver.open({ database: templatePath });
    await tpl.exec(
      // eslint-disable-next-line blazetrails/require-table-teardown
      "CREATE TABLE gadgets (id INTEGER PRIMARY KEY, label TEXT);" +
        "INSERT INTO gadgets (label) VALUES ('alpha'), ('beta');",
    );
    await tpl.close();
  });

  afterAll(removeTempFiles);

  it("restores a template DB into a fresh destination via the backup primitive", async () => {
    await nodeSqliteDriver.restoreFromPath!(templatePath, destPath);

    const probe = await nodeSqliteDriver.open({ database: destPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM gadgets")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    await probe.close();
  });
});

describe.skipIf(!isNodeSqliteAvailable)(
  "SqliteDriver — node-sqlite binds unsupplied placeholders as NULL",
  () => {
    let conn: SqliteConnection;

    beforeAll(async () => {
      conn = await nodeSqliteDriver.open({ database: ":memory:" });
      const create = await conn.prepare("CREATE TABLE doodads (id INTEGER PRIMARY KEY, name TEXT)");
      await create.run();
      const insert = await conn.prepare("INSERT INTO doodads (name) VALUES (?)");
      await insert.run(["alpha"]);
    });

    afterAll(async () => {
      await conn.close();
    });

    it("runs a statement with placeholders and no values at all, like the Ruby sqlite3 gem", async () => {
      const stmt = await conn.prepare("SELECT * FROM doodads WHERE id = ?");
      expect(await stmt.all()).toEqual([]);
    });

    it("pads only the trailing placeholders left unsupplied", async () => {
      const stmt = await conn.prepare("SELECT * FROM doodads WHERE name = ? OR id = ?");
      expect(await stmt.all(["alpha"])).toEqual([{ id: 1, name: "alpha" }]);
    });

    it("EXPLAIN QUERY PLAN runs against a statement whose binds were never supplied", async () => {
      const stmt = await conn.prepare("EXPLAIN QUERY PLAN SELECT * FROM doodads WHERE id = ?");
      expect((await stmt.all()).length).toBeGreaterThan(0);
    });

    it("does not raise on an ordinary query given a short bind list", async () => {
      const select = await conn.prepare("SELECT * FROM doodads WHERE name = ? AND id = ?");
      expect(await select.all(["alpha"])).toEqual([]);
      const update = await conn.prepare("UPDATE doodads SET name = ? WHERE id = ?");
      expect((await update.run(["beta"])).changes).toBe(0);
    });

    it("shared-cache open either shares a cache or fails to open", async () => {
      const conns: SqliteConnection[] = [];
      try {
        for (let i = 0; i < 2; i++) {
          conns.push(
            await nodeSqliteDriver.open({
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

    it("keeps the shared-cache option ahead of a URI fragment", async () => {
      const conns: SqliteConnection[] = [];
      for (let i = 0; i < 2; i++) {
        conns.push(
          await nodeSqliteDriver.open({
            database: "file::memory:#frag",
            flags: SQLite3Constants.Open.READWRITE | SQLite3Constants.Open.SHAREDCACHE,
          }),
        );
      }
      const [a, b] = conns;
      await a.exec("CREATE TABLE fragment_probe (x INTEGER)");
      await b.exec("PRAGMA read_uncommitted=ON");
      const probe = await b.prepare("SELECT count(*) AS n FROM fragment_probe");
      expect(await probe.all()).toEqual([{ n: 0 }]);
      await a.exec("DROP TABLE IF EXISTS fragment_probe");
      for (const c of conns) await c.close();
    });
  },
);
