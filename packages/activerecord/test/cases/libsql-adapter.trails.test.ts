import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { File, getOs } from "@blazetrails/ruby-compat";
import { libsqlDriver } from "@blazetrails/sqlite3/libsql";
import { LibSQLAdapter } from "../../lib/connection-adapters/libsql-adapter.js";
import { LibSQLRemoteAdapter } from "../../lib/connection-adapters/libsql-remote-adapter.js";
import { LibSQLReplicaAdapter } from "../../lib/connection-adapters/libsql-replica-adapter.js";

const tursoUrl = typeof process !== "undefined" ? process.env["TURSO_DATABASE_URL"] : undefined;
const tursoToken = typeof process !== "undefined" ? process.env["TURSO_AUTH_TOKEN"] : undefined;
const hasCredentials = Boolean(tursoUrl && tursoToken);

describe("LibSQLAdapter — local-file smoke", () => {
  const dbPath = `${getOs().tmpdir()}/libsql-adapter-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
  const sidecars = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const removeFiles = (): void => {
    for (const p of sidecars) {
      try {
        File.delete(p);
      } catch {}
    }
  };

  let adapter: LibSQLAdapter;

  beforeAll(async () => {
    removeFiles();
    adapter = new LibSQLAdapter({ adapter: "libsql", database: dbPath });
    await adapter.execute(
      "CREATE TABLE libsql_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
    );
  });

  afterAll(async () => {
    await adapter.execute("DROP TABLE IF EXISTS libsql_items");
    await adapter.disconnectBang();
    removeFiles();
  });

  it("inserts and selects rows through the adapter", async () => {
    await adapter.execute("INSERT INTO libsql_items (name) VALUES ('apple')");
    await adapter.execute("INSERT INTO libsql_items (name) VALUES ('banana')");
    const rows = (await adapter.execute("SELECT name FROM libsql_items ORDER BY id"))!;
    expect(rows.map((r) => (r as { name: string }).name)).toEqual(["apple", "banana"]);
  });

  it("reflects schema ops via the shared SQLite3Adapter dialect", async () => {
    const tables = await adapter.tables();
    expect(tables).toContain("libsql_items");
    const columns = await adapter.columns("libsql_items");
    expect(columns.map((c) => c.name)).toContain("name");
  });
});

describe("LibSQLRemoteAdapter#databaseExists", () => {
  it("answers from a connection, not from File.exist? on the database URL", async () => {
    const adapter = new LibSQLRemoteAdapter({ database: "file::memory:", driver: libsqlDriver });
    try {
      expect(await adapter.databaseExists()).toBe(true);
    } finally {
      await adapter.disconnectBang();
    }
  });
});

describe.skipIf(!hasCredentials)("LibSQLRemoteAdapter — network adapter smoke (TURSO_*)", () => {
  let adapter: LibSQLRemoteAdapter;

  beforeAll(async () => {
    adapter = await new LibSQLRemoteAdapter({
      adapter: "libsql-remote",
      database: tursoUrl,
      driverOptions: { authToken: tursoToken },
    }).connectBang();
  });

  afterAll(async () => {
    await adapter.disconnectBang();
  });

  it("executes a SELECT through the adapter", async () => {
    const rows = (await adapter.execute("SELECT 1 AS n")) as { n: number }[];
    expect(rows[0].n).toBe(1);
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
          File.delete(p);
        } catch {}
      }
    };

    let primary: LibSQLRemoteAdapter;
    let replica: LibSQLReplicaAdapter;
    const table = `replica_smoke_${Date.now()}`;

    beforeAll(async () => {
      removeFiles();
      primary = await new LibSQLRemoteAdapter({
        adapter: "libsql-remote",
        database: tursoUrl,
        driverOptions: { authToken: tursoToken },
      }).connectBang();
      await primary.execute(`DROP TABLE IF EXISTS ${table}`);
      await primary.execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, label TEXT)`);
      await primary.execute(`INSERT INTO ${table} (id, label) VALUES (1, 'remote')`);

      replica = await new LibSQLReplicaAdapter({
        adapter: "libsql-replica",
        database: replicaPath,
        driverOptions: { syncUrl: tursoUrl, authToken: tursoToken },
      }).connectBang();
    });

    afterAll(async () => {
      await replica.disconnectBang();
      await primary.execute(`DROP TABLE IF EXISTS ${table}`);
      await primary.disconnectBang();
      removeFiles();
    });

    it("reflects a remote write after syncReplica()", async () => {
      await replica.syncReplica();
      const rows = (await replica.execute(`SELECT label FROM ${table} WHERE id = 1`))!;
      expect((rows[0] as { label: string }).label).toBe("remote");

      await primary.execute(`INSERT INTO ${table} (id, label) VALUES (2, 'later')`);
      await replica.syncReplica();
      const after = (await replica.execute(`SELECT count(*) AS c FROM ${table}`))!;
      expect(Number((after[0] as { c: number }).c)).toBe(2);
    });
  },
);

describe.skipIf(!hasCredentials)(
  "LibSQLReplicaAdapter — periodic auto-sync converges (TURSO_*)",
  () => {
    const replicaPath = `${getOs().tmpdir()}/libsql-autosync-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`;
    const sidecars = [
      replicaPath,
      `${replicaPath}-wal`,
      `${replicaPath}-shm`,
      `${replicaPath}-info`,
    ];
    const removeFiles = (): void => {
      for (const p of sidecars) {
        try {
          File.delete(p);
        } catch {}
      }
    };
    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    let primary: LibSQLRemoteAdapter;
    let replica: LibSQLReplicaAdapter;
    const table = `autosync_${Date.now()}`;

    beforeAll(async () => {
      removeFiles();
      primary = await new LibSQLRemoteAdapter({
        adapter: "libsql-remote",
        database: tursoUrl,
        driverOptions: { authToken: tursoToken },
      }).connectBang();
      await primary.execute(`DROP TABLE IF EXISTS ${table}`);
      await primary.execute(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, label TEXT)`);

      replica = await new LibSQLReplicaAdapter({
        adapter: "libsql-replica",
        database: replicaPath,
        driverOptions: { syncUrl: tursoUrl, authToken: tursoToken, syncPeriod: 1 },
      }).connectBang();
    });

    afterAll(async () => {
      await replica.disconnectBang();
      await primary.execute(`DROP TABLE IF EXISTS ${table}`);
      await primary.disconnectBang();
      removeFiles();
    });

    it("reflects a remote write without an explicit syncReplica()", async () => {
      await primary.execute(`INSERT INTO ${table} (id, label) VALUES (1, 'auto')`);

      let label: string | undefined;
      for (let attempt = 0; attempt < 15 && label === undefined; attempt++) {
        await delay(1000);
        const rows = (await replica.execute(`SELECT label FROM ${table} WHERE id = 1`))!;
        label = (rows[0] as { label: string } | undefined)?.label;
      }
      expect(label).toBe("auto");
    });
  },
);
