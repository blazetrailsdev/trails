import { describe, it, expect, beforeEach, vi } from "vitest";
import { PoolConfig } from "./pool-config.js";
import { ConnectionDescriptor } from "./abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { SchemaReflection } from "./schema-cache.js";

function makeDbConfig(name = "primary") {
  return new HashConfig("default", name, {
    adapter: "sqlite3",
    database: ":memory:",
  });
}

function makeDescriptor(name = "primary") {
  return new ConnectionDescriptor(name);
}

describe("PoolConfig", () => {
  let config: PoolConfig;

  beforeEach(() => {
    config = new PoolConfig(makeDescriptor(), makeDbConfig());
  });

  describe("constructor", () => {
    it("stores role, shard, and dbConfig", () => {
      expect(config.role).toBe("writing");
      expect(config.shard).toBe("default");
      expect(config.dbConfig.adapter).toBe("sqlite3");
    });

    it("sets connectionDescriptor from constructor arg", () => {
      expect(config.connectionDescriptor).toBeInstanceOf(ConnectionDescriptor);
      expect(config.connectionDescriptor.name).toBe("primary");
    });

    it("accepts a ConnectionOwner as first arg", () => {
      const owner = { name: "MyModel", primaryClassQ: () => false };
      const pc = new PoolConfig(owner, makeDbConfig());
      expect(pc.connectionDescriptor).toBeInstanceOf(ConnectionDescriptor);
      expect(pc.connectionDescriptor.name).toBe("MyModel");
    });
  });

  describe("connectionDescriptor", () => {
    it("can be set to a ConnectionDescriptor", () => {
      const desc = new ConnectionDescriptor("other");
      config.connectionDescriptor = desc;
      expect(config.connectionDescriptor).toBe(desc);
    });

    it("wraps ConnectionOwner objects into ConnectionDescriptor", () => {
      config.connectionDescriptor = { name: "MyModel", primaryClassQ: () => false };
      expect(config.connectionDescriptor).toBeInstanceOf(ConnectionDescriptor);
      expect(config.connectionDescriptor.name).toBe("MyModel");
    });

    it("wraps primary class owners correctly", () => {
      config.connectionDescriptor = { name: "Base", primaryClassQ: () => true };
      expect(config.connectionDescriptor.isPrimary).toBe(true);
      expect(config.connectionDescriptor.name).toBe("Base");
    });
  });

  describe("pool", () => {
    it("lazily creates a ConnectionPool on first access", () => {
      expect(config.poolInitialized).toBe(false);
      const pool = config.pool;
      expect(pool).toBeTruthy();
      expect(config.poolInitialized).toBe(true);
    });

    it("returns the same pool on subsequent accesses", () => {
      const pool1 = config.pool;
      const pool2 = config.pool;
      expect(pool1).toBe(pool2);
    });
  });

  describe("disconnectBang", () => {
    it("is a no-op when pool is not initialized", () => {
      expect(() => config.disconnectBang()).not.toThrow();
    });

    it("disconnects the pool when initialized", () => {
      const pool = config.pool;
      const spy = vi.spyOn(pool, "disconnect");
      config.disconnectBang();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("discardPoolBang", () => {
    it("is a no-op when pool is not initialized", () => {
      expect(() => config.discardPoolBang()).not.toThrow();
      expect(config.poolInitialized).toBe(false);
    });

    it("disconnects and nulls the pool", () => {
      const pool = config.pool;
      expect(config.poolInitialized).toBe(true);
      const spy = vi.spyOn(pool, "disconnect");
      config.discardPoolBang();
      expect(spy).toHaveBeenCalled();
      expect(config.poolInitialized).toBe(false);
    });

    it("creates a new pool after discard", () => {
      const pool1 = config.pool;
      config.discardPoolBang();
      const pool2 = config.pool;
      expect(pool2).not.toBe(pool1);
    });
  });

  describe("schemaReflection", () => {
    it("lazily creates a SchemaReflection", () => {
      const ref = config.schemaReflection;
      expect(ref).toBeInstanceOf(SchemaReflection);
    });

    it("can be set", () => {
      const custom = new SchemaReflection(null);
      config.schemaReflection = custom;
      expect(config.schemaReflection).toBe(custom);
    });
  });

  describe("serverVersion", () => {
    it("returns a function that caches the version from a connection", () => {
      const mockConn = { getDatabaseVersion: vi.fn().mockReturnValue("3.39.0") };
      const version = config.serverVersion(mockConn as any);
      expect(version).toBe("3.39.0");
      expect(mockConn.getDatabaseVersion).toHaveBeenCalledTimes(1);

      config.serverVersion(mockConn as any);
      expect(mockConn.getDatabaseVersion).toHaveBeenCalledTimes(1);
    });

    it("can be set directly via the setter", () => {
      config.serverVersion = "15.0";
      const mockConn = { getDatabaseVersion: vi.fn() };
      const version = config.serverVersion(mockConn as any);
      expect(version).toBe("15.0");
      expect(mockConn.getDatabaseVersion).not.toHaveBeenCalled();
    });
  });

  describe("static discardPoolsBang", () => {
    it("discards pools on all tracked instances", () => {
      const c1 = new PoolConfig(makeDescriptor("a"), makeDbConfig("a"));
      const c2 = new PoolConfig(makeDescriptor("b"), makeDbConfig("b"));
      void c1.pool;
      void c2.pool;
      expect(c1.poolInitialized).toBe(true);
      expect(c2.poolInitialized).toBe(true);
      PoolConfig.discardPoolsBang();
      expect(c1.poolInitialized).toBe(false);
      expect(c2.poolInitialized).toBe(false);
    });
  });

  describe("static disconnectAllBang", () => {
    it("disconnects all tracked instances", () => {
      const c1 = new PoolConfig(makeDescriptor("a"), makeDbConfig("a"));
      const c2 = new PoolConfig(makeDescriptor("b"), makeDbConfig("b"));
      const pool1 = c1.pool;
      const pool2 = c2.pool;
      const spy1 = vi.spyOn(pool1, "disconnect");
      const spy2 = vi.spyOn(pool2, "disconnect");
      PoolConfig.disconnectAllBang();
      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });
  });
});
