import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Base } from "../base.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { currentRole, connectedToStack } from "../core.js";

async function withBaseConfigs(
  raw: Record<string, unknown>,
  fn: () => void | Promise<void>,
  opts: { defaultEnv?: string } = {},
): Promise<void> {
  const prevConfigs = (Base as any).configurations;
  const prevDefaultEnv = DatabaseConfigurations.defaultEnv;
  const prevCurrent = (DatabaseConfigurations as any).current;
  if (opts.defaultEnv) DatabaseConfigurations.defaultEnv = opts.defaultEnv;
  (Base as any).configurations = raw;
  try {
    await fn();
  } finally {
    (Base as any).configurations = prevConfigs;
    DatabaseConfigurations.defaultEnv = prevDefaultEnv;
    (DatabaseConfigurations as any).current = prevCurrent;
    Base.connectionHandler.clearAllConnectionsBang();
  }
}

describe("ConnectionHandlersShardingDbTest", () => {
  afterEach(() => {
    Base.connectionHandler.clearAllConnectionsBang();
    (Base as any)._shardKeys = undefined;
    (Base as any)._defaultShard = undefined;
    (Base as any).connectionClass = undefined;
  });

  it("establishing a connection in connected to block uses current role and shard", async () => {
    const tmpfile = path.join(os.tmpdir(), `trails-connectsto-${randomUUID()}.sqlite3`);
    try {
      await withBaseConfigs(
        {
          default_env: { primary: { adapter: "sqlite3", database: tmpfile } },
        },
        async () => {
          const pools = Base.connectsTo({
            shards: { default: { writing: "primary" } },
          });
          await Promise.all(pools.map((p) => p.adapterReady));

          await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
            await Base.establishConnection({ adapter: "sqlite3", database: tmpfile });
            const conn = Base.leaseConnection();
            await conn.executeMutation(
              `CREATE TABLE IF NOT EXISTS "people" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)`,
            );
            const rows = await conn.execute(`SELECT * FROM "people" LIMIT 1`);
            expect(Array.isArray(rows)).toBe(true);

            const pm = (Base.connectionHandler as any).getPoolManager("Base");
            expect([...pm.shardNames].sort()).toEqual(["default", "shard_one"]);
          });
        },
        { defaultEnv: "default_env" },
      );
    } finally {
      if (fs.existsSync(tmpfile)) fs.unlinkSync(tmpfile);
    }
  });
  it("establish connection using 3 levels config", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: ":memory:" },
          primary_shard_one: { adapter: "sqlite3", database: ":memory:" },
        },
      },
      () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one" },
          },
        });

        const basePool = Base.connectionHandler.retrieveConnectionPool("Base");
        const defaultPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          shard: "default",
        });

        expect((Base.connectionHandler as any).getPoolManager("Base")!.shardNames).toEqual([
          "default",
          "shard_one",
        ]);
        expect(basePool).toBe(defaultPool);
        expect(defaultPool!.dbConfig.name).toBe("primary");

        const shardOnePool = Base.connectionHandler.retrieveConnectionPool("Base", {
          shard: "shard_one",
        });
        expect(shardOnePool).not.toBeUndefined();
        expect(shardOnePool!.dbConfig.name).toBe("primary_shard_one");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("establish connection using 3 levels config with shards and replica", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: ":memory:" },
          primary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
          primary_shard_one: { adapter: "sqlite3", database: ":memory:" },
          primary_shard_one_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        },
      },
      () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary_replica" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
          },
        });

        const defaultWritingPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          shard: "default",
        });
        const baseWritingPool = Base.connectionHandler.retrieveConnectionPool("Base");
        expect(baseWritingPool).toBe(defaultWritingPool);
        expect(defaultWritingPool!.dbConfig.name).toBe("primary");

        const defaultReadingPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          role: "reading",
          shard: "default",
        });
        const baseReadingPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          role: "reading",
        });
        expect(baseReadingPool).toBe(defaultReadingPool);
        expect(defaultReadingPool!.dbConfig.name).toBe("primary_replica");

        const shardOneWritingPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          shard: "shard_one",
        });
        expect(shardOneWritingPool).not.toBeUndefined();
        expect(shardOneWritingPool!.dbConfig.name).toBe("primary_shard_one");

        const shardOneReadingPool = Base.connectionHandler.retrieveConnectionPool("Base", {
          role: "reading",
          shard: "shard_one",
        });
        expect(shardOneReadingPool).not.toBeUndefined();
        expect(shardOneReadingPool!.dbConfig.name).toBe("primary_shard_one_replica");
      },
      { defaultEnv: "default_env" },
    );
  });

  it("switching connections via handler", () => {
    const makePool = (name: string, role: string, shard: string, replica = false) =>
      Base.connectionHandler.establishConnection(
        new HashConfig("test", name, {
          adapter: "sqlite3",
          database: ":memory:",
          ...(replica ? { replica: true } : {}),
        }),
        { owner: "Base", role, shard, adapterFactory: () => new SQLite3Adapter() },
      );

    try {
      makePool("primary", "writing", "default");
      makePool("primary_replica", "reading", "default", true);
      makePool("primary_shard_one", "writing", "shard_one");
      makePool("primary_shard_one_replica", "reading", "shard_one", true);
      (Base as any)._shardKeys = ["default", "shard_one"];

      Base.connectedTo({ role: "reading", shard: "default" }, () => {
        expect(currentRole.call(Base as any)).toBe("reading");
        expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(true);
        expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(false);
        expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(false);
        expect(Base.leaseConnection().isPreventingWrites()).toBe(true);
      });

      Base.connectedTo({ role: "writing", shard: "default" }, () => {
        expect(currentRole.call(Base as any)).toBe("writing");
        expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(true);
        expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(false);
        expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(false);
        expect(Base.leaseConnection().isPreventingWrites()).toBe(false);
      });

      Base.connectedTo({ role: "reading", shard: "shard_one" }, () => {
        expect(currentRole.call(Base as any)).toBe("reading");
        expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(true);
        expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(false);
        expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(false);
        expect(Base.leaseConnection().isPreventingWrites()).toBe(true);
      });

      Base.connectedTo({ role: "writing", shard: "shard_one" }, () => {
        expect(currentRole.call(Base as any)).toBe("writing");
        expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(true);
        expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(false);
        expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(false);
        expect(Base.leaseConnection().isPreventingWrites()).toBe(false);
      });
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
      (Base as any)._shardKeys = undefined;
    }
  });

  it("retrieves proper connection with nested connected to", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: ":memory:" },
          primary_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
          primary_shard_one: { adapter: "sqlite3", database: ":memory:" },
          primary_shard_one_replica: { adapter: "sqlite3", database: ":memory:", replica: true },
        },
      },
      () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary_replica" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
          },
        });

        Base.connectedTo({ role: "reading", shard: "shard_one" }, () => {
          expect(Base.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");

          Base.connectedTo({ role: "writing" }, () => {
            expect(Base.connectionPool().dbConfig.name).toBe("primary_shard_one");
          });

          Base.connectedTo({ role: "reading", shard: "default" }, () => {
            expect(Base.connectionPool().dbConfig.name).toBe("primary_replica");
          });

          expect(Base.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
        });
      },
      { defaultEnv: "default_env" },
    );
  });

  it("connected to raises without a shard or role", () => {
    expect(() => Base.connectedTo({} as any, () => {})).toThrow(
      /must provide a `shard` and\/or `role`/,
    );
  });

  it("connects to raises with a shard and database key", () => {
    expect(() =>
      Base.connectsTo({
        database: { writing: "arunit" },
        shards: { s: { writing: "arunit" } },
      } as any),
    ).toThrow(/can only accept a `database` or `shards` argument/);
  });

  it("retrieve connection pool with invalid shard", () => {
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "Base", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "Base" },
    );
    expect(Base.connectionHandler.retrieveConnectionPool("Base")).not.toBeUndefined();
    expect(Base.connectionHandler.retrieveConnectionPool("Base", { shard: "foo" })).toBeUndefined();
  });

  it("calling connected to on a non existent shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: ":memory:" } } },
      () => {
        Base.connectsTo({ shards: { default: { writing: "arunit", reading: "arunit" } } });
        let error: any;
        try {
          Base.connectedTo({ role: "reading", shard: "foo" }, () => {
            Base.connectionPool();
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toBe(
          "No database connection defined for 'foo' shard and 'reading' role.",
        );
        expect(error.connectionName).toBe("Base");
        expect(error.shard).toBe("foo");
        expect(error.role).toBe("reading");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("calling connected to on a non existent role for shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: ":memory:" } } },
      () => {
        Base.connectsTo({
          shards: {
            default: { writing: "arunit", reading: "arunit" },
            shard_one: { writing: "arunit", reading: "arunit" },
          },
        });
        let error: any;
        try {
          Base.connectedTo({ role: "non_existent", shard: "shard_one" }, () => {
            Base.connectionPool();
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toBe(
          "No database connection defined for 'shard_one' shard and 'non_existent' role.",
        );
        expect(error.connectionName).toBe("Base");
        expect(error.shard).toBe("shard_one");
        expect(error.role).toBe("non_existent");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("calling connected to on a default role for non existent shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: ":memory:" } } },
      () => {
        Base.connectsTo({ shards: { default: { writing: "arunit", reading: "arunit" } } });
        let error: any;
        try {
          Base.connectedTo({ shard: "foo" }, () => {
            Base.connectionPool();
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toBe("No database connection defined for 'foo' shard.");
        expect(error.connectionName).toBe("Base");
        expect(error.shard).toBe("foo");
        expect(error.role).toBe("writing");
      },
      { defaultEnv: "default_env" },
    );
  });

  it("cannot swap shards while prohibited", () => {
    const makePool = (shard: string) =>
      Base.connectionHandler.establishConnection(
        new HashConfig("test", shard, { adapter: "sqlite3", database: ":memory:" }),
        { owner: "Base", role: "writing", shard },
      );
    try {
      makePool("default");
      makePool("shard_one");
      expect(() => {
        Base.prohibitShardSwapping(() => {
          Base.connectedTo({ role: "reading", shard: "default" }, () => {});
        });
      }).toThrow(/cannot swap `shard` while shard swapping is prohibited/);
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
    }
  });

  it("can swap roles while shard swapping is prohibited", () => {
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "Base", { adapter: "sqlite3", database: ":memory:" }),
      { owner: "Base", role: "reading", shard: "default" },
    );
    expect(() => {
      Base.prohibitShardSwapping(() => {
        Base.connectedTo({ role: "reading" }, () => {});
      });
    }).not.toThrow();
  });

  it("default shard is chosen by first key or default", () => {
    class SecondaryBase extends Base {
      static override abstractClass = true;
    }
    class SomeOtherBase extends Base {
      static override abstractClass = true;
    }
    try {
      SecondaryBase.connectsTo({
        shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
      SomeOtherBase.connectsTo({
        database: { writing: { database: ":memory:", adapter: "sqlite3" } },
      });
      expect(SecondaryBase.defaultShard()).toBe("not_default");
      expect(SomeOtherBase.defaultShard()).toBe("default");
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
    }
  });

  it("connectingTo uses the class defaultShard when shard is omitted", () => {
    class ShardedAbstractBase extends Base {
      static override abstractClass = true;
    }
    try {
      ShardedAbstractBase.connectsTo({
        shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
    }
    expect(ShardedAbstractBase.defaultShard()).toBe("not_default");

    ShardedAbstractBase.connectingTo({ role: "writing" });
    try {
      expect(ShardedAbstractBase.connectedToQ({ role: "writing", shard: "not_default" })).toBe(
        true,
      );
    } finally {
      // pop the stack entry added by connectingTo
      connectedToStack().pop();
    }
  });

  it("same shards across clusters", async () => {
    class SecondaryBase extends Base {
      static override abstractClass = true;
    }
    class ShardConnectionTestModel extends SecondaryBase {}

    class SomeOtherBase extends Base {
      static override abstractClass = true;
    }
    class ShardConnectionTestModelB extends SomeOtherBase {}

    const makePool = (owner: string, shard: string) =>
      Base.connectionHandler.establishConnection(
        new HashConfig("test", owner, { adapter: "sqlite3", database: ":memory:" }),
        { owner, role: "writing", shard, adapterFactory: () => new SQLite3Adapter() },
      );

    try {
      makePool("SecondaryBase", "one");
      makePool("SomeOtherBase", "one");
      (SecondaryBase as any).connectionClass = true;
      (SomeOtherBase as any).connectionClass = true;
      (SecondaryBase as any)._shardKeys = ["one"];
      (SomeOtherBase as any)._shardKeys = ["one"];

      await Base.connectedTo({ role: "writing", shard: "one" }, async () => {
        const connA = ShardConnectionTestModel.leaseConnection();
        await connA.executeMutation(
          `CREATE TABLE "shard_connection_test_models" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "shard_key" TEXT)`,
        );
        await connA.executeMutation(
          `INSERT INTO "shard_connection_test_models" ("shard_key") VALUES ('test_model_default')`,
        );

        const connB = ShardConnectionTestModelB.leaseConnection();
        await connB.executeMutation(
          `CREATE TABLE "shard_connection_test_model_bs" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "shard_key" TEXT)`,
        );
        await connB.executeMutation(
          `INSERT INTO "shard_connection_test_model_bs" ("shard_key") VALUES ('test_model_b_default')`,
        );

        const rowsA = await connA.execute(
          `SELECT shard_key FROM "shard_connection_test_models" WHERE shard_key = 'test_model_default'`,
        );
        expect(rowsA[0]?.shard_key).toBe("test_model_default");

        const rowsB = await connB.execute(
          `SELECT shard_key FROM "shard_connection_test_model_bs" WHERE shard_key = 'test_model_b_default'`,
        );
        expect(rowsB[0]?.shard_key).toBe("test_model_b_default");
      });
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
      (SecondaryBase as any).connectionClass = undefined;
      (SomeOtherBase as any).connectionClass = undefined;
    }
  });

  it("sharding separation", async () => {
    class SecondaryBase extends Base {
      static override abstractClass = true;
    }
    class ShardConnectionTestModel extends SecondaryBase {}

    const makePool = (shard: string) =>
      Base.connectionHandler.establishConnection(
        new HashConfig("test", "SecondaryBase", { adapter: "sqlite3", database: ":memory:" }),
        {
          owner: "SecondaryBase",
          role: "writing",
          shard,
          adapterFactory: () => new SQLite3Adapter(),
        },
      );

    try {
      makePool("default");
      makePool("one");
      (SecondaryBase as any).connectionClass = true;
      (SecondaryBase as any)._shardKeys = ["default", "one"];
      (SecondaryBase as any)._defaultShard = "default";

      for (const shardName of ["default", "one"]) {
        await Base.connectedTo({ role: "writing", shard: shardName }, async () => {
          await ShardConnectionTestModel.leaseConnection().executeMutation(
            `CREATE TABLE "shard_connection_test_models" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "shard_key" TEXT)`,
          );
        });
      }

      // Create a record on :default
      await ShardConnectionTestModel.leaseConnection().executeMutation(
        `INSERT INTO "shard_connection_test_models" ("shard_key") VALUES ('foo')`,
      );

      // Can read it when explicitly connecting to :default
      await Base.connectedTo({ role: "writing", shard: "default" }, async () => {
        const rows = await ShardConnectionTestModel.leaseConnection().execute(
          `SELECT shard_key FROM "shard_connection_test_models" WHERE shard_key = 'foo'`,
        );
        expect(rows.length).toBe(1);
      });

      // Cannot read :default record on :one; add a record on :one
      await Base.connectedTo({ role: "writing", shard: "one" }, async () => {
        const rows = await ShardConnectionTestModel.leaseConnection().execute(
          `SELECT shard_key FROM "shard_connection_test_models" WHERE shard_key = 'foo'`,
        );
        expect(rows.length).toBe(0);

        await ShardConnectionTestModel.leaseConnection().executeMutation(
          `INSERT INTO "shard_connection_test_models" ("shard_key") VALUES ('bar')`,
        );
      });

      // Cannot read 'bar' from :default, but can read 'foo'
      const barRows = await ShardConnectionTestModel.leaseConnection().execute(
        `SELECT shard_key FROM "shard_connection_test_models" WHERE shard_key = 'bar'`,
      );
      expect(barRows.length).toBe(0);

      const fooRows = await ShardConnectionTestModel.leaseConnection().execute(
        `SELECT shard_key FROM "shard_connection_test_models" WHERE shard_key = 'foo'`,
      );
      expect(fooRows.length).toBe(1);
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
      (SecondaryBase as any).connectionClass = undefined;
    }
  });
  // The 3 "swapping shards (and roles) in a multi threaded environment" Rails
  // tests are permanently unported (Ruby GVL / Thread semantics). Tracked in
  // scripts/api-compare/unported-files.ts.
});
