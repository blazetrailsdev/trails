import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { createTestAdapter } from "../test-adapter.js";
import { Base } from "../base.js";
import { currentRole } from "../core.js";

describe("ConnectionHandlersMultiDbTest", () => {
  let handler: ConnectionHandler;
  let rwPool: any;
  let roPool: any;
  const connectionName = "Base";

  beforeEach(() => {
    handler = new ConnectionHandler();
    const dbConfig = new HashConfig("test", connectionName, {
      adapter: "sqlite3",
      database: ":memory:",
    });
    rwPool = handler.establishConnection(dbConfig, {
      owner: connectionName,
      adapterFactory: createTestAdapter,
    });
    roPool = handler.establishConnection(dbConfig, {
      owner: connectionName,
      role: "reading",
      adapterFactory: createTestAdapter,
    });
  });

  afterEach(() => {
    handler.clearAllConnectionsBang();
    Base.connectionHandler.clearAllConnectionsBang();
  });

  function withBaseConfigs(
    raw: Record<string, unknown>,
    fn: () => void,
    opts: { defaultEnv?: string } = {},
  ): void {
    const prevConfigs = (Base as any).configurations;
    const prevDefaultEnv = DatabaseConfigurations.defaultEnv;
    if (opts.defaultEnv) DatabaseConfigurations.defaultEnv = opts.defaultEnv;
    (Base as any).configurations = raw;
    try {
      fn();
    } finally {
      (Base as any).configurations = prevConfigs;
      DatabaseConfigurations.defaultEnv = prevDefaultEnv;
      Base.connectionHandler.clearAllConnectionsBang();
    }
  }

  it.skip("multiple connections works in a threaded environment", () => {
    // BLOCKED: GVL — Ruby thread / GVL semantics, no Node.js equivalent
    // SCOPE: permanent skip-list.ts candidate
  });
  it.skip("loading relations with multi db connections", () => {
    // BLOCKED: connection-pool — needs connects_to with in-memory SQLite + DDL + insert; Slot C
  });
  it.skip("establish connection using 3 levels config", () => {
    // BLOCKED: connection-pool — pool.dbConfig.database assertion requires file-backed DB; Slot C
  });
  it.skip("establish connection using 3 levels config with non default handlers", () => {
    // BLOCKED: connection-pool — pool.dbConfig.database assertion requires file-backed DB; Slot C
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
      Base.connectsTo({ database: { writing: { adapter: "sqlite3", database: ":memory:" } } });
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
          animals: { adapter: "sqlite3", database: ":memory:" },
          primary: { adapter: "sqlite3", database: ":memory:" },
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

  it("connects to with single configuration", () => {
    withBaseConfigs({ development: { adapter: "sqlite3", database: ":memory:" } }, () => {
      Base.connectsTo({ database: { writing: "development" } });
      expect(Base.connectionHandler).toBe(Base.connectionHandler);
      expect(currentRole.call(Base as any)).toBe("writing");
      expect(Base.connectedToQ({ role: "writing" })).toBe(true);
    });
  });

  it("connects to using top level key in two level config", () => {
    withBaseConfigs(
      {
        development: { adapter: "sqlite3", database: ":memory:" },
        development_readonly: { adapter: "sqlite3", database: ":memory:" },
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
        development: { adapter: "sqlite3", database: ":memory:" },
        development_readonly: { adapter: "sqlite3", database: ":memory:" },
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
