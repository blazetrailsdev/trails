import { SQLite3 } from "../lib/index.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type ColumnInfo, type SqliteConnection } from "../lib/driver.js";
import { File, getOs } from "@blazetrails/ruby-compat";
import {
  libsqlDriver,
  libsqlRemoteDriver,
  libsqlReplicaDriver,
  isReplicaConfig,
  buildReplicaOptions,
} from "../lib/libsql.js";
import { Pragmas } from "../lib/pragmas.js";

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

  it("rollback() rolls the open transaction back and answers true, as the gem's Database#rollback does", async () => {
    const before = await driver.getFirstValue("SELECT qty FROM widgets WHERE name = ?", "gear");
    await driver.exec("BEGIN");
    await driver.execute("UPDATE widgets SET qty = qty + 1 WHERE name = ?", ["gear"]);
    expect(await driver.rollback()).toBe(true);
    expect(await driver.getFirstValue("SELECT qty FROM widgets WHERE name = ?", "gear")).toBe(
      before,
    );
    await expect((async () => driver.rollback())()).rejects.toThrow();
  });

  it("getFirstValue() reads the first column of the first row by name, and null for a non-reader", async () => {
    expect(await driver.getFirstValue("SELECT 2 AS b, 1 AS a")).toBe(2);
    expect(await driver.getFirstValue("SELECT name FROM widgets WHERE 0")).toBe(null);
    expect(await driver.getFirstValue("UPDATE widgets SET qty = qty WHERE 0")).toBe(null);
  });

  it("execute() returns the statement's rows, frozen, and [] for a non-reader", async () => {
    const rows = await driver.execute("SELECT name FROM widgets WHERE qty = ?", [42]);
    expect(rows).toEqual([{ name: "sprocket" }]);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(await driver.execute("UPDATE widgets SET qty = qty WHERE 0")).toEqual([]);
  });

  it("run() returns changes and lastInsertRowid", async () => {
    const insert = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    const result = await insert.run(["bolt", 99]);
    expect(result.changes).toBe(1);
    expect(
      typeof result.lastInsertRowid === "number" || typeof result.lastInsertRowid === "bigint",
    ).toBe(true);
  });

  it("step() runs a non-reader statement over its bound params", async () => {
    const update = await driver.prepare("UPDATE widgets SET qty = ? WHERE name = ?");
    update.bindParams([7, "gear"]);
    expect(await update.step()).toBeNull();
    expect(await driver.changes()).toBe(1);
  });

  it("toA() returns positional rows for the bound params, duplicate column names included", async () => {
    const select = await driver.prepare("SELECT name, qty AS name FROM widgets WHERE name = ?");
    select.bindParams(["sprocket"]);
    expect(await select.toA()).toEqual([["sprocket", 42]]);
    expect(await select.get(["sprocket"])).toMatchObject({ name: 42 });
  });

  it("returns all rows", async () => {
    const select = await driver.prepare("SELECT id, name, qty FROM widgets ORDER BY id");
    const rows = (await select.all()) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map((r) => r["name"]);
    expect(names).toContain("sprocket");
    expect(names).toContain("gear");
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

  it("statement.reader is true for SELECT, false for INSERT", async () => {
    const sel = await driver.prepare("SELECT 1");
    expect(sel.reader).toBe(true);

    const ins = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    expect(ins.reader).toBe(false);
  });

  it("capabilities reflect libsql traits", () => {
    expect(libsqlDriver.capabilities.inProcessSync).toBe(true);
    expect(libsqlDriver.capabilities.streaming).toBe(true);
    expect(libsqlDriver.capabilities.foreignKeysOnByDefault).toBe(false);
    expect(libsqlDriver.capabilities.loadExtension).toBe(false);
  });
});

