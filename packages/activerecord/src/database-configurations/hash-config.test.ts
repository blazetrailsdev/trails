import { afterEach, describe, expect, it, vi } from "vitest";
import { HashConfig } from "./hash-config.js";
import { assertRaises } from "@blazetrails/activesupport";
import { AdapterNotFound } from "../errors.js";
import * as connectionAdapters from "../connection-adapters.js";
import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import "../connection-handling.js";

connectionAdapters.register(
  "abstract",
  "AbstractAdapter",
  "./connection-adapters/abstract-adapter.js",
  async () => AbstractAdapter as any,
);

describe("DatabaseConfigurations", () => {
  describe("HashConfigTest", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

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
      expect(config.reapingFrequency).toBe(0.0);
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

    it.skip("default schema dump value", () => {
      // BLOCKED: hash-config-defaults-diverge-from-rails-schema-dump-and-cache-path
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.schemaDump()).toBe("schema.rb");
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
      expect(config.schemaDump()).toBeNull();
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

    it.skip("schema cache path default for primary", () => {
      // BLOCKED: hash-config-defaults-diverge-from-rails-schema-dump-and-cache-path
      const config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(config.defaultSchemaCachePath()).toBe("db/schema_cache.yml");
    });

    it.skip("schema cache path default for custom name", () => {
      // BLOCKED: hash-config-defaults-diverge-from-rails-schema-dump-and-cache-path
      const config = new HashConfig("default_env", "alternate", { adapter: "abstract" });
      expect(config.defaultSchemaCachePath()).toBe("db/alternate_schema_cache.yml");
    });

    it.skip("schema cache path default for different db dir", () => {
      // BLOCKED: hash-config-defaults-diverge-from-rails-schema-dump-and-cache-path
      const config = new HashConfig("default_env", "alternate", { adapter: "abstract" });
      expect(config.defaultSchemaCachePath("my_db")).toBe("my_db/alternate_schema_cache.yml");
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

    it.skip("lazy schema cache path uses default if config is not present", () => {
      // BLOCKED: hash-config-defaults-diverge-from-rails-schema-dump-and-cache-path
      const config = new HashConfig("default_env", "alternate", { adapter: "abstract" });
      expect(config.lazySchemaCachePath()).toBe("db/alternate_schema_cache.yml");
    });

    it("validate checks the adapter exists", async () => {
      let config = new HashConfig("default_env", "primary", { adapter: "abstract" });
      expect(await config.validateBang()).toBeTruthy();
      config = new HashConfig("default_env", "primary", { adapter: "potato" });
      await assertRaises([AdapterNotFound], {}, () => config.validateBang());
    });

    it.skip("inspect does not show secrets", () => {
      // BLOCKED: hash-config-inspect-omits-ruby-class-path
      const config = new HashConfig("default_env", "primary", {
        adapter: "abstract",
        password: "hunter2",
      });
      expect(config.inspect()).toBe(
        "#<ActiveRecord::DatabaseConfigurations::HashConfig env_name=default_env name=primary adapter_class=ActiveRecord::ConnectionAdapters::AbstractAdapter>",
      );
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

    it("_database= does not mutate the hash passed to the constructor", () => {
      const original = { adapter: "abstract", database: "original_db" };
      const config = new HashConfig("default_env", "primary", original);

      const hashBefore = config.configurationHash;
      config._database = "swapped_db";

      expect(original.database).toBe("original_db");
      expect(config.database).toBe("swapped_db");
      expect(config.configurationHash.adapter).toBe("abstract");
      expect(config.configurationHash).not.toBe(hashBefore);
      expect(Object.isFrozen(config.configurationHash)).toBe(true);

      config._database = "swapped_again";
      expect(config.database).toBe("swapped_again");
    });

    it("the configuration hash is a frozen copy of the hash passed to the constructor", () => {
      const original: Record<string, unknown> = { adapter: "abstract", database: "original_db" };
      const config = new HashConfig("default_env", "primary", original);

      expect(config.configurationHash).not.toBe(original);
      expect(Object.isFrozen(config.configurationHash)).toBe(true);

      original.database = "mutated_after_construction";
      expect(config.database).toBe("original_db");
    });
  });
});
