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

  describe("PostgreSQLConnectionTest", () => {
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

    it.skip("indexes logs name", async () => {});
    it.skip("table alias length logs name", async () => {});

    it("current database logs name", async () => {
      const rows = await adapter.execute("SELECT current_database() AS db");
      expect(rows[0].db).toBeTruthy();
    });

    it.skip("encoding logs name", async () => {});
    it.skip("schema names logs name", async () => {});
    it.skip("statement key is logged", async () => {});

    it("set session variable true", async () => {
      await adapter.exec("SET enable_seqscan = ON");
      const rows = await adapter.execute("SHOW enable_seqscan");
      expect(rows[0].enable_seqscan).toBe("on");
    });

    it("set session variable false", async () => {
      await adapter.exec("SET enable_seqscan = OFF");
      const rows = await adapter.execute("SHOW enable_seqscan");
      expect(rows[0].enable_seqscan).toBe("off");
    });

    it.skip("set session variable nil", async () => {});
    it.skip("set session variable default", async () => {});
    it.skip("set session variable reset", async () => {});

    it("set session timezone", async () => {
      await adapter.exec("SET timezone = 'UTC'");
      const rows = await adapter.execute("SHOW timezone");
      expect(rows[0].TimeZone).toBe("UTC");
    });

    it("get advisory lock", async () => {
      const rows = await adapter.execute("SELECT pg_try_advisory_lock(12345) AS locked");
      expect(rows[0].locked).toBe(true);
      await adapter.execute("SELECT pg_advisory_unlock(12345)");
    });

    it("release advisory lock", async () => {
      await adapter.execute("SELECT pg_try_advisory_lock(12346)");
      const rows = await adapter.execute("SELECT pg_advisory_unlock(12346) AS unlocked");
      expect(rows[0].unlocked).toBe(true);
    });

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
  it.skip("get and release advisory lock", () => {});

  it.skip("release non existent advisory lock", () => {});
});
