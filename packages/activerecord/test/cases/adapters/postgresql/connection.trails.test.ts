import { it, expect, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_CONFIG } from "./test-helper.js";

describeIfPg("PostgresqlConnectionTest (trails)", () => {
  it("non-default minMessages is applied to connection", async () => {
    const a = new PostgreSQLAdapter({ ...PG_TEST_CONFIG, minMessages: "notice" });
    try {
      const level = await a.clientMinMessages();
      expect(level).toBe("notice");
    } finally {
      await a.disconnectBang();
    }
  });

  it("disconnectBang closes the persistent connection", async () => {
    const a = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
    await a.execute("SELECT 1");
    const conn = a._rawConnectionForTest();
    try {
      expect(await a.active()).toBe(true);
      expect(a.isConnected()).toBe(true);
      await a.disconnectBang();
      expect(await a.active()).toBe(false);
      expect(a.isConnected()).toBe(false);
    } finally {
      await conn?.close().catch(() => {});
    }
  });

  it("discardBang abandons the connection without closing the socket", async () => {
    const a = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
    await a.execute("SELECT 1");
    const conn = a._rawConnectionForTest();
    const endSpy = conn ? vi.spyOn(conn, "close") : null;
    const socket = (
      conn?.client as unknown as {
        connection?: { stream?: { destroy?: () => void } };
      }
    )?.connection?.stream;
    try {
      expect(await a.active()).toBe(true);
      await a.discardBang();
      expect(await a.active()).toBe(false);
      expect(a.isConnected()).toBe(false);
      expect(endSpy).not.toHaveBeenCalled();
    } finally {
      socket?.destroy?.();
    }
  });

  it("reconnect resets connection so queries work again", async () => {
    const a = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
    try {
      await a.reconnect();
      expect(await a.active()).toBe(true);
      const rows = Array.from(await a.execute("SELECT 1 AS n"));
      expect(rows[0]?.n).toBe("1");
    } finally {
      await a.disconnectBang();
    }
  });

  it("disconnectBang then reconnect restores query capability", async () => {
    const a = new PostgreSQLAdapter({ ...PG_TEST_CONFIG });
    try {
      await a.disconnectBang();
      expect(await a.active()).toBe(false);
      await a.reconnect();
      expect(await a.active()).toBe(true);
      const rows = Array.from(await a.execute("SELECT 2 AS n"));
      expect(rows[0]?.n).toBe("2");
    } finally {
      await a.disconnectBang();
    }
  });
});
