import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { Base } from "../base.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { type RawConfigurations } from "../database-configurations.js";
import { currentRole, connectedToStack } from "../core.js";
import { ConnectionNotDefined } from "../errors.js";
import { ArgumentError } from "@blazetrails/ruby-compat";

async function withBaseConfigs(
  raw: RawConfigurations,
  fn: () => void | Promise<void>,
  opts: { defaultEnv?: string } = {},
): Promise<void> {
  const prevConfigs = Base.configurations();
  if (opts.defaultEnv) {
    vi.stubEnv("TRAILS_ENV", opts.defaultEnv);
  }
  Base.configurations(raw);
  try {
    await fn();
  } finally {
    Base.configurations(prevConfigs);
    if (opts.defaultEnv) vi.unstubAllEnvs();
    await Base.connectionHandler.clearAllConnectionsBang();
  }
}

let dbDir: string;

const dbPath = (basename: string) => path.join(dbDir, basename);

describe("ConnectionHandlersShardingDbTest", () => {
  let baselinePools: Set<unknown>;

  afterAll(async () => {
    await Base.connectionHandler.removeConnectionPool("ActiveRecord::Base");
  });

  beforeEach(async () => {
    dbDir = await mkdtemp(path.join(os.tmpdir(), "trails-sharding-db-"));
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "Base", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "ActiveRecord::Base" },
    );
    baselinePools = new Set(Base.connectionHandler.connectionPoolList("all"));
  });

  afterEach(async () => {
    await Base.connectionHandler.clearAllConnectionsBang();
    for (const pool of Base.connectionHandler.connectionPoolList("all")) {
      if (baselinePools.has(pool)) continue;
      await Base.connectionHandler.removeConnectionPool(String(pool.connectionDescriptor.name), {
        role: pool.role,
        shard: pool.shard,
      });
    }
    await rm(dbDir, { recursive: true, force: true });
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
        await Base.connectsTo({
          shards: { default: { writing: ":primary" } },
        });

        await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
          await Base.establishConnection({ adapter: "sqlite3", database: primary });
          const conn = await Base.leaseConnection();
          await conn.execute(
            `CREATE TABLE IF NOT EXISTS "people" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)`,
          );
          await expect(conn.execute(`SELECT * FROM "people" LIMIT 1`)).resolves.not.toThrow();
          await conn.execute(`DROP TABLE IF EXISTS "people"`);

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
        await Base.connectsTo({
          shards: {
            default: { writing: ":primary", reading: ":primary" },
            shard_one: { writing: ":primary_shard_one", reading: ":primary_shard_one" },
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
        await Base.connectsTo({
          shards: {
            default: { writing: ":primary", reading: ":primary_replica" },
            shard_one: { writing: ":primary_shard_one", reading: ":primary_shard_one_replica" },
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
        await Base.connectsTo({
          shards: {
            default: { writing: ":primary", reading: ":primary_replica" },
            shard_one: { writing: ":primary_shard_one", reading: ":primary_shard_one_replica" },
          },
        });

        await Base.connectedTo({ role: "reading", shard: "default" }, async () => {
          expect(currentRole.call(Base as any)).toBe("reading");
          expect(Base.isConnectedTo({ role: "reading", shard: "default" })).toBeTruthy();
          expect(Base.isConnectedTo({ role: "writing", shard: "default" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "writing", shard: "shard_one" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "reading", shard: "shard_one" })).toBeFalsy();
          expect((await Base.leaseConnection()).isPreventingWrites()).toBeTruthy();
        });

        await Base.connectedTo({ role: "writing", shard: "default" }, async () => {
          expect(currentRole.call(Base as any)).toBe("writing");
          expect(Base.isConnectedTo({ role: "writing", shard: "default" })).toBeTruthy();
          expect(Base.isConnectedTo({ role: "reading", shard: "default" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "reading", shard: "shard_one" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "writing", shard: "shard_one" })).toBeFalsy();
          expect((await Base.leaseConnection()).isPreventingWrites()).toBeFalsy();
        });

        await Base.connectedTo({ role: "reading", shard: "shard_one" }, async () => {
          expect(currentRole.call(Base as any)).toBe("reading");
          expect(Base.isConnectedTo({ role: "reading", shard: "shard_one" })).toBeTruthy();
          expect(Base.isConnectedTo({ role: "writing", shard: "shard_one" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "writing", shard: "default" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "reading", shard: "default" })).toBeFalsy();
          expect((await Base.leaseConnection()).isPreventingWrites()).toBeTruthy();
        });

        await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
          expect(currentRole.call(Base as any)).toBe("writing");
          expect(Base.isConnectedTo({ role: "writing", shard: "shard_one" })).toBeTruthy();
          expect(Base.isConnectedTo({ role: "reading", shard: "shard_one" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "reading", shard: "default" })).toBeFalsy();
          expect(Base.isConnectedTo({ role: "writing", shard: "default" })).toBeFalsy();
          expect((await Base.leaseConnection()).isPreventingWrites()).toBeFalsy();
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
        await Base.connectsTo({
          shards: {
            default: { writing: ":primary", reading: ":primary_replica" },
            shard_one: { writing: ":primary_shard_one", reading: ":primary_shard_one_replica" },
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
    let error: any;
    expect(() => {
      try {
        Base.connectedTo({} as any, () => {});
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(error.message).toEqual("must provide a `shard` and/or `role`.");
  });

  it("connects to raises with a shard and database key", async () => {
    let error: any;
    await expect(
      Base.connectsTo({
        database: { writing: ":arunit" },
        shards: { shard_one: { writing: ":arunit" } },
      } as any).catch((e) => {
        error = e;
        throw e;
      }),
    ).rejects.toThrow(ArgumentError);
    expect(error.message).toEqual(
      "`connects_to` can only accept a `database` or `shards` argument, but not both arguments.",
    );
  });

  it("retrieve connection pool with invalid shard", async () => {
    expect(Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base")).not.toBeUndefined();
    expect(
      Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", { shard: "foo" }),
    ).toBeUndefined();
  });

  it("calling connected to on a non existent shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: dbPath("arunit.sqlite3") } } },
      async () => {
        await Base.connectsTo({ shards: { default: { writing: ":arunit", reading: ":arunit" } } });
        let error: any;
        await expect(
          Base.connectedTo({ role: "reading", shard: "foo" }, async () => {
            Base.connectionPool();
          }).catch((e) => {
            error = e;
            throw e;
          }),
        ).rejects.toThrow(ConnectionNotDefined);
        expect(error.message).toEqual(
          "No database connection defined for 'foo' shard and 'reading' role.",
        );
        expect(error.connectionName).toEqual("ActiveRecord::Base");
        expect(error.shard).toEqual("foo");
        expect(error.role).toEqual("reading");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("calling connected to on a non existent role for shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: dbPath("arunit.sqlite3") } } },
      async () => {
        await Base.connectsTo({
          shards: {
            default: { writing: ":arunit", reading: ":arunit" },
            shard_one: { writing: ":arunit", reading: ":arunit" },
          },
        });
        let error: any;
        await expect(
          Base.connectedTo({ role: "non_existent", shard: "shard_one" }, async () => {
            Base.connectionPool();
          }).catch((e) => {
            error = e;
            throw e;
          }),
        ).rejects.toThrow(ConnectionNotDefined);
        expect(error.message).toEqual(
          "No database connection defined for 'shard_one' shard and 'non_existent' role.",
        );
        expect(error.connectionName).toEqual("ActiveRecord::Base");
        expect(error.shard).toEqual("shard_one");
        expect(error.role).toEqual("non_existent");
      },
      { defaultEnv: "default_env" },
    );
  });
  it("calling connected to on a default role for non existent shard raises", async () => {
    await withBaseConfigs(
      { default_env: { arunit: { adapter: "sqlite3", database: dbPath("arunit.sqlite3") } } },
      async () => {
        await Base.connectsTo({ shards: { default: { writing: ":arunit", reading: ":arunit" } } });
        let error: any;
        await expect(
          Base.connectedTo({ shard: "foo" }, async () => {
            Base.connectionPool();
          }).catch((e) => {
            error = e;
            throw e;
          }),
        ).rejects.toThrow(ConnectionNotDefined);
        expect(error.message).toEqual("No database connection defined for 'foo' shard.");
        expect(error.connectionName).toEqual("ActiveRecord::Base");
        expect(error.shard).toEqual("foo");
        expect(error.role).toEqual("writing");
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
      async () => {
        await Base.connectsTo({
          shards: {
            default: { writing: ":primary" },
            shard_one: { writing: ":primary_shard_one" },
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
      async () => {
        await Base.connectsTo({
          shards: { default: { writing: ":primary", reading: ":primary_replica" } },
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
      await SecondaryBase.connectsTo({
        shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
      await SomeOtherBase.connectsTo({
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
      await ShardedAbstractBase.connectsTo({
        shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
    } finally {
      await Base.connectionHandler.clearAllConnectionsBang();
    }
    expect(ShardedAbstractBase.defaultShard()).toBe("not_default");

    ShardedAbstractBase.connectingTo({ role: "writing" });
    try {
      expect(ShardedAbstractBase.isConnectedTo({ role: "writing", shard: "not_default" })).toBe(
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
      await SecondaryBase.connectsTo({
        shards: { one: { writing: { database: ":memory:", adapter: "sqlite3" } } },
      });
      await SomeOtherBase.connectsTo({
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
      await SecondaryBase.connectsTo({
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
        expect(await (ShardConnectionTestModel as any).findByShardKey("foo")).toBeTruthy();
      });

      await Base.connectedTo({ role: "writing", shard: "one" }, async () => {
        expect(await (ShardConnectionTestModel as any).findByShardKey("foo")).toBeFalsy();
        await ShardConnectionTestModel.createBang({ shard_key: "bar" });
      });

      expect(await (ShardConnectionTestModel as any).findByShardKey("bar")).toBeFalsy();
      expect(await (ShardConnectionTestModel as any).findByShardKey("foo")).toBeTruthy();
    } finally {
      await Base.connectionHandler.clearAllConnectionsBang();
    }
  });
});
