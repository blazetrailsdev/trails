import { describe, it, expect, afterEach } from "vitest";
import { Base } from "../base.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { currentRole } from "../core.js";

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
  it.skip("establish connection using 3 levels config", () => {
    // BLOCKED: connection-pool — shard config lookup + pool name assertions; Slot C-b
  });
  it.skip("establish connection using 3 levels config with shards and replica", () => {
    // BLOCKED: connection-pool — shard config lookup + pool name assertions; Slot C-b
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

  it.skip("retrieves proper connection with nested connected to", () => {
    // BLOCKED: connection-pool — nested shard switching; Slot C-b
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

  it.skip("calling connected to on a non existent shard raises", () => {
    // BLOCKED: connection-pool — Slot C-b
  });
  it.skip("calling connected to on a non existent role for shard raises", () => {
    // BLOCKED: connection-pool — Slot C-b
  });
  it.skip("calling connected to on a default role for non existent shard raises", () => {
    // BLOCKED: connection-pool — Slot C-b
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
