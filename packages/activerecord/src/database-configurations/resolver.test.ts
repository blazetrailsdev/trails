import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { DatabaseConfigurations } from "../database-configurations.js";
import type { RawConfigurations } from "../database-configurations.js";
import { AdapterNotFound } from "../errors.js";
// connection-handling registers the adapter class resolver that validateBang()
// relies on (same import hash-config.test.ts uses) so the "url invalid adapter"
// case resolves the adapter rather than throwing "resolver not registered".
import "../connection-handling.js";

function resolveDbConfig(poolConfig: string, config: RawConfigurations = {}) {
  const configs = new DatabaseConfigurations(config);
  return configs.resolve(poolConfig);
}

describe("PoolConfig", () => {
  describe("ResolverTest", () => {
    beforeEach(() => {
      DatabaseConfigurations.defaultEnv = "development";
    });

    afterEach(() => {
      DatabaseConfigurations.defaultEnv = "development";
    });

    it("url invalid adapter", async () => {
      // Rails drives this through Base.connection_handler.establish_connection; the
      // trails resolver suite tests the resolver level (configs.resolve), so we
      // resolve + validate the config directly. An unknown adapter in the URL
      // (scheme "ridiculous" → adapter "ridiculous") fails adapter resolution.
      const promise = resolveDbConfig("ridiculous://foo?encoding=utf8").validateBang();
      await expect(promise).rejects.toBeInstanceOf(AdapterNotFound);
      // Mirrors Rails' assert_match on the nonexistent-adapter message.
      await expect(promise).rejects.toThrow(/nonexistent 'ridiculous' adapter/);
    });

    it("url from environment", () => {
      const poolConfig = resolveDbConfig("production", {
        production: "abstract://foo?encoding=utf8",
      });
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        host: "foo",
        encoding: "utf8",
      });
    });

    it("url sub key", () => {
      const poolConfig = resolveDbConfig("production", {
        production: { url: "abstract://foo?encoding=utf8" },
      });
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        host: "foo",
        encoding: "utf8",
      });
    });

    it("url sub key merges correctly", () => {
      const hash = {
        url: "abstract://foo?encoding=utf8&",
        adapter: "sqlite3",
        host: "bar",
        pool: "3",
      };
      const poolConfig = resolveDbConfig("production", { production: hash });
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        host: "foo",
        encoding: "utf8",
        pool: "3",
      });
    });

    it("url sub key merges correctly when query param", () => {
      const hash = { url: "abstract:///?user=user&password=passwd&dbname=app" };
      const poolConfig = resolveDbConfig("production", { production: hash });
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        user: "user",
        password: "passwd",
        dbname: "app",
      });
    });

    it("url host no db", () => {
      const poolConfig = resolveDbConfig("abstract://foo?encoding=utf8");
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        host: "foo",
        encoding: "utf8",
      });
    });

    it.skip("url missing scheme", () => {
      // DIVERGES: we treat non-URL strings as env name lookups (like Ruby symbols);
      // Rails always parses string args as URLs and raises InvalidConfigurationError.
    });

    it("url host db", () => {
      const poolConfig = resolveDbConfig("abstract://foo/bar?encoding=utf8");
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        database: "bar",
        host: "foo",
        encoding: "utf8",
      });
    });

    it("url port", () => {
      const poolConfig = resolveDbConfig("abstract://foo:123?encoding=utf8");
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "abstract",
        port: 123,
        host: "foo",
        encoding: "utf8",
      });
    });

    it("encoded password", () => {
      const password = "am@z1ng_p@ssw0rd#!";
      const encoded = encodeURIComponent(password);
      const poolConfig = resolveDbConfig(`abstract://foo:${encoded}@localhost/bar`);
      expect(poolConfig.configurationHash.password).toBe(password);
    });

    it("url with authority for sqlite3", () => {
      const poolConfig = resolveDbConfig("sqlite3:///foo_test");
      expect(poolConfig.database).toBe("/foo_test");
    });

    it("url absolute path for sqlite3", () => {
      const poolConfig = resolveDbConfig("sqlite3:/foo_test");
      expect(poolConfig.database).toBe("/foo_test");
    });

    it("url relative path for sqlite3", () => {
      const poolConfig = resolveDbConfig("sqlite3:foo_test");
      expect(poolConfig.database).toBe("foo_test");
    });

    it("url memory db for sqlite3", () => {
      const poolConfig = resolveDbConfig("sqlite3::memory:");
      expect(poolConfig.database).toBe(":memory:");
    });

    it("url sub key for sqlite3", () => {
      const poolConfig = resolveDbConfig("production", {
        production: { url: "sqlite3:foo?encoding=utf8" },
      });
      expect(poolConfig.configurationHash).toMatchObject({
        adapter: "sqlite3",
        database: "foo",
        encoding: "utf8",
      });
    });

    it("pool config with invalid type", () => {
      // Rails passes Object.new to establish_connection and expects a TypeError;
      // resolve() raises the same for a value that is neither a string, a hash,
      // nor a DatabaseConfig. A number (not a plain object) is the faithful JS
      // analog: resolve() treats *any* non-null object as a hash, so `{}` would
      // build a HashConfig instead of throwing — only a non-object primitive
      // reaches the TypeError arm.
      const configs = new DatabaseConfigurations({});
      expect(() => configs.resolve(123)).toThrow(TypeError);
    });
  });
});
