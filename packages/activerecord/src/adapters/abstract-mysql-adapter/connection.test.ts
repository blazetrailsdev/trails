import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assert,
  assertEmpty,
  assertNotPredicate,
  assertPredicate,
  assertRaises,
  Notifications,
} from "@blazetrails/activesupport";
import { ARUnit2Model } from "../../test-helpers/models/arunit2-model.js";
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
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

function clearVersionCache(adapter: Mysql2Adapter): void {
  (
    adapter.pool as unknown as { poolConfig: { setServerVersion: (v: unknown) => void } }
  ).poolConfig.setServerVersion(null);
}

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
    clearVersionCache(adapter);
    await adapter.verifyBang();
  });

  describe("ConnectionTest", () => {
    it("bad connection", async () => {
      const u = new URL(MYSQL_TEST_URL);
      u.pathname = "/inexistent_activerecord_unittest";
      const badAdapter = new Mysql2Adapter(u.toString());
      try {
        await assertRaises([NoDatabaseError], {}, () =>
          badAdapter.dropTable("ex", { ifExists: true }),
        );
      } finally {
        await badAdapter.disconnectBang();
      }
    });

    it.skipIf(isMariaDb)(
      "no automatic reconnection after timeout",
      async () => {
        const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
        try {
          await singleConn.execute("SET SESSION wait_timeout=1");
          assertPredicate(await singleConn.active(), (v) => v);
          await new Promise((r) => setTimeout(r, 2000));
          assertNotPredicate(await singleConn.active(), (v) => v);
        } finally {
          await singleConn.disconnectBang();
        }
      },
      10_000,
    );
    it("successful reconnection after timeout with manual reconnect", async () => {
      const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        await singleConn.execute("SET SESSION wait_timeout=1");
        assertPredicate(await singleConn.active(), (v) => v);
        await new Promise((r) => setTimeout(r, 2000));
        await singleConn.reconnectBang();
        assertPredicate(await singleConn.active(), (v) => v);
      } finally {
        await singleConn.disconnectBang();
      }
    }, 10_000);
    it("successful reconnection after timeout with verify", async () => {
      const singleConn = new Mysql2Adapter({ uri: MYSQL_TEST_URL, connectionLimit: 1 });
      try {
        await singleConn.execute("SET SESSION wait_timeout=1");
        assertPredicate(await singleConn.active(), (v) => v);
        await new Promise((r) => setTimeout(r, 2000));
        await singleConn.verifyBang();
        assertPredicate(await singleConn.active(), (v) => v);
      } finally {
        await singleConn.disconnectBang();
      }
    }, 10_000);
    it("execute after disconnect reconnects", async () => {
      await adapter.disconnectBang();
      const result = (await adapter.execute("SELECT 1+2 AS v")) as Mysql2RawResult;
      expect(result.rows![0][0]).toBe(3);
    });

    it("quote after disconnect reconnects", async () => {
      await adapter.disconnectBang();
      expect(adapter.quote("string")).toBe("'string'");
    });

    it("active after disconnect", async () => {
      await adapter.disconnectBang();
      expect(await adapter.active()).toBe(false);
    });

    it("active after discard", async () => {
      await adapter.execute("SELECT 1");
      const socket = (
        adapter._clientForTest() as unknown as {
          connection?: { stream?: { destroy?: () => void } };
        }
      )?.connection?.stream;
      expect(await adapter.active()).toBe(true);
      adapter.discardBang();
      expect(await adapter.active()).toBe(false);
      socket?.destroy?.();
    });

    it("discard abandons the raw connection without closing it", async () => {
      await adapter.execute("SELECT 1");
      const raw = adapter._clientForTest();
      expect(raw).not.toBeNull();
      const endSpy = vi.spyOn(raw as { end: () => Promise<void> }, "end");
      const socket = (
        raw as unknown as {
          stream?: { destroy?: () => void };
          connection?: { stream?: { destroy?: () => void } };
        }
      )?.connection?.stream;
      try {
        adapter.discardBang();
        expect(endSpy).not.toHaveBeenCalled();
        expect(await adapter.active()).toBe(false);
      } finally {
        socket?.destroy?.();
      }
    });

    it("wait timeout as string", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, waitTimeout: "60" });
      try {
        const result = (await testAdapter.execute(
          "SELECT @@SESSION.wait_timeout AS v",
        )) as Mysql2RawResult;
        expect(parseInt(result.rows![0][0] as string, 10)).toBe(60);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("wait timeout as url", async () => {
      const url = new URL(MYSQL_TEST_URL);
      url.searchParams.set("wait_timeout", "60");
      const testAdapter = new Mysql2Adapter(url.toString());
      try {
        const result = (await testAdapter.execute(
          "SELECT @@SESSION.wait_timeout AS v",
        )) as Mysql2RawResult;
        expect(parseInt(result.rows![0][0] as string, 10)).toBe(60);
      } finally {
        await testAdapter.disconnectBang();
      }
    });

    it("character set connection is configured", async () => {
      const connection = new Mysql2Adapter({ uri: MYSQL_TEST_URL, encoding: "cp932" });
      try {
        expect(await connection.showVariable("character_set_client")).toBe("cp932");
        expect(await connection.showVariable("character_set_results")).toBe("cp932");
        expect(await connection.showVariable("character_set_connection")).toBe("cp932");
        expect(await connection.showVariable("collation_connection")).toBe("cp932_japanese_ci");

        expect(await connection.queryValue("SELECT 'こんにちは'")).toBe("こんにちは");
      } finally {
        await connection.disconnectBang();
      }
    });

    it("collation connection is configured", async () => {
      expect(await adapter.showVariable("collation_connection")).toBe("utf8mb4_unicode_ci");
      expect(await adapter.queryValue("SELECT 'こんにちは' = 'コンニチハ'")).toBe(1);

      const arunit2 = (await ARUnit2Model.leaseConnection()) as unknown as Mysql2Adapter;
      expect(await arunit2.showVariable("collation_connection")).toBe("utf8mb4_general_ci");
      expect(await arunit2.queryValue("SELECT 'こんにちは' = 'コンニチハ'")).toBe(0);
    });
    it("mysql default in strict mode", async () => {
      const result = (await adapter.execute("SELECT @@SESSION.sql_mode AS v")) as Mysql2RawResult;
      expect(String(result.rows![0][0])).toMatch(/STRICT_ALL_TABLES/);
    });
    it("mysql strict mode disabled", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, strict: false });
      try {
        const result = (await testAdapter.execute(
          "SELECT @@SESSION.sql_mode AS v",
        )) as Mysql2RawResult;
        expect(String(result.rows![0][0])).not.toMatch(/STRICT_ALL_TABLES/);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("mysql strict mode specified default", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, strict: ":default" });
      try {
        const globalResult = (await testAdapter.execute(
          "SELECT @@GLOBAL.sql_mode AS v",
        )) as Mysql2RawResult;
        const sessionResult = (await testAdapter.execute(
          "SELECT @@SESSION.sql_mode AS v",
        )) as Mysql2RawResult;
        expect(sessionResult.rows![0][0]).toBe(globalResult.rows![0][0]);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("mysql sql mode variable overrides strict mode", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        variables: { sql_mode: "ansi" },
      });
      try {
        const result = (await testAdapter.execute(
          "SELECT @@SESSION.sql_mode AS v",
        )) as Mysql2RawResult;
        expect(String(result.rows![0][0])).not.toMatch(/STRICT_ALL_TABLES/);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("passing arbitrary flags to adapter", async () => {
      const testAdapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, flags: ["COMPRESS"] });
      try {
        expect(testAdapter._testOnlyPoolFlags()).toEqual(["COMPRESS", "FOUND_ROWS"]);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("passing flags by array to adapter", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        flags: ["FOUND_ROWS", "COMPRESS"],
      });
      try {
        expect(testAdapter._testOnlyPoolFlags()).toEqual(["FOUND_ROWS", "COMPRESS"]);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("mysql set session variable", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        variables: { default_week_format: 3 },
      });
      try {
        const result = (await testAdapter.execute(
          "SELECT @@SESSION.DEFAULT_WEEK_FORMAT AS v",
        )) as Mysql2RawResult;
        expect(parseInt(result.rows![0][0] as string, 10)).toBe(3);
      } finally {
        await testAdapter.disconnectBang();
      }
    });
    it("mysql set session variable to default", async () => {
      const testAdapter = new Mysql2Adapter({
        uri: MYSQL_TEST_URL,
        variables: { default_week_format: ":default" },
      });
      try {
        const globalResult = (await testAdapter.execute(
          "SELECT @@GLOBAL.DEFAULT_WEEK_FORMAT AS v",
        )) as Mysql2RawResult;
        const sessionResult = (await testAdapter.execute(
          "SELECT @@SESSION.DEFAULT_WEEK_FORMAT AS v",
        )) as Mysql2RawResult;
        expect(sessionResult.rows![0][0]).toBe(globalResult.rows![0][0]);
      } finally {
        await testAdapter.disconnectBang();
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
      const logged: Array<[string, string]> = [];
      const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
        logged.push([event.payload.sql as string, event.payload.name as string]);
      });
      try {
        await adapter.renameColumnForAlter("bar_baz", "foo", "foo2");
        if (await adapter.supportsRenameColumn()) {
          assertEmpty(logged);
        } else {
          expect(logged[0][1]).toBe("SCHEMA");
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

      clearVersionCache(adapter);
      spy.mockResolvedValueOnce("some-database-proxy");
      let error = await assertRaises([DatabaseVersionError], {}, () =>
        adapter.getDatabaseVersion(),
      );
      expect(error.message).toBe('Unable to parse MySQL version from "some-database-proxy"');

      clearVersionCache(adapter);
      spy.mockResolvedValueOnce("");
      error = await assertRaises([DatabaseVersionError], {}, () => adapter.getDatabaseVersion());
      expect(error.message).toBe('Unable to parse MySQL version from ""');

      clearVersionCache(adapter);
      spy.mockResolvedValueOnce(null as unknown as string);
      error = await assertRaises([DatabaseVersionError], {}, () => adapter.getDatabaseVersion());
      expect(error.message).toBe("Unable to parse MySQL version from nil");
    });

    it("get and release advisory lock", async () => {
      const lockName = "test lock'n'name";

      const gotLock = await adapter.getAdvisoryLock(lockName);
      assert(gotLock, "get_advisory_lock should have returned true but it didn't");

      expect(
        await testLockFree(lockName),
        "expected the test advisory lock to be held but it wasn't",
      ).toBe(false);

      const releasedLock = await adapter.releaseAdvisoryLock(lockName);
      assert(releasedLock, "expected release_advisory_lock to return true but it didn't");

      assert(
        await testLockFree(lockName),
        "expected the test lock to be available after releasing",
      );
    });

    it("release non existent advisory lock", async () => {
      const lockName = "fake lock'n'name";
      const released = await adapter.releaseAdvisoryLock(lockName);
      expect(released).toBe(false);
    });

    async function testLockFree(lockName: string): Promise<boolean> {
      return (await adapter.selectValue(`SELECT IS_FREE_LOCK(${adapter.quote(lockName)})`)) === 1;
    }
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
      const a = new Mysql2Adapter("mysql://root@localhost/no_such_db");
      stubCreateConnection(makeDriverError(1049));
      try {
        await expect(a.execute("SELECT 1")).rejects.toBeInstanceOf(NoDatabaseError);
      } finally {
        await a.disconnectBang();
      }
    });

    it("maps ER_ACCESS_DENIED_ERROR (1045) to DatabaseConnectionError", async () => {
      const a = new Mysql2Adapter({ host: "localhost", user: "baduser", database: "test" });
      stubCreateConnection(makeDriverError(1045));
      try {
        const err = (await a.execute("SELECT 1").catch((e: Error) => e)) as Error;
        expect(err).toBeInstanceOf(DatabaseConnectionError);
        expect(err.message).toContain("baduser");
      } finally {
        await a.disconnectBang();
      }
    });

    it("maps ER_ACCESS_DENIED_ERROR via URI to DatabaseConnectionError with parsed username", async () => {
      const a = new Mysql2Adapter("mysql://myuser:pw@localhost/test");
      stubCreateConnection(makeDriverError(1045));
      try {
        const err = (await a.execute("SELECT 1").catch((e: Error) => e)) as Error;
        expect(err).toBeInstanceOf(DatabaseConnectionError);
        expect(err.message).toContain("myuser");
      } finally {
        await a.disconnectBang();
      }
    });

    it("maps ER_CONN_HOST_ERROR (2003) to DatabaseConnectionError with hostname", async () => {
      const a = new Mysql2Adapter("mysql://root@myhost.example.com/test");
      stubCreateConnection(makeDriverError(2003));
      try {
        const err = (await a.execute("SELECT 1").catch((e: Error) => e)) as Error;
        expect(err).toBeInstanceOf(DatabaseConnectionError);
        expect(err.message).toContain("myhost.example.com");
      } finally {
        await a.disconnectBang();
      }
    });

    it("maps unknown errno to ConnectionNotEstablished", async () => {
      const a = new Mysql2Adapter(MYSQL_TEST_URL);
      stubCreateConnection(makeDriverError(9999, "something went wrong"));
      try {
        await expect(a.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionNotEstablished);
      } finally {
        await a.disconnectBang();
      }
    });
  });
});
