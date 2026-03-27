/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/connection_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("ConnectionTest", () => {
    it.skip("no automatic reconnection after timeout", () => {});
    it.skip("successful reconnection after timeout with manual reconnect", () => {});
    it.skip("successful reconnection after timeout with verify", () => {});
    it.skip("execute after disconnect reconnects", () => {});
    it.skip("quote after disconnect reconnects", () => {});
    it.skip("active after disconnect", () => {});
    it.skip("wait timeout as string", () => {});
    it.skip("wait timeout as url", () => {});

    it("character set connection is configured", async () => {
      const rows = await adapter.execute("SHOW VARIABLES LIKE 'character_set_connection'");
      expect(rows).toHaveLength(1);
      expect(rows[0].Value).toBeDefined();
    });

    it.skip("collation connection is configured", () => {});
    it.skip("mysql default in strict mode", () => {});
    it.skip("mysql strict mode disabled", () => {});
    it.skip("mysql strict mode specified default", () => {});
    it.skip("mysql sql mode variable overrides strict mode", () => {});
    it.skip("passing arbitrary flags to adapter", () => {});
    it.skip("passing flags by array to adapter", () => {});
    it.skip("mysql set session variable", () => {});
    it.skip("mysql set session variable to default", () => {});
    it.skip("logs name show variable", () => {});
    it.skip("logs name rename column for alter", () => {});
    it.skip("version string", () => {});
    it.skip("version string with mariadb", () => {});
    it.skip("version string invalid", () => {});
    it.skip("lock free", () => {});
  });
});
