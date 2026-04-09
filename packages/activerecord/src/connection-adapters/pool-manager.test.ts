import { describe, it, expect, beforeEach } from "vitest";
import { PoolManager } from "./pool-manager.js";
import { PoolConfig } from "./pool-config.js";
import { HashConfig } from "../database-configurations/hash-config.js";

function makePoolConfig(name: string, opts: { role?: string; shard?: string } = {}): PoolConfig {
  const dbConfig = new HashConfig("default", name, {
    adapter: "sqlite3",
    database: ":memory:",
  });
  return new PoolConfig(dbConfig, {
    role: opts.role ?? "writing",
    shard: opts.shard ?? "default",
  });
}

describe("PoolManager", () => {
  let manager: PoolManager;

  beforeEach(() => {
    manager = new PoolManager();
  });

  describe("constructor", () => {
    it("initializes with no pool configs", () => {
      expect(manager.roleNames).toEqual([]);
      expect(manager.shardNames).toEqual([]);
    });
  });

  describe("setPoolConfig / getPoolConfig", () => {
    it("stores and retrieves a pool config by role and shard", () => {
      const config = makePoolConfig("primary");
      manager.setPoolConfig("writing", "default", config);
      expect(manager.getPoolConfig("writing", "default")).toBe(config);
    });

    it("returns undefined for missing role/shard", () => {
      expect(manager.getPoolConfig("writing", "default")).toBeUndefined();
    });

    it("throws ArgumentError when pool config is null", () => {
      expect(() => {
        manager.setPoolConfig("writing", "default", null as any);
      }).toThrow(/poolConfig.*:writing.*:default.*null/);
    });

    it("overwrites existing config for same role/shard", () => {
      const config1 = makePoolConfig("primary");
      const config2 = makePoolConfig("replica");
      manager.setPoolConfig("writing", "default", config1);
      manager.setPoolConfig("writing", "default", config2);
      expect(manager.getPoolConfig("writing", "default")).toBe(config2);
    });
  });

  describe("roleNames", () => {
    it("returns all registered roles", () => {
      manager.setPoolConfig("writing", "default", makePoolConfig("primary"));
      manager.setPoolConfig("reading", "default", makePoolConfig("replica"));
      expect(manager.roleNames.sort()).toEqual(["reading", "writing"]);
    });
  });

  describe("shardNames", () => {
    it("returns unique shard names across all roles", () => {
      manager.setPoolConfig("writing", "shard_one", makePoolConfig("s1"));
      manager.setPoolConfig("writing", "shard_two", makePoolConfig("s2"));
      manager.setPoolConfig("reading", "shard_one", makePoolConfig("s1r"));
      expect(manager.shardNames.sort()).toEqual(["shard_one", "shard_two"]);
    });
  });

  describe("poolConfigs", () => {
    it("returns all pool configs when no role specified", () => {
      const c1 = makePoolConfig("primary");
      const c2 = makePoolConfig("replica");
      manager.setPoolConfig("writing", "default", c1);
      manager.setPoolConfig("reading", "default", c2);
      expect(manager.poolConfigs()).toEqual(expect.arrayContaining([c1, c2]));
      expect(manager.poolConfigs()).toHaveLength(2);
    });

    it("returns pool configs for a specific role", () => {
      const c1 = makePoolConfig("primary");
      const c2 = makePoolConfig("replica");
      manager.setPoolConfig("writing", "default", c1);
      manager.setPoolConfig("reading", "default", c2);
      expect(manager.poolConfigs("writing")).toEqual([c1]);
    });

    it("returns empty array for unknown role", () => {
      expect(manager.poolConfigs("unknown")).toEqual([]);
    });
  });

  describe("eachPoolConfig", () => {
    it("iterates all pool configs when no role specified", () => {
      const c1 = makePoolConfig("primary");
      const c2 = makePoolConfig("replica");
      manager.setPoolConfig("writing", "default", c1);
      manager.setPoolConfig("reading", "default", c2);
      const collected: PoolConfig[] = [];
      manager.eachPoolConfig((pc) => collected.push(pc));
      expect(collected).toEqual(expect.arrayContaining([c1, c2]));
      expect(collected).toHaveLength(2);
    });

    it("iterates pool configs for a specific role", () => {
      const c1 = makePoolConfig("primary");
      const c2 = makePoolConfig("replica");
      manager.setPoolConfig("writing", "default", c1);
      manager.setPoolConfig("reading", "default", c2);
      const collected: PoolConfig[] = [];
      manager.eachPoolConfig("writing", (pc) => collected.push(pc));
      expect(collected).toEqual([c1]);
    });

    it("does nothing for unknown role", () => {
      const collected: PoolConfig[] = [];
      manager.eachPoolConfig("unknown", (pc) => collected.push(pc));
      expect(collected).toEqual([]);
    });
  });

  describe("removePoolConfig", () => {
    it("removes and returns the pool config", () => {
      const config = makePoolConfig("primary");
      manager.setPoolConfig("writing", "default", config);
      const removed = manager.removePoolConfig("writing", "default");
      expect(removed).toBe(config);
      expect(manager.getPoolConfig("writing", "default")).toBeUndefined();
    });

    it("cleans up empty role maps", () => {
      manager.setPoolConfig("writing", "default", makePoolConfig("primary"));
      manager.removePoolConfig("writing", "default");
      expect(manager.roleNames).toEqual([]);
    });

    it("returns undefined for missing entries", () => {
      expect(manager.removePoolConfig("writing", "default")).toBeUndefined();
    });
  });

  describe("removeRole", () => {
    it("removes all shards for a role", () => {
      manager.setPoolConfig("writing", "shard_one", makePoolConfig("s1"));
      manager.setPoolConfig("writing", "shard_two", makePoolConfig("s2"));
      manager.removeRole("writing");
      expect(manager.roleNames).toEqual([]);
      expect(manager.poolConfigs("writing")).toEqual([]);
    });

    it("returns false for unknown role", () => {
      expect(manager.removeRole("unknown")).toBe(false);
    });

    it("returns true when role existed", () => {
      manager.setPoolConfig("writing", "default", makePoolConfig("primary"));
      expect(manager.removeRole("writing")).toBe(true);
    });
  });
});
