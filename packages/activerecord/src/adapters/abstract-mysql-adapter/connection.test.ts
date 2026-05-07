/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/connection_test.rb
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { NoDatabaseError, DatabaseVersionError } from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("ConnectionTest", () => {
    it("bad connection", async () => {
      const u = new URL(MYSQL_TEST_URL);
      u.pathname = "/inexistent_activerecord_unittest";
      const badAdapter = new Mysql2Adapter(u.toString());
      await expect(badAdapter.execute("SELECT 1")).rejects.toBeInstanceOf(NoDatabaseError);
      await badAdapter.close();
    });

    it.skip("no automatic reconnection after timeout", () => {
      // BLOCKED: Mysql2Adapter#active checks `_driverPool != null`, not socket liveness.
      // SCOPE: wire socket ping into Mysql2Adapter#active (connection-adapters/mysql2-adapter.ts).
    });
    it.skip("successful reconnection after timeout with manual reconnect", () => {
      // BLOCKED: reconnectBang() not implemented on Mysql2Adapter (no pool teardown + recreate).
      // SCOPE: store config in constructor; override reconnectBang() in mysql2-adapter.ts.
    });
    it.skip("successful reconnection after timeout with verify", () => {
      // BLOCKED: verifyBang() doesn't reconnect on Mysql2Adapter — same gap as reconnectBang().
    });
    it.skip("execute after disconnect reconnects", () => {
      // BLOCKED: _checkoutConn() throws when _driverPool is null; no lazy reconnect.
      // SCOPE: store config in constructor; recreate _driverPool in _checkoutConn() after disconnect.
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

    it.skip("wait timeout as string", () => {
      // BLOCKED: wait_timeout not wired into pool.on('connection') setup in mysql2-adapter.ts.
      // SCOPE: parse wait_timeout from config; emit `SET SESSION wait_timeout = N` alongside SET time_zone.
    });
    it.skip("wait timeout as url", () => {
      // BLOCKED: same as "wait timeout as string" — URL query param not parsed.
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
    it.skip("mysql default in strict mode", () => {
      // BLOCKED: configureConnection() doesn't set sql_mode/STRICT_ALL_TABLES in mysql2-adapter.ts.
      // SCOPE: implement configureConnection() to emit SET SESSION sql_mode = '...,STRICT_ALL_TABLES'.
    });
    it.skip("mysql strict mode disabled", () => {
      // BLOCKED: strict: false config not wired — same gap as "mysql default in strict mode".
    });
    it.skip("mysql strict mode specified default", () => {
      // BLOCKED: strict: :default config not wired — same gap as "mysql default in strict mode".
    });
    it.skip("mysql sql mode variable overrides strict mode", () => {
      // BLOCKED: variables config hash not wired into pool.on('connection') in mysql2-adapter.ts.
      // SCOPE: parse variables; emit SET SESSION for each key alongside SET time_zone.
    });
    it.skip("passing arbitrary flags to adapter", () => {
      // BLOCKED: pool model has no single raw_connection; flags on query_options not accessible.
      // SCOPE: expose query_options via a test accessor or pool config read-back.
    });
    it.skip("passing flags by array to adapter", () => {
      // BLOCKED: same as "passing arbitrary flags to adapter".
    });
    it.skip("mysql set session variable", () => {
      // BLOCKED: variables config not wired — same gap as "mysql sql mode variable overrides".
    });
    it.skip("mysql set session variable to default", () => {
      // BLOCKED: same as "mysql set session variable".
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
