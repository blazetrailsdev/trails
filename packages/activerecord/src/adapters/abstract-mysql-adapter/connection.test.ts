/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/connection_test.rb
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import {
  describeIfMysqlAdapter,
  isMariaDb,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";
import {
  NoDatabaseError,
  DatabaseVersionError,
  DatabaseConnectionError,
  ConnectionNotEstablished,
} from "../../errors.js";
import mysql from "mysql2/promise";

// The leased connection memoizes the server version on first read, so the
// version tests below have to drop that memo both before stubbing (the real
// version is already cached) and after (their stubbed one must not outlive the
// test). Rails' @connection is likewise long-lived; its stubs re-run the query.
function clearVersionCache(adapter: Mysql2Adapter): void {
  (adapter as unknown as { _databaseVersion: unknown })._databaseVersion = null;
}

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
    // Several tests here disconnect/discard the leased connection (as Rails'
    // connection_test.rb does to `Base.lease_connection`); verify it back so the
    // next test in this worker gets a live one.
    clearVersionCache(adapter);
    await adapter.verifyBang();
  });

  describe("ConnectionTest", () => {
    it("bad connection", async () => {
      const u = new URL(MYSQL_TEST_URL);
      u.pathname = "/inexistent_activerecord_unittest";
      // Stays self-built: Rails builds this connection in-test too — it points
      // at a database that does not exist.
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
        // Stays self-built: connectionLimit:1 is what pins the wait_timeout to
        // the connection under test, and the server-side disconnect it provokes
        // must not land on the shared leased connection.
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
      // Stays self-built: connectionLimit:1 so SET SESSION wait_timeout and the
      // sleep share the same physical connection — otherwise a second pool
      // connection with the default wait_timeout could be used for the later
      // execute() — and the provoked disconnect must not hit the leased one.
      const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        expect(await singleConn.activeAsync()).toBe(true);
        await singleConn.execute("SET SESSION wait_timeout=1");
        await new Promise((r) => setTimeout(r, 2000));
        // Rails' reconnect! is synchronous; trails' reconnectBang is async, so
        // await it before reading the sync `active` getter — which now tracks
        // real connection state (`_client !== null`), only re-established once
        // reconnectBang's _ensureClient resolves.
        await singleConn.reconnectBang();
        expect(singleConn.active).toBe(true);
        await expect(singleConn.execute("SELECT 1")).resolves.toBeDefined();
      } finally {
        await singleConn.close();
      }
    }, 10_000);
    it("successful reconnection after timeout with verify", async () => {
      // Stays self-built: connectionLimit:1 so the session wait_timeout applies
      // to the same connection that activeAsync() and verifyBang() will use, and
      // the provoked server-side disconnect must not hit the leased one.
      const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        expect(await singleConn.activeAsync()).toBe(true);
        await singleConn.execute("SET SESSION wait_timeout=1");
        await new Promise((r) => setTimeout(r, 2000));
        // With connectionLimit:1 the pool has no spare slot to create a fresh
        // connection, so getConnection() returns the dead socket and ping() fails.
        // activeAsync() sets _activeState = false, making active return false.
        await singleConn.activeAsync();
        // active is false → verifyBang calls reconnectBang(). Await it (async in
        // trails, unlike Rails' synchronous verify!) before reading the sync
        // `active` getter, which now reflects `_client !== null`.
        await singleConn.verifyBang();
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

    it("active after disconnect", async () => {
      // Rails' @connection is a live pooled connection (raw_connection set), so
      // establish one here before disconnecting — the sync `active` getter now
      // tracks real connection state (`_client !== null`) like Rails' active?.
      await adapter.execute("SELECT 1");
      expect(adapter.active).toBe(true);
      adapter.disconnectBang();
      expect(adapter.active).toBe(false);
    });

    it("active after discard", async () => {
      await adapter.execute("SELECT 1");
      const socket = (
        adapter._clientForTest() as unknown as {
          connection?: { stream?: { destroy?: () => void } };
        }
      )?.connection?.stream;
      expect(adapter.active).toBe(true);
      adapter.discardBang();
      expect(adapter.active).toBe(false);
      // discardBang abandons the socket without closing it; free the fd.
      socket?.destroy?.();
    });

    it("discard abandons the raw connection without closing it", async () => {
      await adapter.execute("SELECT 1");
      const raw = adapter._clientForTest();
      expect(raw).not.toBeNull();
      const endSpy = vi.spyOn(raw as { end: () => Promise<void> }, "end");
      // Capture the socket: discardBang abandons it (unref'd, listeners
      // stripped) without end()ing, so destroy it directly to free the fd.
      const socket = (
        raw as unknown as {
          stream?: { destroy?: () => void };
          connection?: { stream?: { destroy?: () => void } };
        }
      )?.connection?.stream;
      try {
        adapter.discardBang();
        // Rails' discard! must not communicate with the server: the abandoned
        // handle is dropped without an end()/close() that would shut the socket.
        expect(endSpy).not.toHaveBeenCalled();
        expect(adapter.active).toBe(false);
      } finally {
        socket?.destroy?.();
      }
    });

    it("wait timeout as string", async () => {
      // Stays self-built: the `waitTimeout` config key is the assertion.
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
      // Stays self-built: an alternate config (wait_timeout in the URL) is the
      // assertion.
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

    it("collation connection is configured", async () => {
      const v = await adapter.showVariable("collation_connection");
      expect(v).not.toBeNull();
    });
    // Direct tests for the trails-only AbstractMysqlAdapter#setSessionVariable
    // helper. The Rails-named test_mysql_set_session_variable / _to_default
    // cases below exercise the `variables:` pool-init shape; these cover the
    // explicit-helper code path (identifier validation, DEFAULT handling,
    // emitted quoting). All three stay self-built: connectionLimit:1 is what
    // makes SET SESSION + SELECT land on the same pool connection (see the JSDoc
    // caveat), and the session variables must not leak onto the leased one.
    it("setSessionVariable helper sets a session variable", async () => {
      const a = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        await a.setSessionVariable("default_week_format", 3);
        const rows = await a.execute("SELECT @@SESSION.default_week_format AS v");
        expect(Number(rows[0].v)).toBe(3);
      } finally {
        await a.close();
      }
    });

    it("setSessionVariable helper with DEFAULT restores global", async () => {
      const a = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        const global = await a.execute("SELECT @@GLOBAL.default_week_format AS v");
        await a.setSessionVariable("default_week_format", 3);
        await a.setSessionVariable("default_week_format", "DEFAULT");
        const session = await a.execute("SELECT @@SESSION.default_week_format AS v");
        expect(session[0].v).toEqual(global[0].v);
      } finally {
        await a.close();
      }
    });

    it("setSessionVariable helper rejects invalid identifiers", async () => {
      const a = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        await expect(a.setSessionVariable("foo; DROP", 1)).rejects.toThrow(/invalid/);
      } finally {
        await a.close();
      }
    });

    it("mysql default in strict mode", async () => {
      const rows = await adapter.execute("SELECT @@SESSION.sql_mode AS v");
      expect(String(rows[0].v)).toMatch(/STRICT_ALL_TABLES/);
    });
    it("mysql strict mode disabled", async () => {
      // Stays self-built: a deliberately non-strict adapter.
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, strict: false });
      try {
        const rows = await testAdapter.execute("SELECT @@SESSION.sql_mode AS v");
        expect(String(rows[0].v)).not.toMatch(/STRICT_ALL_TABLES/);
      } finally {
        await testAdapter.close();
      }
    });
    it("mysql strict mode specified default", async () => {
      // Stays self-built: `strict: "default"` is the config under test.
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
      // Stays self-built: a `variables:` override must not leak onto the shared
      // leased connection.
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
    it("passing arbitrary flags to adapter", async () => {
      // mirrors Rails: flags.push "FOUND_ROWS" appended when not already present
      // Stays self-built: the connect flags it is constructed with are the assertion.
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, flags: ["COMPRESS"] });
      try {
        expect(testAdapter._testOnlyPoolFlags()).toEqual(["COMPRESS", "FOUND_ROWS"]);
      } finally {
        await testAdapter.close();
      }
    });
    it("passing flags by array to adapter", async () => {
      // mirrors Rails: FOUND_ROWS not duplicated when already present in the array
      // Stays self-built: the connect flags this adapter is constructed with
      // are the assertion.
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        flags: ["FOUND_ROWS", "COMPRESS"],
      });
      try {
        expect(testAdapter._testOnlyPoolFlags()).toEqual(["FOUND_ROWS", "COMPRESS"]);
      } finally {
        await testAdapter.close();
      }
    });
    it("mysql set session variable", async () => {
      // Stays self-built: a `variables:` override must not leak onto the shared
      // leased connection.
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
      // Stays self-built: a `variables:` override must not leak onto the shared
      // leased connection.
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

    it("logs name rename column for alter", async () => {
      await adapter.execute("DROP TABLE IF EXISTS `bar_baz`");
      await adapter.execute("CREATE TABLE `bar_baz` (`foo` varchar(255))");
      const names: string[] = [];
      const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
        names.push(event.payload.name as string);
      });
      try {
        await adapter.renameColumnForAlter("bar_baz", "foo", "foo2");
        if (adapter.supportsRenameColumn()) {
          expect(names).not.toContain("SCHEMA");
        } else {
          expect(names).toContain("SCHEMA");
        }
      } finally {
        Notifications.unsubscribe(sub);
        await adapter.execute("DROP TABLE IF EXISTS `bar_baz`");
      }
    });

    it("version string", async () => {
      const spy = vi.spyOn(adapter, "getFullVersion");
      clearVersionCache(adapter);
      spy.mockResolvedValueOnce("8.0.35-0ubuntu0.22.04.1");
      expect((await adapter.getDatabaseVersion()).toString()).toBe("8.0.35");

      clearVersionCache(adapter);
      spy.mockResolvedValueOnce("5.7.0");
      expect((await adapter.getDatabaseVersion()).toString()).toBe("5.7.0");
    });

    it("version string with mariadb", async () => {
      clearVersionCache(adapter);
      vi.spyOn(adapter, "getFullVersion").mockResolvedValueOnce(
        "5.5.5-10.6.5-MariaDB-1:10.6.5+maria~focal",
      );
      expect((await adapter.getDatabaseVersion()).toString()).toBe("10.6.5");
    });

    it("version string invalid", async () => {
      const spy = vi.spyOn(adapter, "getFullVersion");
      const assertVersionError = async (version: string | null, expectedMsg: string) => {
        clearVersionCache(adapter);
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

  describe("connect error translation", () => {
    function makeDriverError(errno: number, message = "driver error"): Error {
      const e = new Error(message) as Error & { errno: number; code: string };
      e.errno = errno;
      e.code = `ER_${errno}`;
      return e;
    }

    function stubCreateConnection(err: Error): void {
      vi.spyOn(mysql, "createConnection").mockRejectedValue(err);
    }

    afterEach(() => vi.restoreAllMocks());

    it("maps ER_BAD_DB_ERROR (1049) to NoDatabaseError", async () => {
      // Stays self-built: the config names a database that does not exist.
      const a = new Mysql2Adapter("mysql://root@localhost/no_such_db");
      stubCreateConnection(makeDriverError(1049));
      try {
        await expect(a.execute("SELECT 1")).rejects.toBeInstanceOf(NoDatabaseError);
      } finally {
        await a.close();
      }
    });

    it("maps ER_ACCESS_DENIED_ERROR (1045) to DatabaseConnectionError", async () => {
      // Stays self-built: the config names a user that cannot authenticate.
      const a = new Mysql2Adapter({ host: "localhost", user: "baduser", database: "test" });
      stubCreateConnection(makeDriverError(1045));
      try {
        const err = await a.execute("SELECT 1").catch((e) => e);
        expect(err).toBeInstanceOf(DatabaseConnectionError);
        expect(err.message).toContain("baduser");
      } finally {
        await a.close();
      }
    });

    it("maps ER_ACCESS_DENIED_ERROR via URI to DatabaseConnectionError with parsed username", async () => {
      // Stays self-built: the URI carries the bad username the error must name.
      const a = new Mysql2Adapter("mysql://myuser:pw@localhost/test");
      stubCreateConnection(makeDriverError(1045));
      try {
        const err = await a.execute("SELECT 1").catch((e) => e);
        expect(err).toBeInstanceOf(DatabaseConnectionError);
        expect(err.message).toContain("myuser");
      } finally {
        await a.close();
      }
    });

    it("maps ER_CONN_HOST_ERROR (2003) to DatabaseConnectionError with hostname", async () => {
      // Stays self-built: the URI carries the unreachable host the error must name.
      const a = new Mysql2Adapter("mysql://root@myhost.example.com/test");
      stubCreateConnection(makeDriverError(2003));
      try {
        const err = await a.execute("SELECT 1").catch((e) => e);
        expect(err).toBeInstanceOf(DatabaseConnectionError);
        expect(err.message).toContain("myhost.example.com");
      } finally {
        await a.close();
      }
    });

    it("maps unknown errno to ConnectionNotEstablished", async () => {
      // Stays self-built: the stubbed createConnection is only reached by an
      // adapter that has not connected yet — the leased one already has.
      const a = new Mysql2Adapter(MYSQL_TEST_URL);
      stubCreateConnection(makeDriverError(9999, "something went wrong"));
      try {
        await expect(a.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionNotEstablished);
      } finally {
        await a.close();
      }
    });
  });
});