describe("SqliteDriver — libsql local-file round-trip", () => {
  const dbPath = `${getOs().tmpdir()}/libsql-roundtrip-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
  const sidecars = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const removeFiles = (): void => {
    for (const p of sidecars) {
      try {
        File.delete(p);
      } catch {}
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

    const probe = await libsqlDriver.open({ database: dbPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM gadgets")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    const row = (await (
      await probe.prepare("SELECT label FROM gadgets WHERE id = ?")
    ).get([1])) as { label: string };
    expect(row.label).toBe("alpha");

    await probe.exec("DROP TABLE IF EXISTS gadgets");
    await probe.close();
  });

  it("databaseExists() resolves an absolute file: URI", () => {
    expect(libsqlDriver.databaseExists?.({ database: `file://${dbPath}` })).toBe(true);
  });

  it("databaseExists() preserves a relative file: URI (cwd-relative, not /-anchored)", async () => {
    const relName = `libsql-rel-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
    try {
      const conn = await libsqlDriver.open({ database: `file:${relName}` });
      await conn.exec("CREATE TABLE t (x INTEGER)");

      await conn.exec("DROP TABLE IF EXISTS t");
      await conn.close();
      expect(libsqlDriver.databaseExists?.({ database: `file:${relName}` })).toBe(true);
    } finally {
      for (const p of [relName, `${relName}-wal`, `${relName}-shm`]) {
        try {
          File.delete(p);
        } catch {}
      }
    }
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
        File.delete(p);
      } catch {}
    }
  };

  beforeAll(async () => {
    removeTempFiles();
    const tpl = await libsqlDriver.open({ database: templatePath });
    await tpl.exec(
      "CREATE TABLE libsql_items (id INTEGER PRIMARY KEY, label TEXT);" +
        "INSERT INTO libsql_items (label) VALUES ('alpha'), ('beta');",
    );
    await tpl.close();
  });

  afterAll(removeTempFiles);

  it("restores a template DB into a fresh destination", async () => {
    await libsqlDriver.restoreFromPath!(templatePath, destPath);

    const probe = await libsqlDriver.open({ database: destPath });
    const count = (await (await probe.prepare("SELECT count(*) AS c FROM libsql_items")).get()) as {
      c: number;
    };
    expect(count.c).toBe(2);
    await probe.close();
  });

  it("rejects an in-memory destination URI in the file-clone fallback", async () => {
    await expect(
      libsqlDriver.restoreFromPath!(templatePath, "file:restored?mode=memory&cache=shared"),
    ).rejects.toThrow(/in-memory destination/);
  });
});

describe("libsqlRemoteDriver — capabilities and async-open dispatch", () => {
  it("has inProcessSync: false", () => {
    expect(libsqlRemoteDriver.capabilities.inProcessSync).toBe(false);
  });

  it("has loadExtension: false", () => {
    expect(libsqlRemoteDriver.capabilities.loadExtension).toBe(false);
  });

  it("omits databaseExists", () => {
    expect(libsqlRemoteDriver.databaseExists).toBeUndefined();
  });

  it("omits restoreFromPath", () => {
    expect(libsqlRemoteDriver.restoreFromPath).toBeUndefined();
  });
});

describe("isReplicaConfig — embedded-replica mode selection", () => {
  it("selects replica mode when a non-empty syncUrl is present", () => {
    expect(
      isReplicaConfig({
        database: "/tmp/replica.db",
        driverOptions: { syncUrl: "libsql://primary.turso.io", authToken: "tok" },
      }),
    ).toBe(true);
  });

  it("does not select replica mode without a syncUrl", () => {
    expect(isReplicaConfig({ database: "/tmp/replica.db" })).toBe(false);
    expect(
      isReplicaConfig({ database: "/tmp/replica.db", driverOptions: { authToken: "tok" } }),
    ).toBe(false);
  });

  it("selects replica mode from a top-level syncUrl in the configuration hash", () => {
    expect(
      isReplicaConfig({ database: "/tmp/replica.db", syncUrl: "libsql://primary.turso.io" }),
    ).toBe(true);
  });

  it("does not select replica mode for an empty syncUrl", () => {
    expect(isReplicaConfig({ database: "/tmp/replica.db", driverOptions: { syncUrl: "" } })).toBe(
      false,
    );
  });
});

describe("libsqlReplicaDriver — capabilities and async-open dispatch", () => {
  it("has inProcessSync: false", () => {
    expect(libsqlReplicaDriver.capabilities.inProcessSync).toBe(false);
  });

  it("omits databaseExists and restoreFromPath", () => {
    expect(libsqlReplicaDriver.databaseExists).toBeUndefined();
    expect(libsqlReplicaDriver.restoreFromPath).toBeUndefined();
  });

  it("rejects opening a replica config without a syncUrl", async () => {
    await expect(libsqlReplicaDriver.open({ database: "/tmp/no-sync.db" })).rejects.toThrow(
      /syncUrl/,
    );
  });
});

describe("buildAdapterArg — syncUrl threading (replica mode)", () => {
  it("threads syncUrl and authToken into driverOptions", () => {
    const driverOpts = buildReplicaOptions({
      database: "/tmp/replica.db",
      syncUrl: "libsql://primary.turso.io",
      authToken: "tok_secret",
    }) as Record<string, unknown>;
    expect(driverOpts.syncUrl).toBe("libsql://primary.turso.io");
    expect(driverOpts.authToken).toBe("tok_secret");
  });

  it("merges syncUrl into a pre-existing driverOptions object", () => {
    const driverOpts = buildReplicaOptions({
      database: "/tmp/replica.db",
      syncUrl: "libsql://primary.turso.io",
      driverOptions: { tls: true },
    }) as Record<string, unknown>;
    expect(driverOpts.syncUrl).toBe("libsql://primary.turso.io");
    expect(driverOpts.tls).toBe(true);
  });
});

describe("buildReplicaOptions — auto-sync config threading", () => {
  it("threads a positive syncPeriod into the libsql options", () => {
    const opts = buildReplicaOptions({
      database: "/tmp/replica.db",
      driverOptions: { syncUrl: "libsql://primary.turso.io", authToken: "tok", syncPeriod: 30 },
    });
    expect(opts.syncUrl).toBe("libsql://primary.turso.io");
    expect(opts.authToken).toBe("tok");
    expect(opts.syncPeriod).toBe(30);
  });

  it("leaves syncPeriod absent when no auto-sync is configured", () => {
    const opts = buildReplicaOptions({
      database: "/tmp/replica.db",
      driverOptions: { syncUrl: "libsql://primary.turso.io" },
    });
    expect(opts.syncPeriod).toBeUndefined();
  });

  it("rejects a non-positive syncPeriod", () => {
    expect(() =>
      buildReplicaOptions({
        database: "/tmp/replica.db",
        driverOptions: { syncUrl: "libsql://primary.turso.io", syncPeriod: 0 },
      }),
    ).toThrow(/syncPeriod/);
    expect(() =>
      buildReplicaOptions({
        database: "/tmp/replica.db",
        driverOptions: { syncUrl: "libsql://primary.turso.io", syncPeriod: -5 },
      }),
    ).toThrow(/syncPeriod/);
  });

  it("requires a syncUrl", () => {
    expect(() => buildReplicaOptions({ database: "/tmp/replica.db" })).toThrow(/syncUrl/);
  });
});

const tursoUrl = typeof process !== "undefined" ? process.env["TURSO_DATABASE_URL"] : undefined;
const tursoToken = typeof process !== "undefined" ? process.env["TURSO_AUTH_TOKEN"] : undefined;
const hasCredentials = Boolean(tursoUrl && tursoToken);

describe.skipIf(!hasCredentials)("libsqlRemoteDriver — network round-trip (TURSO_*)", () => {
  let conn: SqliteConnection;

  beforeAll(async () => {
    conn = await libsqlRemoteDriver.open({
      database: tursoUrl!,
      driverOptions: { authToken: tursoToken },
    });
  });

  afterAll(async () => {
    await conn.close();
  });

  it("opens a remote connection and can execute a query", async () => {
    const stmt = await conn.prepare("SELECT 1 AS n");
    const row = (await stmt.get()) as { n: number };
    expect(row.n).toBe(1);
  });

  it("accepts the busy_timeout pragma configureConnection sets", async () => {
    await Pragmas.setBusyTimeout.call(conn, 0);
    expect(await Pragmas.busyTimeout.call(conn)).toBe(0);
  });
});

describe("SqliteDriver — libsql binds unsupplied placeholders as NULL", () => {
  let driver: SqliteConnection;

  beforeAll(async () => {
    driver = await libsqlDriver.open({ database: ":memory:" });
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
          await libsqlDriver.open({
            database: "file::memory:?cache=shared",
            flags: SQLite3.Constants.Open.READWRITE | SQLite3.Constants.Open.SHAREDCACHE,
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
        await libsqlDriver.open({
          database: "file::memory:#frag",
          flags: SQLite3.Constants.Open.READWRITE | SQLite3.Constants.Open.SHAREDCACHE,
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
});
