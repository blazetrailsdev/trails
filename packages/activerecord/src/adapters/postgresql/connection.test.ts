/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/connection_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlConnectionTest", () => {
    it("encoding", async () => {
      const rows = await adapter.execute(
        `SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].encoding).toBeTruthy();
    });

    it("collation", async () => {
      const rows = await adapter.execute(
        `SELECT datcollate FROM pg_database WHERE datname = current_database()`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].datcollate).toBeTruthy();
    });

    it("ctype", async () => {
      const rows = await adapter.execute(
        `SELECT datctype FROM pg_database WHERE datname = current_database()`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].datctype).toBeTruthy();
    });

    it.skip("tables logs name", async () => {});
    it.skip("indexes logs name", async () => {});
    it.skip("table exists logs name", async () => {});
    it.skip("table alias length logs name", async () => {});
    it.skip("current database logs name", async () => {});
    it.skip("encoding logs name", async () => {});
    it.skip("schema names logs name", async () => {});
    it.skip("statement key is logged", async () => {});
    it.skip("set session variable true", async () => {});
    it.skip("set session variable false", async () => {});
    it.skip("set session variable nil", async () => {});
    it.skip("set session variable default", async () => {});
    it.skip("set session variable reset", async () => {});
    it.skip("set session timezone", async () => {});
    it.skip("get advisory lock", async () => {});
    it.skip("release advisory lock", async () => {});
    it.skip("advisory lock with xact", async () => {});
    it.skip("reconnection after actual disconnection", async () => {});
    it.skip("reconnection after simulated disconnection", async () => {});
    it.skip("set client min messages", async () => {});
    it.skip("only warn on first encounter of unrecognized oid", async () => {});
    it.skip("only warn on first encounter of undefined column type", async () => {});
    it.skip("default client min messages", async () => {});
    it.skip("connection options", async () => {});
    it.skip("reset", async () => {});
    it.skip("reset with transaction", async () => {});
    it.skip("prepare false with binds", async () => {});
    it.skip("reconnection after actual disconnection with verify", async () => {});
  });
});
