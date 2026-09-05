import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { Base } from "../base.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations, type RawConfigurations } from "../database-configurations.js";
import { currentRole, connectedToStack } from "../core.js";

async function withBaseConfigs(
  raw: RawConfigurations,
  fn: () => void | Promise<void>,
  opts: { defaultEnv?: string } = {},
): Promise<void> {
  const prevConfigs = Base.configurations();
  const prevDefaultEnv = DatabaseConfigurations.defaultEnv;
  if (opts.defaultEnv) {
    DatabaseConfigurations.defaultEnv = opts.defaultEnv;
    vi.stubEnv("TRAILS_ENV", opts.defaultEnv);
  }
  Base.configurations(raw);
  try {
    await fn();
  } finally {
    Base.configurations(prevConfigs);
    DatabaseConfigurations.defaultEnv = prevDefaultEnv;
    if (opts.defaultEnv) vi.unstubAllEnvs();
    await Base.connectionHandler.clearAllConnectionsBang();
  }
}

let dbDir: string;

const dbPath = (basename: string) => path.join(dbDir, basename);

describe("ConnectionHandlersShardingDbTest", () => {
  let baselinePools: Set<unknown>;

  beforeEach(async () => {
    dbDir = await mkdtemp(path.join(os.tmpdir(), "trails-sharding-db-"));
    baselinePools = new Set(Base.connectionHandler.connectionPoolList("all"));
  });

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
    for (const pool of Base.connectionHandler.connectionPoolList("all")) {
      if (baselinePools.has(pool)) continue;
      Base.connectionHandler.removeConnectionPool(String(pool.connectionDescriptor.name), {
        role: pool.role,
        shard: pool.shard,
      });
    }
    await rm(dbDir, { recursive: true, force: true });
    (Base as any)._shardKeys = undefined;
    (Base as any)._defaultShard = undefined;
    (Base as any).connectionClass = undefined;
  });

  it("establishing a connection in connected to block uses current role and shard", async () => {
    const primary = dbPath("primary.sqlite3");
    await withBaseConfigs(
      {
        default_env: { primary: { adapter: "sqlite3", database: primary } },
      },
      async () => {
        const pools = Base.connectsTo({
          shards: { default: { writing: "primary" } },
        });
        await Promise.all(pools.map((p) => p.adapterReady));

        await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
          await Base.establishConnection({ adapter: "sqlite3", database: primary });
          const conn = await Base.leaseConnection();
          await conn.executeMutation(
            `CREATE TABLE IF NOT EXISTS "people" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)`,
          );
          const rows = await conn.execute(`SELECT * FROM "people" LIMIT 1`);
          expect(Array.isArray(rows)).toBe(true);
          await conn.executeMutation(`DROP TABLE IF EXISTS "people"`);

          const pm = (Base.connectionHandler as any).getPoolManager("ActiveRecord::Base");
          expect([...pm.shardNames].sort()).toEqual(["default", "shard_one"]);
        });
      },
      { defaultEnv: "default_env" },
    );
  });
  it("establish connection using 3 levels config", async () => {
    const primary = dbPath("primary.sqlite3");
    const primaryShardOne = dbPath("primary_shard_one.sqlite3");
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: primary },
          primary_shard_one: { adapter: "sqlite3", database: primaryShardOne },
        },
      },
      async () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one" },
          },
        });

        const basePool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base");
        const defaultPool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
          shard: "default",
        });

        expect(
          (Base.connectionHandler as any).getPoolManager("ActiveRecord::Base")!.shardNames,
        ).toEqual(["default", "shard_one"]);
        expect(basePool).toBe(defaultPool);
        expect(defaultPool!.dbConfig.database).toBe(primary);
        expect(defaultPool!.dbConfig.name).toBe("primary");

        const shardOnePool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
          shard: "shard_one",
        });
        expect(shardOnePool).not.toBeUndefined();
        expect(shardOnePool!.dbConfig.database).toBe(primaryShardOne);
        expect(shardOnePool!.dbConfig.name).toBe("primary_shard_one");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("establish connection using 3 levels config with shards and replica", async () => {
    const primary = dbPath("primary.sqlite3");
    const primaryShardOne = dbPath("primary_shard_one.sqlite3");
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: primary },
          primary_replica: { adapter: "sqlite3", database: primary, replica: true },
          primary_shard_one: { adapter: "sqlite3", database: primaryShardOne },
          primary_shard_one_replica: {
            adapter: "sqlite3",
            database: primaryShardOne,
            replica: true,
          },
        },
      },
      async () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary_replica" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
          },
        });

        const defaultWritingPool = Base.connectionHandler.retrieveConnectionPool(
          "ActiveRecord::Base",
          {
            shard: "default",
          },
        );
        const baseWritingPool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base");
        expect(baseWritingPool).toBe(defaultWritingPool);
        expect(defaultWritingPool!.dbConfig.database).toBe(primary);
        expect(defaultWritingPool!.dbConfig.name).toBe("primary");

        const defaultReadingPool = Base.connectionHandler.retrieveConnectionPool(
          "ActiveRecord::Base",
          {
            role: "reading",
            shard: "default",
          },
        );
        const baseReadingPool = Base.connectionHandler.retrieveConnectionPool(
          "ActiveRecord::Base",
          {
            role: "reading",
          },
        );
        expect(baseReadingPool).toBe(defaultReadingPool);
        expect(defaultReadingPool!.dbConfig.database).toBe(primary);
        expect(defaultReadingPool!.dbConfig.name).toBe("primary_replica");

        const shardOneWritingPool = Base.connectionHandler.retrieveConnectionPool(
          "ActiveRecord::Base",
          {
            shard: "shard_one",
          },
        );
        expect(shardOneWritingPool).not.toBeUndefined();
        expect(shardOneWritingPool!.dbConfig.database).toBe(primaryShardOne);
        expect(shardOneWritingPool!.dbConfig.name).toBe("primary_shard_one");

        const shardOneReadingPool = Base.connectionHandler.retrieveConnectionPool(
          "ActiveRecord::Base",
          {
            role: "reading",
            shard: "shard_one",
          },
        );
        expect(shardOneReadingPool).not.toBeUndefined();
        expect(shardOneReadingPool!.dbConfig.database).toBe(primaryShardOne);
        expect(shardOneReadingPool!.dbConfig.name).toBe("primary_shard_one_replica");
      },
      { defaultEnv: "default_env" },
    );
  });

  it("switching connections via handler", async () => {
    const primary = dbPath("primary.sqlite3");
    const primaryShardOne = dbPath("primary_shard_one.sqlite3");
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: primary },
          primary_replica: { adapter: "sqlite3", database: primary, replica: true },
          primary_shard_one: { adapter: "sqlite3", database: primaryShardOne },
          primary_shard_one_replica: {
            adapter: "sqlite3",
            database: primaryShardOne,
            replica: true,
          },
        },
      },
      async () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary_replica" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
          },
        });

        await Base.connectedTo({ role: "reading", shard: "default" }, async () => {
          expect(currentRole.call(Base as any)).toBe("reading");
          expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(true);
          expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(false);
          expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(false);
          expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(false);
          expect((await Base.leaseConnection()).isPreventingWrites()).toBe(true);
        });

        await Base.connectedTo({ role: "writing", shard: "default" }, async () => {
          expect(currentRole.call(Base as any)).toBe("writing");
          expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(true);
          expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(false);
          expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(false);
          expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(false);
          expect((await Base.leaseConnection()).isPreventingWrites()).toBe(false);
        });

        await Base.connectedTo({ role: "reading", shard: "shard_one" }, async () => {
          expect(currentRole.call(Base as any)).toBe("reading");
          expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(true);
          expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(false);
          expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(false);
          expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(false);
          expect((await Base.leaseConnection()).isPreventingWrites()).toBe(true);
        });

        await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
          expect(currentRole.call(Base as any)).toBe("writing");
          expect(Base.connectedToQ({ role: "writing", shard: "shard_one" })).toBe(true);
          expect(Base.connectedToQ({ role: "reading", shard: "shard_one" })).toBe(false);
          expect(Base.connectedToQ({ role: "reading", shard: "default" })).toBe(false);
          expect(Base.connectedToQ({ role: "writing", shard: "default" })).toBe(false);
          expect((await Base.leaseConnection()).isPreventingWrites()).toBe(false);
        });
      },
      { defaultEnv: "default_env" },
    );
  });

  it("retrieves proper connection with nested connected to", async () => {
    const primary = dbPath("primary.sqlite3");
    const primaryShardOne = dbPath("primary_shard_one.sqlite3");
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: primary },
          primary_replica: { adapter: "sqlite3", database: primary, replica: true },
          primary_shard_one: { adapter: "sqlite3", database: primaryShardOne },
          primary_shard_one_replica: {
            adapter: "sqlite3",
            database: primaryShardOne,
            replica: true,
          },
        },
      },
      async () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary", reading: "primary_replica" },
            shard_one: { writing: "primary_shard_one", reading: "primary_shard_one_replica" },
          },
        });

        await Base.connectedTo({ role: "reading", shard: "shard_one" }, async () => {
          expect(Base.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");

          await Base.connectedTo({ role: "writing" }, async () => {
            expect(Base.connectionPool().dbConfig.name).toBe("primary_shard_one");
          });

          await Base.connectedTo({ role: "reading", shard: "default" }, async () => {
            expect(Base.connectionPool().dbConfig.name).toBe("primary_replica");
          });

          expect(Base.connectionPool().dbConfig.name).toBe("primary_shard_one_replica");
        });
      },
      { defaultEnv: "default_env" },
    );
  });

  it("connected to raises without a shard or role", async () => {
    expect(() => Base.connectedTo({} as any, () => {})).toThrow(
      /must provide a `shard` and\/or `role`/,
    );
  });

  it("connects to raises with a shard and database key", async () => {
    expect(() =>
      Base.connectsTo({
        database: { writing: "arunit" },
        shards: { s: { writing: "arunit" } },
      } as any),
    ).toThrow(/can only accept a `database` or `shards` argument/);
  });

  it("retrieve connection pool with invalid shard", async () => {
    Base.connectionHandler.establishConnection(
      new HashConfig("test", "Base", { adapter: "sqlite3", database: dbPath("arunit.sqlite3") }),
      { ownerName: "ActiveRecord::Base" },
    );
    expect(Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base")).not.toBeUndefined();
    expect(
      Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", { shard: "foo" }),
    ).toBeUndefined();
  });

  it("calling connected to on a non existent shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: dbPath("arunit.sqlite3") } } },
      async () => {
        Base.connectsTo({ shards: { default: { writing: "arunit", reading: "arunit" } } });
        let error: any;
        try {
          await Base.connectedTo({ role: "reading", shard: "foo" }, async () => {
            Base.connectionPool();
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toBe(
          "No database connection defined for 'foo' shard and 'reading' role.",
        );
        expect(error.connectionName).toBe("ActiveRecord::Base");
        expect(error.shard).toBe("foo");
        expect(error.role).toBe("reading");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("calling connected to on a non existent role for shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: dbPath("arunit.sqlite3") } } },
      async () => {
        Base.connectsTo({
          shards: {
            default: { writing: "arunit", reading: "arunit" },
            shard_one: { writing: "arunit", reading: "arunit" },
          },
        });
        let error: any;
        try {
          await Base.connectedTo({ role: "non_existent", shard: "shard_one" }, async () => {
            Base.connectionPool();
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toBe(
          "No database connection defined for 'shard_one' shard and 'non_existent' role.",
        );
        expect(error.connectionName).toBe("ActiveRecord::Base");
        expect(error.shard).toBe("shard_one");
        expect(error.role).toBe("non_existent");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("calling connected to on a default role for non existent shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: dbPath("arunit.sqlite3") } } },
      async () => {
        Base.connectsTo({ shards: { default: { writing: "arunit", reading: "arunit" } } });
        let error: any;
        try {
          await Base.connectedTo({ shard: "foo" }, async () => {
            Base.connectionPool();
          });
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.message).toBe("No database connection defined for 'foo' shard.");
        expect(error.connectionName).toBe("ActiveRecord::Base");
        expect(error.shard).toBe("foo");
        expect(error.role).toBe("writing");
      },
      { defaultEnv: "default_env" },
    );
  });

  it("cannot swap shards while prohibited", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: dbPath("primary.sqlite3") },
          primary_shard_one: { adapter: "sqlite3", database: dbPath("primary_shard_one.sqlite3") },
        },
      },
      () => {
        Base.connectsTo({
          shards: {
            default: { writing: "primary" },
            shard_one: { writing: "primary_shard_one" },
          },
        });

        expect(() => {
          Base.prohibitShardSwapping(() => {
            Base.connectedTo({ role: "reading", shard: "default" }, () => {});
          });
        }).toThrow(/cannot swap `shard` while shard swapping is prohibited/);
      },
      { defaultEnv: "default_env" },
    );
  });

  it("can swap roles while shard swapping is prohibited", async () => {
    const primary = dbPath("primary.sqlite3");
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: primary },
          primary_replica: { adapter: "sqlite3", database: primary, replica: true },
        },
      },
      () => {
        Base.connectsTo({
          shards: { default: { writing: "primary", reading: "primary_replica" } },
        });

        expect(() => {
          Base.prohibitShardSwapping(() => {
            Base.connectedTo({ role: "reading" }, () => {});
          });
        }).not.toThrow();
      },
      { defaultEnv: "default_env" },
    );
  });

  it("default shard is chosen by first key or default", async () => {
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
      await Base.connectionHandler.clearAllConnectionsBang();
    }
  });

  it("connectingTo uses the class defaultShard when shard is omitted", async () => {
    class ShardedAbstractBase extends Base {
      static override abstractClass = true;
    }
    try {
      ShardedAbstractBase.connectsTo({
        shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
    } finally {
      await Base.connectionHandler.clearAllConnectionsBang();
    }
    expect(ShardedAbstractBase.defaultShard()).toBe("not_default");

    ShardedAbstractBase.connectingTo({ role: "writing" });
    try {
      expect(ShardedAbstractBase.connectedToQ({ role: "writing", shard: "not_default" })).toBe(
        true,
      );
    } finally {
      connectedToStack().pop();
    }
  });

  it("same shards across clusters", async () => {
    class SecondaryBase extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class ShardConnectionTestModel extends SecondaryBase {
      declare shard_key: string;
    }

    class SomeOtherBase extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class ShardConnectionTestModelB extends SomeOtherBase {
      declare shard_key: string;
    }

    try {
      SecondaryBase.connectsTo({
        shards: { one: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
      SomeOtherBase.connectsTo({
        shards: { one: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });

      await Base.connectedTo({ role: "writing", shard: "one" }, async () => {
        await (
          await ShardConnectionTestModel.leaseConnection()
        )
          // eslint-disable-next-line blazetrails/require-table-teardown -- per-shard :memory: database, discarded by clearAllConnectionsBang() in the finally
          .execute(`CREATE TABLE "shard_connection_test_models" (shard_key VARCHAR (255))`);
        await ShardConnectionTestModel.loadSchema();
        await ShardConnectionTestModel.createBang({ shard_key: "test_model_default" });

        await (
          await ShardConnectionTestModelB.leaseConnection()
        )
          // eslint-disable-next-line blazetrails/require-table-teardown -- per-shard :memory: database, discarded by clearAllConnectionsBang() in the finally
          .execute(`CREATE TABLE "shard_connection_test_model_bs" (shard_key VARCHAR (255))`);
        await ShardConnectionTestModelB.loadSchema();
        await ShardConnectionTestModelB.createBang({ shard_key: "test_model_b_default" });

        expect(
          (await ShardConnectionTestModel.where({ shard_key: "test_model_default" }).first())
            ?.shard_key,
        ).toEqual("test_model_default");
        expect(
          (await ShardConnectionTestModelB.where({ shard_key: "test_model_b_default" }).first())
            ?.shard_key,
        ).toEqual("test_model_b_default");
      });
    } finally {
      await Base.connectionHandler.clearAllConnectionsBang();
    }
  });

  it("sharding separation", async () => {
    class SecondaryBase extends Base {
      static {
        this.abstractClass = true;
      }
    }
    class ShardConnectionTestModel extends SecondaryBase {
      declare shard_key: string;
    }

    try {
      SecondaryBase.connectsTo({
        shards: {
          default: { writing: { database: ":memory:", adapter: "sqlite3" } },
          one: { writing: { database: ":memory:", adapter: "sqlite3" } },
        },
      });

      for (const shardName of ["default", "one"]) {
        await Base.connectedTo({ role: "writing", shard: shardName }, async () => {
          await (
            await ShardConnectionTestModel.leaseConnection()
          )
            // eslint-disable-next-line blazetrails/require-table-teardown -- per-shard :memory: database, discarded by clearAllConnectionsBang() in the finally
            .execute(`CREATE TABLE "shard_connection_test_models" (shard_key VARCHAR (255))`);
        });
      }

      await ShardConnectionTestModel.loadSchema();
      await ShardConnectionTestModel.createBang({ shard_key: "foo" });

      await Base.connectedTo({ role: "writing", shard: "default" }, async () => {
        expect(await ShardConnectionTestModel.findBy({ shard_key: "foo" })).toBeTruthy();
      });

      await Base.connectedTo({ role: "writing", shard: "one" }, async () => {
        expect(await ShardConnectionTestModel.findBy({ shard_key: "foo" })).toBeFalsy();
        await ShardConnectionTestModel.createBang({ shard_key: "bar" });
      });

      expect(await ShardConnectionTestModel.findBy({ shard_key: "bar" })).toBeFalsy();
      expect(await ShardConnectionTestModel.findBy({ shard_key: "foo" })).toBeTruthy();
    } finally {
      await Base.connectionHandler.clearAllConnectionsBang();
    }
  });
});
