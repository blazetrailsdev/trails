import { describe, expect, it, vi } from "vitest";
import { HashConfig } from "./hash-config.js";
import { AdapterNotFound } from "../errors.js";
import * as connectionAdapters from "../connection-adapters.js";
import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

connectionAdapters.register("abstract", async () => AbstractAdapter as any);

describe("DatabaseConfigurations", () => {
  describe("HashConfigTest", () => {
    it("pool default when nil", () => {
      const config = new HashConfig("default_env", "primary", {
        pool: null as any,
        adapter: "abstract",
      });
      expect(config.pool).toBe(5);
    });

    it("pool overrides with value", () => {
      const config = new HashConfig("default_env", "primary", { pool: "0", adapter: "abstract" });
      expect(config.pool).toBe(0);
    });

    it("when no pool uses default", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.pool).toBe(5);
    });

    it("min threads with value", () => {
      const config = new HashConfig("default_env", "primary", {
        minThreads: "1",
        adapter: "abstract",
      });
      expect(config.minThreads).toBe(1);
    });

    it("min threads default", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.minThreads).toBe(0);
    });

    it("max threads with value", () => {
      const config = new HashConfig("default_env", "primary", {
        maxThreads: "10",
        adapter: "abstract",
      });
      expect(config.maxThreads).toBe(10);
    });

    it("max threads default uses pool default", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.pool).toBe(5);
      expect(config.maxThreads).toBe(5);
    });

    it("max threads uses pool when set", () => {
      const config = new HashConfig("default_env", "primary", { pool: 1, adapter: "abstract" });
      expect(config.pool).toBe(1);
      expect(config.maxThreads).toBe(1);
    });

    it("max queue is pool multiplied by 4", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.maxThreads).toBe(5);
      expect(config.maxQueue).toBe(config.maxThreads * 4);
    });

    it("checkout timeout default when nil", () => {
      const config = new HashConfig("default_env", "primary", {
        checkoutTimeout: null as any,
        adapter: "abstract",
      });
      expect(config.checkoutTimeout).toBe(5.0);
    });

    it("checkout timeout overrides with value", () => {
      const config = new HashConfig("default_env", "primary", {
        checkoutTimeout: "0",
        adapter: "abstract",
      });
      expect(config.checkoutTimeout).toBe(0.0);
    });

    it("when no checkout timeout uses default", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.checkoutTimeout).toBe(5.0);
    });

    it("reaping frequency default when nil", () => {
      const config = new HashConfig("default_env", "primary", {
        reapingFrequency: null,
        adapter: "abstract",
      });
      expect(config.reapingFrequency).toBeNull();
    });

    it("reaping frequency overrides with value", () => {
      const config = new HashConfig("default_env", "primary", {
        reapingFrequency: "0",
        adapter: "abstract",
      });
      // Rails: 0.0; trails treats <=0 as nil for reaping_frequency (same rule as idle_timeout).
      expect(config.reapingFrequency).toBeNull();
    });

    it("when no reaping frequency uses default", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.reapingFrequency).toBe(60.0);
    });

    it("idle timeout default when nil", () => {
      const config = new HashConfig("default_env", "primary", {
        idleTimeout: null,
        adapter: "abstract",
      });
      expect(config.idleTimeout).toBeNull();
    });

    it("idle timeout overrides with value", () => {
      const config = new HashConfig("default_env", "primary", {
        idleTimeout: "1",
        adapter: "abstract",
      });
      expect(config.idleTimeout).toBe(1.0);
    });

    it("when no idle timeout uses default", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.idleTimeout).toBe(300.0);
    });

    it("idle timeout nil when less than or equal to zero", () => {
      const config = new HashConfig("default_env", "primary", {
        idleTimeout: "0",
        adapter: "abstract",
      });
      expect(config.idleTimeout).toBeNull();
    });

    it("default schema dump value", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      // trails default schema format is "ts" (Rails: "ruby" → "schema.rb").
      expect(config.schemaDump()).toBe("schema.ts");
      expect(config.schemaDump("ruby")).toBe("schema.rb");
    });

    it("schema dump value set to filename", () => {
      const config = new HashConfig("default_env", "primary", {
        schemaDump: "my_schema.rb",
        adapter: "abstract",
      });
      expect(config.schemaDump()).toBe("my_schema.rb");
    });

    it("schema dump value set to nil", () => {
      const config = new HashConfig("default_env", "primary", {
        schemaDump: null,
        adapter: "abstract",
      });
      expect(config.schemaDump()).toBeNull();
    });

    it("schema dump value set to false", () => {
      const config = new HashConfig("default_env", "primary", {
        schemaDump: false,
        adapter: "abstract",
      });
      // Rails returns nil for both false and nil; trails preserves the literal false.
      expect(config.schemaDump()).toBe(false);
    });

    it("database tasks defaults to true", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.databaseTasks()).toBe(true);
    });

    it("database tasks overrides with value", () => {
      let config = new HashConfig("default_env", "primary", {
        databaseTasks: false,
        adapter: "abstract",
      });
      expect(config.databaseTasks()).toBe(false);

      config = new HashConfig("default_env", "primary", {
        databaseTasks: "str" as any,
        adapter: "abstract",
      });
      expect(config.databaseTasks()).toBe(true);
    });

    it("schema cache path default for primary", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      // trails writes JSON, not YAML (no Ruby Marshal/YAML in TS).
      expect(config.defaultSchemaCachePath()).toBe("db/schema_cache.json");
    });

    it("schema cache path default for custom name", () => {
      const config = new HashConfig("default_env", "alternate", { adapter: "abstract" });
      expect(config.defaultSchemaCachePath()).toBe("db/alternate_schema_cache.json");
    });

    it("schema cache path default for different db dir", () => {
      const config = new HashConfig("default_env", "alternate", { adapter: "abstract" });
      expect(config.defaultSchemaCachePath("my_db")).toBe("my_db/alternate_schema_cache.json");
    });

    it("schema cache path configuration hash", () => {
      const config = new HashConfig("default_env", "primary", {
        schemaCachePath: "db/config_schema_cache.yml",
        adapter: "abstract",
      });
      expect(config.schemaCachePath).toBe("db/config_schema_cache.yml");
    });

    it("lazy schema cache path", () => {
      const config = new HashConfig("default_env", "primary", {
        schemaCachePath: "db/config_schema_cache.yml",
        adapter: "abstract",
      });
      expect(config.lazySchemaCachePath()).toBe("db/config_schema_cache.yml");
    });

    it("lazy schema cache path uses default if config is not present", () => {
      const config = new HashConfig("default_env", "alternate", { adapter: "abstract" });
      expect(config.lazySchemaCachePath()).toBe("db/alternate_schema_cache.json");
    });

    it("validate checks the adapter exists", async () => {
      const ok = new HashConfig("default_env", "primary", { adapter: "abstract" });
      await expect(ok.validateBang()).resolves.toBe(true);

      const bad = new HashConfig("default_env", "primary", { adapter: "potato" });
      await expect(bad.validateBang()).rejects.toBeInstanceOf(AdapterNotFound);
    });

    it("inspect does not show secrets", () => {
      const config = new HashConfig("default_env", "primary", {
        adapter: "abstract",
        password: "hunter2",
      });
      const out = config.inspect();
      expect(out).not.toContain("hunter2");
      expect(out).toContain("env_name=default_env");
      expect(out).toContain("name=primary");
    });

    it("seeds defaults to primary", () => {
      let config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.seeds).toBe(true);

      config = new HashConfig("default_env", "primary", { adapter: "abstract", seeds: false });
      expect(config.seeds).toBe(false);

      config = new HashConfig("default_env", "primary", { adapter: "abstract", seeds: true });
      expect(config.seeds).toBe(true);

      config = new HashConfig("default_env", "secondary", { adapter: "abstract" });
      vi.spyOn(config, "isPrimary").mockReturnValue(false);
      expect(config.seeds).toBe(false);

      config = new HashConfig("default_env", "secondary", { adapter: "abstract", seeds: false });
      vi.spyOn(config, "isPrimary").mockReturnValue(false);
      expect(config.seeds).toBe(false);

      config = new HashConfig("default_env", "secondary", { adapter: "abstract", seeds: true });
      vi.spyOn(config, "isPrimary").mockReturnValue(false);
      expect(config.seeds).toBe(true);
    });
  });
});
