/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/connection_test.rb
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { NoDatabaseError, DatabaseVersionError } from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
    await adapter.close();
  });

  describe("ConnectionTest", () => {
    it("bad connection", async () => {
      const u = new URL(MYSQL_TEST_URL);
      u.pathname = "/inexistent_activerecord_unittest";
      const badAdapter = new Mysql2Adapter(u.toString());
      try {
        await expect(badAdapter.execute("SELECT 1")).rejects.toBeInstanceOf(NoDatabaseError);
      } finally {
        await badAdapter.close();
      }
    });

    it.skipIf(isMariaDb)(
      "no automatic reconnection after timeout",
      async () => {
        const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
        try {
          expect(await singleConn.activeAsync()).toBe(true);
          await singleConn.execute("SET SESSION wait_timeout=1");
          await new Promise((r) => setTimeout(r, 2000));
          expect(await singleConn.activeAsync()).toBe(false);
        } finally {
          await singleConn.close();
        }
      },
      10_000,
    );
    it("successful reconnection after timeout with manual reconnect", async () => {
      // Use connectionLimit: 1 so SET SESSION wait_timeout and the sleep share
      // the same physical connection — otherwise a second pool connection with
      // the default wait_timeout could be used for the later execute().
      const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        expect(await singleConn.activeAsync()).toBe(true);
        await singleConn.execute("SET SESSION wait_timeout=1");
        await new Promise((r) => setTimeout(r, 2000));
        singleConn.reconnectBang();
        expect(singleConn.active).toBe(true);
        await expect(singleConn.execute("SELECT 1")).resolves.toBeDefined();
      } finally {
        await singleConn.close();
      }
    }, 10_000);
    it("successful reconnection after timeout with verify", async () => {
      // Use connectionLimit: 1 so the session wait_timeout applies to the same
      // connection that activeAsync() and verifyBang() will use.
      const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        expect(await singleConn.activeAsync()).toBe(true);
        await singleConn.execute("SET SESSION wait_timeout=1");
        await new Promise((r) => setTimeout(r, 2000));
        // With connectionLimit:1 the pool has no spare slot to create a fresh
        // connection, so getConnection() returns the dead socket and ping() fails.
        // activeAsync() sets _activeState = false, making active return false.
        await singleConn.activeAsync();
        singleConn.verifyBang(); // active is false → calls reconnectBang()
        expect(singleConn.active).toBe(true);
        await expect(singleConn.execute("SELECT 1")).resolves.toBeDefined();
      } finally {
        await singleConn.close();
      }
    }, 10_000);
    it("execute after disconnect reconnects", async () => {
      adapter.disconnectBang();
      const rows = await adapter.execute("SELECT 1+2 AS v");
      expect(rows[0].v).toBe(3);
    });

    it("quote after disconnect reconnects", () => {
      adapter.disconnectBang();
      expect(adapter.quote("string")).toBe("'string'");
    });

    it("active after disconnect", () => {
      expect(adapter.active).toBe(true);
      adapter.disconnectBang();
      expect(adapter.active).toBe(false);
    });

    it("wait timeout as string", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, waitTimeout: "60" });
      try {
        const rows = await testAdapter.execute("SELECT @@SESSION.wait_timeout AS v");
        expect(parseInt(rows[0].v as string, 10)).toBe(60);
      } finally {
        await testAdapter.close();
      }
    });
    it("wait timeout as url", async () => {
      const url = new URL(MYSQL_TEST_URL);
      url.searchParams.set("wait_timeout", "60");
      const testAdapter = new Mysql2Adapter(url.toString());
      try {
        const rows = await testAdapter.execute("SELECT @@SESSION.wait_timeout AS v");
        expect(parseInt(rows[0].v as string, 10)).toBe(60);
      } finally {
        await testAdapter.close();
      }
    });

    it("character set connection is configured", async () => {
      const rows = await adapter.execute("SHOW VARIABLES LIKE 'character_set_connection'");
      expect(rows).toHaveLength(1);
      expect(rows[0].Value).toBeDefined();
    });

    it.skip("collation connection is configured", () => {
      // BLOCKED: requires second adapter (ARUnit2Model pattern) — not in TS test infra.
      // showVariable() now implemented; only the second-adapter assertion is missing.
      // SCOPE: add MYSQL_TEST_URL2 + second adapter to test-helper.ts.
    });
    it("mysql default in strict mode", async () => {
      const rows = await adapter.execute("SELECT @@SESSION.sql_mode AS v");
      expect(String(rows[0].v)).toMatch(/STRICT_ALL_TABLES/);
    });
    it("mysql strict mode disabled", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, strict: false });
      try {
        const rows = await testAdapter.execute("SELECT @@SESSION.sql_mode AS v");
        expect(String(rows[0].v)).not.toMatch(/STRICT_ALL_TABLES/);
      } finally {
        await testAdapter.close();
      }
    });
    it("mysql strict mode specified default", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, strict: "default" });
      try {
        const globalRows = await testAdapter.execute("SELECT @@GLOBAL.sql_mode AS v");
        const sessionRows = await testAdapter.execute("SELECT @@SESSION.sql_mode AS v");
        expect(sessionRows[0].v).toBe(globalRows[0].v);
      } finally {
        await testAdapter.close();
      }
    });
    it("mysql sql mode variable overrides strict mode", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        variables: { sql_mode: "ansi" },
      });
      try {
        const rows = await testAdapter.execute("SELECT @@SESSION.sql_mode AS v");
        expect(String(rows[0].v)).not.toMatch(/STRICT_ALL_TABLES/);
      } finally {
        await testAdapter.close();
      }
    });
    it.skip("passing arbitrary flags to adapter", () => {
      // BLOCKED: pool model has no single raw_connection; flags on query_options not accessible.
      // SCOPE: expose query_options via a test accessor or pool config read-back.
    });
    it.skip("passing flags by array to adapter", () => {
      // BLOCKED: same as "passing arbitrary flags to adapter".
    });
    it("mysql set session variable", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        variables: { default_week_format: 3 },
      });
      try {
        const rows = await testAdapter.execute("SELECT @@SESSION.DEFAULT_WEEK_FORMAT AS v");
        expect(parseInt(rows[0].v as string, 10)).toBe(3);
      } finally {
        await testAdapter.close();
      }
    });
    it("mysql set session variable to default", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        variables: { default_week_format: "default" },
      });
      try {
        const globalRows = await testAdapter.execute("SELECT @@GLOBAL.DEFAULT_WEEK_FORMAT AS v");
        const sessionRows = await testAdapter.execute("SELECT @@SESSION.DEFAULT_WEEK_FORMAT AS v");
        expect(sessionRows[0].v).toBe(globalRows[0].v);
      } finally {
        await testAdapter.close();
      }
    });

    it("logs name show variable", async () => {
      await adapter.materializeTransactions();
      const logged: Array<[string, string]> = [];
      const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
        logged.push([event.payload.sql as string, event.payload.name as string]);
      });
      try {
        await adapter.showVariable("foo");
        expect(logged[0]?.[1]).toBe("SCHEMA");
      } finally {
        Notifications.unsubscribe(sub);
      }
    });

    it.skip("logs name rename column for alter", () => {
      // BLOCKED: renameColumnForAlter() returns a SQL fragment (for bulk ALTER) and doesn't
      //   fire sql.active_record notifications; the SHOW CREATE TABLE path (old MySQL/MariaDB)
      //   needs to call execute() with name "SCHEMA" — not yet implemented.
    });

    it("version string", async () => {
      const spy = vi.spyOn(adapter, "getFullVersion");
      spy.mockResolvedValueOnce("8.0.35-0ubuntu0.22.04.1");
      expect((await adapter.getDatabaseVersion()).toString()).toBe("8.0.35");

      // Clear the cache so the second stub is not masked by the first result.
      (adapter as any)._databaseVersion = null;
      spy.mockResolvedValueOnce("5.7.0");
      expect((await adapter.getDatabaseVersion()).toString()).toBe("5.7.0");
    });

    it("version string with mariadb", async () => {
      vi.spyOn(adapter, "getFullVersion").mockResolvedValueOnce(
        "5.5.5-10.6.5-MariaDB-1:10.6.5+maria~focal",
      );
      expect((await adapter.getDatabaseVersion()).toString()).toBe("10.6.5");
    });

    it("version string invalid", async () => {
      const spy = vi.spyOn(adapter, "getFullVersion");
      const assertVersionError = async (version: string | null, expectedMsg: string) => {
        spy.mockResolvedValueOnce(version as string);
        let caughtErr: unknown;
        try {
          await adapter.getDatabaseVersion();
        } catch (e) {
          caughtErr = e;
        }
        expect(caughtErr).toBeInstanceOf(DatabaseVersionError);
        expect((caughtErr as DatabaseVersionError).message).toBe(expectedMsg);
      };

      await assertVersionError(
        "some-database-proxy",
        'Unable to parse MySQL version from "some-database-proxy"',
      );
      await assertVersionError("", 'Unable to parse MySQL version from ""');
      await assertVersionError(null, "Unable to parse MySQL version from nil");
    });

    it("get and release advisory lock", async () => {
      const lockName = "test lock'n'name";

      const gotLock = await adapter.getAdvisoryLock(lockName);
      expect(gotLock).toBe(true);

      const isFree = await adapter.selectValue(`SELECT IS_FREE_LOCK(${adapter.quote(lockName)})`);
      expect(isFree).toBe(0);

      const released = await adapter.releaseAdvisoryLock(lockName);
      expect(released).toBe(true);

      const isFreeAfter = await adapter.selectValue(
        `SELECT IS_FREE_LOCK(${adapter.quote(lockName)})`,
      );
      expect(isFreeAfter).toBe(1);
    });

    it("release non existent advisory lock", async () => {
      const lockName = "fake lock'n'name";
      const released = await adapter.releaseAdvisoryLock(lockName);
      expect(released).toBe(false);
    });
  });
});
