import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../base.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { currentRole, connectedToStack } from "../core.js";

function withBaseConfigs(
  raw: Record<string, unknown>,
  fn: () => void,
  opts: { defaultEnv?: string } = {},
): void {
  const prevConfigs = (Base as any).configurations;
  const prevDefaultEnv = DatabaseConfigurations.defaultEnv;
  const prevCurrent = (DatabaseConfigurations as any).current;
  if (opts.defaultEnv) DatabaseConfigurations.defaultEnv = opts.defaultEnv;
  (Base as any).configurations = raw;
  try {
    fn();
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

  it.skip("establishing a connection in connected to block uses current role and shard", () => {
    // BLOCKED: connection-pool — needs file-backed DB; establish_connection inside connected_to
  });
  it("establish connection using 3 levels config", () => {
    withBaseConfigs(
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
  it("establish connection using 3 levels config with shards and replica", () => {
    withBaseConfigs(
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

  it("retrieves proper connection with nested connected to", () => {
    withBaseConfigs(
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

  it("calling connected to on a non existent shard raises", () => {
    withBaseConfigs(
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
  it("calling connected to on a non existent role for shard raises", () => {
    withBaseConfigs(
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
  it("calling connected to on a default role for non existent shard raises", () => {
    withBaseConfigs(
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
      expect(ShardedAbstractBase.defaultShard()).toBe("not_default");

      ShardedAbstractBase.connectingTo({ role: "writing" });
      expect(ShardedAbstractBase.connectedToQ({ role: "writing", shard: "not_default" })).toBe(
        true,
      );
    } finally {
      Base.connectionHandler.clearAllConnectionsBang();
      // pop the stack entry added by connectingTo
      connectedToStack().pop();
    }
  });

  it.skip("same shards across clusters", () => {
    // BLOCKED: connection-pool — multi-cluster shard isolation with real DB; Slot C-b
  });
  it.skip("sharding separation", () => {
    // BLOCKED: connection-pool — per-shard DB isolation with real DDL/DML; Slot C-b
  });
  it.skip("swapping shards globally in a multi threaded environment", () => {
    // BLOCKED: GVL — Ruby thread / GVL semantics, no Node.js equivalent
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("swapping shards and roles in a multi threaded environment", () => {
    // BLOCKED: GVL — Ruby thread / GVL semantics, no Node.js equivalent
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
  it.skip("swapping granular shards and roles in a multi threaded environment", () => {
    // BLOCKED: GVL — Ruby thread / GVL semantics, no Node.js equivalent
    // SCOPE: ~0 LOC fix; permanent skip-list.ts candidate
  });
});
