import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ColumnInfo, SqliteConnection } from "../sqlite-adapter.js";
import { getFs } from "@blazetrails/activesupport/fs-adapter";
import { getOs } from "@blazetrails/activesupport/os-adapter";
import {
  libsqlDriver,
  libsqlRemoteDriver,
  libsqlReplicaDriver,
  isRemoteLibsqlUrl,
  isReplicaConfig,
} from "./libsql.js";
import { LibSQLAdapter } from "../connection-adapters/libsql-adapter.js";
import { LibSQLRemoteAdapter } from "../connection-adapters/libsql-remote-adapter.js";
import { LibSQLReplicaAdapter } from "../connection-adapters/libsql-replica-adapter.js";
import { buildAdapterArg, parseSqliteUrl } from "../connection-adapters/adapter-args.js";

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

  it("databaseExists() resolves an absolute file: URI", () => {
    expect(libsqlDriver.databaseExists?.({ database: `file://${dbPath}` })).toBe(true);
  });

  it("databaseExists() preserves a relative file: URI (cwd-relative, not /-anchored)", async () => {
    // libsql opens `file:name.db` relative to cwd, so databaseExists() must
    // check the same cwd-relative path rather than anchoring it at "/".
    const relName = `libsql-rel-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
    try {
      const conn = await libsqlDriver.open({ database: `file:${relName}` });
      await conn.exec("CREATE TABLE t (x INTEGER)");
      await conn.close();
      expect(libsqlDriver.databaseExists?.({ database: `file:${relName}` })).toBe(true);
    } finally {
      for (const p of [relName, `${relName}-wal`, `${relName}-shm`]) {
        try {
          getFs().unlinkSync(p);
        } catch {
          /* best effort */
        }
      }
    }
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

  it("rejects an in-memory destination URI in the file-clone fallback", async () => {
    await expect(
      libsqlDriver.restoreFromPath!(templatePath, "file:restored?mode=memory&cache=shared"),
    ).rejects.toThrow(/in-memory destination/);
  });
});

describe("isRemoteLibsqlUrl — URL scheme detection", () => {
  it("recognises libsql:// as remote", () => {
    expect(isRemoteLibsqlUrl("libsql://mydb.turso.io")).toBe(true);
  });

  it("recognises https:// as remote", () => {
    expect(isRemoteLibsqlUrl("https://mydb.turso.io")).toBe(true);
  });

  it("recognises http:// as remote", () => {
    expect(isRemoteLibsqlUrl("http://localhost:8080")).toBe(true);
  });

  it("recognises wss:// as remote", () => {
    expect(isRemoteLibsqlUrl("wss://mydb.turso.io")).toBe(true);
  });

  it("recognises ws:// as remote", () => {
    expect(isRemoteLibsqlUrl("ws://localhost:8080")).toBe(true);
  });

  it("does not treat local file paths as remote", () => {
    expect(isRemoteLibsqlUrl("/tmp/local.db")).toBe(false);
    expect(isRemoteLibsqlUrl("file:local.db")).toBe(false);
    expect(isRemoteLibsqlUrl(":memory:")).toBe(false);
  });
});

describe("libsqlRemoteDriver — capabilities and async-open dispatch", () => {
  it("has inProcessSync: false", () => {
    expect(libsqlRemoteDriver.capabilities.inProcessSync).toBe(false);
  });

  it("has loadExtension: false", () => {
    expect(libsqlRemoteDriver.capabilities.loadExtension).toBe(false);
  });

  it("omits openSync so the async-open path is used", () => {
    expect(libsqlRemoteDriver.openSync).toBeUndefined();
  });

  it("omits databaseExists", () => {
    expect(libsqlRemoteDriver.databaseExists).toBeUndefined();
  });

  it("omits restoreFromPath", () => {
    expect(libsqlRemoteDriver.restoreFromPath).toBeUndefined();
  });
});

describe("parseSqliteUrl — remote URL pass-through", () => {
  it("passes libsql:// through unchanged", () => {
    expect(parseSqliteUrl("libsql://mydb.turso.io")).toBe("libsql://mydb.turso.io");
  });

  it("passes https:// through unchanged", () => {
    expect(parseSqliteUrl("https://mydb.turso.io")).toBe("https://mydb.turso.io");
  });

  it("still strips sqlite3:// prefix for local adapters", () => {
    expect(parseSqliteUrl("sqlite3:///tmp/local.db")).toBe("/tmp/local.db");
  });
});

describe("buildAdapterArg — authToken threading", () => {
  it("threads authToken into driverOptions", () => {
    const [filename, options] = buildAdapterArg("libsql-remote", {
      url: "libsql://mydb.turso.io",
      authToken: "tok_secret",
    }) as [string, Record<string, unknown>];
    expect(filename).toBe("libsql://mydb.turso.io");
    expect((options.driverOptions as Record<string, unknown>).authToken).toBe("tok_secret");
  });

  it("prefers remote url over database for libsql:// URLs", () => {
    const [filename] = buildAdapterArg("libsql-remote", {
      url: "libsql://mydb.turso.io",
      database: "local.db",
      authToken: "tok",
    }) as [string];
    expect(filename).toBe("libsql://mydb.turso.io");
  });

  it("produces no options object when only url and no extras supplied", () => {
    const args = buildAdapterArg("libsql-remote", { url: "libsql://mydb.turso.io" });
    expect(args).toHaveLength(1);
    expect(args[0]).toBe("libsql://mydb.turso.io");
  });

  it("merges authToken into a pre-existing driverOptions object", () => {
    const [, options] = buildAdapterArg("libsql-remote", {
      url: "libsql://mydb.turso.io",
      authToken: "tok",
      driverOptions: { tls: true },
    }) as [string, Record<string, unknown>];
    const driverOpts = options.driverOptions as Record<string, unknown>;
    expect(driverOpts.authToken).toBe("tok");
    expect(driverOpts.tls).toBe(true);
  });

  it("forwards a raw driverOptions object when authToken is absent", () => {
    const [, options] = buildAdapterArg("libsql-remote", {
      url: "libsql://mydb.turso.io",
      driverOptions: { tls: false },
    }) as [string, Record<string, unknown>];
    expect((options.driverOptions as Record<string, unknown>).tls).toBe(false);
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

  it("omits openSync so the async-open path is used", () => {
    expect(libsqlReplicaDriver.openSync).toBeUndefined();
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
    const [filename, options] = buildAdapterArg("libsql-replica", {
      database: "/tmp/replica.db",
      syncUrl: "libsql://primary.turso.io",
      authToken: "tok_secret",
    }) as [string, Record<string, unknown>];
    expect(filename).toBe("/tmp/replica.db");
    const driverOpts = options.driverOptions as Record<string, unknown>;
    expect(driverOpts.syncUrl).toBe("libsql://primary.turso.io");
    expect(driverOpts.authToken).toBe("tok_secret");
  });

  it("merges syncUrl into a pre-existing driverOptions object", () => {
    const [, options] = buildAdapterArg("libsql-replica", {
      database: "/tmp/replica.db",
      syncUrl: "libsql://primary.turso.io",
      driverOptions: { tls: true },
    }) as [string, Record<string, unknown>];
    const driverOpts = options.driverOptions as Record<string, unknown>;
    expect(driverOpts.syncUrl).toBe("libsql://primary.turso.io");
    expect(driverOpts.tls).toBe(true);
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
});

describe.skipIf(!hasCredentials)("LibSQLRemoteAdapter — network adapter smoke (TURSO_*)", () => {
  let adapter: Awaited<ReturnType<typeof LibSQLRemoteAdapter.openAsync>>;

  beforeAll(async () => {
    adapter = await LibSQLRemoteAdapter.openAsync(tursoUrl, {
      driverOptions: { authToken: tursoToken },
    });
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("executes a SELECT through the adapter", async () => {
    const rows = await adapter.execute("SELECT 1 AS n");
    expect((rows[0] as { n: number }).n).toBe(1);
  });
});

describe.skipIf(!hasCredentials)(
  "LibSQLReplicaAdapter — embedded-replica round-trip (TURSO_*)",
  () => {
    const replicaPath = `${getOs().tmpdir()}/libsql-replica-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
    const sidecars = [
      replicaPath,
      `${replicaPath}-wal`,
      `${replicaPath}-shm`,
      `${replicaPath}-info`,
    ];
    const removeFiles = (): void => {
      for (const p of sidecars) {
        try {
          getFs().unlinkSync(p);
        } catch {
          /* best effort */
        }
      }
    };

    let primary: Awaited<ReturnType<typeof LibSQLRemoteAdapter.openAsync>>;
    let replica: LibSQLReplicaAdapter;
    const table = `replica_smoke_${Date.now()}`;

    beforeAll(async () => {
      removeFiles();
      // Write to the primary directly so we have a known remote state to pull.
      primary = await LibSQLRemoteAdapter.openAsync(tursoUrl, {
        driverOptions: { authToken: tursoToken },
      });
      await primary.executeMutation(`DROP TABLE IF EXISTS ${table}`);
      await primary.executeMutation(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, label TEXT)`);
      await primary.executeMutation(`INSERT INTO ${table} (id, label) VALUES (1, 'remote')`);

      replica = (await LibSQLReplicaAdapter.openAsync(replicaPath, {
        driverOptions: { syncUrl: tursoUrl, authToken: tursoToken },
      })) as LibSQLReplicaAdapter;
    });

    afterAll(async () => {
      await replica.close();
      await primary.executeMutation(`DROP TABLE IF EXISTS ${table}`);
      await primary.close();
      removeFiles();
    });

    it("reflects a remote write after syncReplica()", async () => {
      await replica.syncReplica();
      const rows = await replica.execute(`SELECT label FROM ${table} WHERE id = 1`);
      expect((rows[0] as { label: string }).label).toBe("remote");

      // A subsequent remote write is invisible until the next sync.
      await primary.executeMutation(`INSERT INTO ${table} (id, label) VALUES (2, 'later')`);
      await replica.syncReplica();
      const after = await replica.execute(`SELECT count(*) AS c FROM ${table}`);
      expect(Number((after[0] as { c: number }).c)).toBe(2);
    });
  },
);
