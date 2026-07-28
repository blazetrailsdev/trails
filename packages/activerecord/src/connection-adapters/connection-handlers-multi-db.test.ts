import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations, type RawConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import { currentRole } from "../core.js";

describe("ConnectionHandlersMultiDbTest", () => {
  let handler: ConnectionHandler;
  let rwPool: any;
  let roPool: any;
  const connectionName = "Base";

  // Rails names distinct on-disk databases (test/db/primary.sqlite3,
  // test/db/readonly.sqlite3, test/db/animals.sqlite3) so that two pools
  // genuinely address two databases; `:memory:` on both sides would make the
  // discrimination vacuous. Per-run temp dir keeps parallel workers isolated.
  const DB_NAMES = ["primary", "readonly", "animals"] as const;
  type DbName = (typeof DB_NAMES)[number];

  let dbDir: string;
  let dbPaths: Record<DbName, string>;

  const sqliteDb = (name: DbName, extra: { replica?: boolean } = {}) => ({
    adapter: "sqlite3",
    database: dbPaths[name],
    ...extra,
  });

  async function asyncFs() {
    const fs = await getFsAsync();
    const { mkdtemp, writeFile, readdir, unlink, rmdir } = fs;
    if (!mkdtemp || !writeFile || !readdir || !unlink || !rmdir) {
      throw new Error("fs adapter is missing the async APIs this test requires");
    }
    return { mkdtemp, writeFile, readdir, unlink, rmdir };
  }

  beforeEach(async () => {
    const fs = await asyncFs();
    const path = await getPathAsync();
    const os = await getOsAsync();

    dbDir = await fs.mkdtemp(path.join(os.tmpdir(), "trails-conn-multi-db-"));
    dbPaths = {} as Record<DbName, string>;
    for (const name of DB_NAMES) {
      dbPaths[name] = path.join(dbDir, `${name}.sqlite3`);
      await fs.writeFile(dbPaths[name], "");
    }

    handler = new ConnectionHandler();
    const dbConfig = new HashConfig("test", connectionName, sqliteDb("primary"));
    rwPool = handler.establishConnection(dbConfig, { owner: connectionName });
    roPool = handler.establishConnection(dbConfig, {
      owner: connectionName,
      role: "reading",
    });
  });

  afterEach(async () => {
    await handler.clearAllConnectionsBang();
    await Base.connectionHandler.clearAllConnectionsBang();

    const fs = await asyncFs();
    const path = await getPathAsync();
    for (const entry of await fs.readdir(dbDir)) {
      await fs.unlink(path.join(dbDir, entry));
    }
    await fs.rmdir(dbDir);
  });

  function withBaseConfigs(
    raw: RawConfigurations,
    fn: () => void,
    opts: { defaultEnv?: string } = {},
  ): void {
    const prevConfigs = Base.configurations();
    const prevDefaultEnv = DatabaseConfigurations.defaultEnv;
    if (opts.defaultEnv) {
      DatabaseConfigurations.defaultEnv = opts.defaultEnv;
      vi.stubEnv("TRAILS_ENV", opts.defaultEnv);
    }
    Base.configurations(raw);
    try {
      fn();
    } finally {
      Base.configurations(prevConfigs);
      DatabaseConfigurations.defaultEnv = prevDefaultEnv;
      if (opts.defaultEnv) vi.unstubAllEnvs();
      // Sync helper (fn: () => void); the async clearAllConnectionsBang tears
      // down synchronously here, so catch (rather than await) its drain promise
      // to keep this best-effort without cascading async through ~15 callers.
      void Base.connectionHandler.clearAllConnectionsBang().catch(() => {});
    }
  }

  it.skip("multiple connections works in a threaded environment", () => {
    // PERMANENT-SKIP: Ruby-only — relies on real OS threads + Concurrent::CountDownLatch
    // (Thread.new) to prove the connection lease is thread-local under the GVL. JS has
    // no shared-memory threads; the async-context analogue is already covered by
    // connection-handling.test.ts "connected_to stack is isolated per async context".
  });

  it("loading relations with multi db connections", async () => {
    // We need to use a role for reading not named reading, otherwise we'll prevent
    // writes and won't be able to write to the second connection.
    class SecondaryBase extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    class MultiConnectionTestModel extends SecondaryBase {
      declare connectionRole: string;
      static {
        this.tableName = "multi_connection_test_models";
      }
    }

    SecondaryBase.connectsTo({
      database: {
        writing: { database: ":memory:", adapter: "sqlite3" },
        secondary: { database: ":memory:", adapter: "sqlite3" },
      },
    });

    // Load the relation within the :secondary scope so the query runs against
    // the connection where the `:memory:` table exists. `load()` returns the
    // relation itself (then-stripped) so it escapes the block as a loaded
    // Relation rather than auto-unwrapping to an array.
    const relation = await Base.connectedTo({ role: "secondary" }, async () => {
      await (
        await MultiConnectionTestModel.leaseConnection()
      ).executeMutation(
        "CREATE TABLE `multi_connection_test_models` (connection_role VARCHAR (255))",
      );
      await MultiConnectionTestModel.createBang({ connection_role: "reading" });
      const loaded = await MultiConnectionTestModel.where({ connection_role: "reading" }).load();
      // Relation is already loaded (cached); dropping here is behavior-neutral
      // and balances require-table-teardown for the raw-created table.
      await (
        await MultiConnectionTestModel.leaseConnection()
      ).executeMutation("DROP TABLE IF EXISTS `multi_connection_test_models`");
      return loaded;
    });

    // The relation is already loaded, so `.first` returns the cached record
    // without re-querying in the default (writing) pool — mirroring Rails.
    expect((await relation.first())!.readAttribute("connection_role")).toBe("reading");
  });

  it("establish connection using 3 levels config", () => {
    withBaseConfigs(
      {
        default_env: {
          readonly: sqliteDb("readonly", { replica: true }),
          default: sqliteDb("primary"),
        },
      },
      () => {
        Base.connectsTo({ database: { writing: "default", reading: "readonly" } });

        const writingPool = Base.connectionHandler.retrieveConnectionPool("Base");
        expect(writingPool).not.toBeNull();
        expect(writingPool!.dbConfig.name).toBe("default");

        const readingPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          role: "reading",
        });
        expect(readingPool).not.toBeNull();
        expect(readingPool!.dbConfig.name).toBe("readonly");
      },
      { defaultEnv: "default_env" },
    );
  });

  it("establish connection using 3 levels config with non default handlers", () => {
    withBaseConfigs(
      {
        default_env: {
          readonly: sqliteDb("readonly"),
          primary: sqliteDb("primary"),
        },
      },
      () => {
        Base.connectsTo({ database: { default: "primary", readonly: "readonly" } });

        const defaultPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          role: "default",
        });
        expect(defaultPool).not.toBeNull();
        expect(defaultPool!.dbConfig.name).toBe("primary");

        const readonlyPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          role: "readonly",
        });
        expect(readonlyPool).not.toBeNull();
        expect(readonlyPool!.dbConfig.name).toBe("readonly");
      },
      { defaultEnv: "default_env" },
    );
  });

  it("switching connections with database url", () => {
    withBaseConfigs({}, () => {
      Base.connectsTo({ database: { writing: "postgresql://localhost/bar" } });
      expect(currentRole.call(Base as any)).toBe("writing");
      expect(Base.connectedToQ({ role: "writing" })).toBe(true);
      const pool = Base.connectionHandler.retrieveConnectionPool("Base");
      expect(pool).not.toBeNull();
      expect(pool!.dbConfig.adapter).toMatch(/postgr/i);
    });
  });

  it("switching connections with database config hash", () => {
    withBaseConfigs({}, () => {
      Base.connectsTo({ database: { writing: sqliteDb("readonly") } });
      expect(currentRole.call(Base as any)).toBe("writing");
      expect(Base.connectedToQ({ role: "writing" })).toBe(true);
      expect(Base.connectionHandler.retrieveConnectionPool("Base")).not.toBeNull();
    });
  });

  it("switching connections without database and role raises", () => {
    expect(() => Base.connectedTo({}, () => {})).toThrow(/must provide a `shard` and\/or `role`/);
  });

  it("switching connections with database symbol uses default role", () => {
    withBaseConfigs(
      {
        default_env: {
          animals: sqliteDb("animals"),
          primary: sqliteDb("primary"),
        },
      },
      () => {
        Base.connectsTo({ database: { writing: "animals" } });
        expect(currentRole.call(Base as any)).toBe("writing");
        expect(Base.connectedToQ({ role: "writing" })).toBe(true);
        expect(Base.connectionHandler.retrieveConnectionPool("Base")).not.toBeNull();
      },
      { defaultEnv: "default_env" },
    );
  });

  it("switching connections with database hash uses passed role and database", () => {
    // Distinct database paths (as in Rails: test/db/primary.sqlite3 vs
    // …/animals.sqlite3) so the configuration_hash assertion below actually
    // discriminates that `primary` — not `animals` — was selected.
    const config = {
      default_env: {
        animals: sqliteDb("animals"),
        primary: sqliteDb("primary"),
      },
    };
    withBaseConfigs(
      config,
      () => {
        Base.connectsTo({ database: { writing: "primary" } });
        expect(currentRole.call(Base as any)).toBe("writing");
        expect(Base.connectedToQ({ role: "writing" })).toBe(true);

        const handler = Base.connectionHandler;
        expect(Base.connectionHandler).toBe(handler);

        const pool = handler.retrieveConnectionPool("Base");
        expect(pool).not.toBeNull();
        expect(pool!.dbConfig.name).toBe("primary");
        expect(pool!.dbConfig.configurationHash).toEqual(config.default_env.primary);
      },
      { defaultEnv: "default_env" },
    );
  });

  it("connects to with single configuration", () => {
    withBaseConfigs({ development: sqliteDb("primary") }, () => {
      Base.connectsTo({ database: { writing: "development" } });
      expect(Base.connectionHandler).toBe(Base.connectionHandler);
      expect(currentRole.call(Base as any)).toBe("writing");
      expect(Base.connectedToQ({ role: "writing" })).toBe(true);
      // database: arg → @shard_keys = [] (shards.keys before default injection)
      expect(Base.shardKeys()).toEqual([]);
      expect(Base.isSharded()).toBe(false);
    });
  });

  it("connects to using top level key in two level config", () => {
    withBaseConfigs(
      {
        development: sqliteDb("primary"),
        development_readonly: sqliteDb("readonly"),
      },
      () => {
        Base.connectsTo({ database: { writing: "development", reading: "development_readonly" } });
        const pool = Base.connectionHandler.retrieveConnectionPool("Base", { role: "reading" });
        expect(pool).not.toBeNull();
      },
    );
  });

  it("connects to returns array of established connections", () => {
    withBaseConfigs(
      {
        development: sqliteDb("primary"),
        development_readonly: sqliteDb("readonly"),
      },
      () => {
        const result = Base.connectsTo({
          database: { writing: "development", reading: "development_readonly" },
        });
        expect(result).toEqual([
          Base.connectionHandler.retrieveConnectionPool("Base"),
          Base.connectionHandler.retrieveConnectionPool("Base", { role: "reading" }),
        ]);
      },
    );
  });

  it("connection pool list", () => {
    expect(handler.connectionPoolList("writing")).toEqual([rwPool]);
    expect(handler.connectionPoolList("reading")).toEqual([roPool]);
    expect(handler.connectionPoolList()).toEqual([rwPool, roPool]);
  });

  it("retrieve connection pool", () => {
    expect(handler.retrieveConnectionPool(connectionName)).not.toBeNull();
    expect(handler.retrieveConnectionPool(connectionName, { role: "reading" })).not.toBeNull();
  });

  it("retrieve connection pool with invalid id", () => {
    expect(handler.retrieveConnectionPool("foo")).toBeUndefined();
    expect(handler.retrieveConnectionPool("foo", { role: "reading" })).toBeUndefined();
  });

  it("calling connected to on a non existent handler raises", () => {
    expect(() => {
      Base.connectedTo({ role: "non_existent" }, () => {
        Base.connectionPool();
      });
    }).toThrow(/No database connection/);
  });

  it("default handlers are writing and reading", () => {
    expect(Base.writingRole).toBe("writing");
    expect(Base.readingRole).toBe("reading");
  });

  it("an application can change the default handlers", () => {
    const oldWriting = Base.writingRole;
    const oldReading = Base.readingRole;
    try {
      Base.writingRole = "default";
      Base.readingRole = "readonly";
      expect(Base.writingRole).toBe("default");
      expect(Base.readingRole).toBe("readonly");
    } finally {
      Base.writingRole = oldWriting;
      Base.readingRole = oldReading;
    }
  });
});
