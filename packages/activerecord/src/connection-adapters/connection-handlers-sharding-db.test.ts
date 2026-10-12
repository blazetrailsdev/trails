import { describe, it, expect, afterEach, afterAll } from "vitest";
import { Base } from "../base.js";
import { type RawConfigurations } from "../database-configurations.js";
import { currentRole } from "../core.js";
import { ConnectionNotDefined } from "../errors.js";
import { ArgumentError, setEnv } from "@blazetrails/ruby-compat";
import { fixtures } from "../test-fixtures.js";
import { cleanUpConnectionHandler } from "../cases/helper.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { Person } from "../test-helpers/models/person.js";
import { assertNothingRaised, getEnv } from "@blazetrails/activesupport";

async function withBaseConfigs(config: RawConfigurations, fn: () => Promise<void>): Promise<void> {
  const previousEnv = getEnv("TRAILS_ENV");
  setEnv("TRAILS_ENV", "default_env");
  const prevConfigs = Base.configurations();
  Base.configurations(config);
  try {
    await fn();
  } finally {
    Base.configurations(prevConfigs);
    await Base.establishConnection(":arunit");
    setEnv("TRAILS_ENV", previousEnv);
  }
}

describe("ConnectionHandlersShardingDbTest", () => {
  fixtures(["people"], { useTransactionalTests: false });

  afterEach(() => {
    cleanUpConnectionHandler();
  });

  afterAll(async () => {
    await Base.connectionHandler.removeConnectionPool("ActiveRecord::Base", {
      role: "writing",
      shard: "shard_one",
    });
  });

  it.skipIf(inMemoryDb())(
    "establishing a connection in connected to block uses current role and shard",
    async () => {
      await Base.connectedTo({ role: "writing", shard: "shard_one" }, async () => {
        const dbConfig = Base.configurations().configsFor({ envName: "arunit", name: "primary" });
        await Base.establishConnection(dbConfig);
        await assertNothingRaised(() => Person.first());

        expect(
          [
            ...(Base.connectionHandler as any).getPoolManager("ActiveRecord::Base").shardNames,
          ].sort(),
        ).toEqual(["default", "shard_one"]);
      });
    },
  );
  it.skipIf(inMemoryDb())("establish connection using 3 levels config", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
          primary_shard_one: { adapter: "sqlite3", database: "test/db/primary_shard_one.sqlite3" },
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
        expect(defaultPool!.dbConfig.database).toBe("test/db/primary.sqlite3");
        expect(defaultPool!.dbConfig.name).toBe("primary");

        const shardOnePool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
          shard: "shard_one",
        });
        expect(shardOnePool).not.toBeUndefined();
        expect(shardOnePool!.dbConfig.database).toBe("test/db/primary_shard_one.sqlite3");
        expect(shardOnePool!.dbConfig.name).toBe("primary_shard_one");
      },
    );
  });
  it.skipIf(inMemoryDb())(
    "establish connection using 3 levels config with shards and replica",
    async () => {
      await withBaseConfigs(
        {
          default_env: {
            primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
            primary_replica: {
              adapter: "sqlite3",
              database: "test/db/primary.sqlite3",
              replica: true,
            },
            primary_shard_one: {
              adapter: "sqlite3",
              database: "test/db/primary_shard_one.sqlite3",
            },
            primary_shard_one_replica: {
              adapter: "sqlite3",
              database: "test/db/primary_shard_one.sqlite3",
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
          const baseWritingPool =
            Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base");
          expect(baseWritingPool).toBe(defaultWritingPool);
          expect(defaultWritingPool!.dbConfig.database).toBe("test/db/primary.sqlite3");
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
          expect(defaultReadingPool!.dbConfig.database).toBe("test/db/primary.sqlite3");
          expect(defaultReadingPool!.dbConfig.name).toBe("primary_replica");

          const shardOneWritingPool = Base.connectionHandler.retrieveConnectionPool(
            "ActiveRecord::Base",
            {
              shard: "shard_one",
            },
          );
          expect(shardOneWritingPool).not.toBeUndefined();
          expect(shardOneWritingPool!.dbConfig.database).toBe("test/db/primary_shard_one.sqlite3");
          expect(shardOneWritingPool!.dbConfig.name).toBe("primary_shard_one");

          const shardOneReadingPool = Base.connectionHandler.retrieveConnectionPool(
            "ActiveRecord::Base",
            {
              role: "reading",
              shard: "shard_one",
            },
          );
          expect(shardOneReadingPool).not.toBeUndefined();
          expect(shardOneReadingPool!.dbConfig.database).toBe("test/db/primary_shard_one.sqlite3");
          expect(shardOneReadingPool!.dbConfig.name).toBe("primary_shard_one_replica");
        },
      );
    },
  );

  it.skipIf(inMemoryDb())("switching connections via handler", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
          primary_replica: {
            adapter: "sqlite3",
            database: "test/db/primary.sqlite3",
            replica: true,
          },
          primary_shard_one: { adapter: "sqlite3", database: "test/db/primary_shard_one.sqlite3" },
          primary_shard_one_replica: {
            adapter: "sqlite3",
            database: "test/db/primary_shard_one.sqlite3",
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
    );
  });

  it.skipIf(inMemoryDb())("retrieves proper connection with nested connected to", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
          primary_replica: {
            adapter: "sqlite3",
            database: "test/db/primary.sqlite3",
            replica: true,
          },
          primary_shard_one: { adapter: "sqlite3", database: "test/db/primary_shard_one.sqlite3" },
          primary_shard_one_replica: {
            adapter: "sqlite3",
            database: "test/db/primary_shard_one.sqlite3",
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
    );
  });

  it.skipIf(inMemoryDb())("connected to raises without a shard or role", async () => {
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

  it.skipIf(inMemoryDb())("connects to raises with a shard and database key", async () => {
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

  it.skipIf(inMemoryDb())("retrieve connection pool with invalid shard", async () => {
    expect(Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base")).not.toBeUndefined();
    expect(
      Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", { shard: "foo" }),
    ).toBeUndefined();
  });

  it.skipIf(inMemoryDb())("calling connected to on a non existent shard raises", async () => {
    await Base.connectsTo({ shards: { default: { writing: ":arunit", reading: ":arunit" } } });
    let error: any;
    await expect(
      Base.connectedTo({ role: "reading", shard: "foo" }, async () => {
        await Person.first();
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
  });
  it.skipIf(inMemoryDb())(
    "calling connected to on a non existent role for shard raises",
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
          await Person.first();
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
  );
  it.skipIf(inMemoryDb())(
    "calling connected to on a default role for non existent shard raises",
    async () => {
      await Base.connectsTo({ shards: { default: { writing: ":arunit", reading: ":arunit" } } });
      let error: any;
      await expect(
        Base.connectedTo({ shard: "foo" }, async () => {
          await Person.first();
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
  );

  it.skipIf(inMemoryDb())("cannot swap shards while prohibited", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
          primary_shard_one: { adapter: "sqlite3", database: "test/db/primary_shard_one.sqlite3" },
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
    );
  });

  it.skipIf(inMemoryDb())("can swap roles while shard swapping is prohibited", async () => {
    await withBaseConfigs(
      {
        default_env: {
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
          primary_replica: {
            adapter: "sqlite3",
            database: "test/db/primary.sqlite3",
            replica: true,
          },
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
    );
  });

  it("default shard is chosen by first key or default", async () => {
    class SecondaryBase extends Base {
      static override abstractClass = true;
    }
    class SomeOtherBase extends Base {
      static override abstractClass = true;
    }
    await SecondaryBase.connectsTo({
      shards: { not_default: { writing: { database: ":memory:", adapter: "sqlite3" } } },
    });
    await SomeOtherBase.connectsTo({
      database: { writing: { database: ":memory:", adapter: "sqlite3" } },
    });
    expect(SecondaryBase.defaultShard).toBe("not_default");
    expect(SomeOtherBase.defaultShard).toBe("default");
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

    await SecondaryBase.connectsTo({
      shards: { one: { writing: { database: ":memory:", adapter: "sqlite3" } } },
    });
    await SomeOtherBase.connectsTo({
      shards: { one: { writing: { database: ":memory:", adapter: "sqlite3" } } },
    });

    await Base.connectedTo({ role: "writing", shard: "one" }, async () => {
      await (
        await ShardConnectionTestModel.leaseConnection()
      ).execute(`CREATE TABLE "shard_connection_test_models" (shard_key VARCHAR (255))`);
      await ShardConnectionTestModel.loadSchema();
      await ShardConnectionTestModel.createBang({ shard_key: "test_model_default" });

      await (
        await ShardConnectionTestModelB.leaseConnection()
      ).execute(`CREATE TABLE "shard_connection_test_model_bs" (shard_key VARCHAR (255))`);
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
        ).execute(`CREATE TABLE "shard_connection_test_models" (shard_key VARCHAR (255))`);
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
  });
});
