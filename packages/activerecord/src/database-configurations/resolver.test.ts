import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { DatabaseConfigurations } from "../database-configurations.js";
import type { RawConfigurations } from "../database-configurations.js";
import { AdapterNotFound } from "../errors.js";
import "../connection-handling.js";
import { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";

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

    it("url invalid adapter", () => {
      const dbConfig = resolveDbConfig("ridiculous://foo?encoding=utf8");
      const handler = new ConnectionHandler();
      expect(() => handler.establishConnection(dbConfig)).toThrow(AdapterNotFound);
      expect(() => handler.establishConnection(dbConfig)).toThrow(
        /^Database configuration specifies nonexistent 'ridiculous' adapter\. Available adapters are: .+\. Ensure that the adapter is spelled correctly in config\/database\.yml and that you've added the necessary adapter package to your package\.json if it's not in the list of available adapters\.$/,
      );
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

    it.skip("url missing scheme", () => {});

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
      const configs = new DatabaseConfigurations({});
      expect(() => configs.resolve(123)).toThrow(TypeError);
    });
  });
});
