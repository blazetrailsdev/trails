import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";
import {
  NoDatabaseError,
  DatabaseConnectionError,
  ConnectionNotEstablished,
} from "../../errors.js";
import mysql from "mysql2/promise";

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
      const a = new Mysql2Adapter({ uri: "mysql://root@localhost/no_such_db" });
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
      const a = new Mysql2Adapter({ uri: "mysql://myuser:pw@localhost/test" });
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
      const a = new Mysql2Adapter({ uri: "mysql://root@myhost.example.com/test" });
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
      const a = new Mysql2Adapter({ uri: MYSQL_TEST_URL });
      stubCreateConnection(makeDriverError(9999, "something went wrong"));
      try {
        await expect(a.execute("SELECT 1")).rejects.toBeInstanceOf(ConnectionNotEstablished);
      } finally {
        await a.disconnectBang();
      }
    });
  });
});
