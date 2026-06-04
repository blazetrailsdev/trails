/**
 * PostgreSQLAdapter routing through the base withRawConnection retry loop
 * via rawConnectionForBlock().
 *
 * Phase 1 of restoring Rails fidelity: PG no longer overrides
 * withRawConnection; instead it overrides rawConnectionForBlock() so the
 * base loop's deadlock/lock-timeout retry, connection-error reconnect,
 * _lockQueue serialization and verifyBang() guard all apply.
 *
 * These tests stub getClient() so no real Postgres is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionNotEstablished, Deadlocked, LockWaitTimeout } from "../errors.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

interface PrivatePgAdapter {
  _rawConnection: unknown;
  getClient: () => Promise<unknown>;
  reconnect: () => void;
  close: () => Promise<void>;
}

function makeAdapter(): { adapter: PostgreSQLAdapter; priv: PrivatePgAdapter } {
  const adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  const priv = adapter as unknown as PrivatePgAdapter;
  return { adapter, priv };
}

describe("PostgreSQLAdapter#withRawConnection via rawConnectionForBlock", () => {
  let adapter: PostgreSQLAdapter;
  let priv: PrivatePgAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  describe("Deadlocked retry through base loop", () => {
    beforeEach(() => {
      ({ adapter, priv } = makeAdapter());
    });

    it("retries once on Deadlocked and returns on success", async () => {
      const deadlocked = new Deadlocked("deadlock detected");
      vi.spyOn(priv, "getClient").mockResolvedValue({ release: () => {} });
      // Prevent actual 100ms backoff delay in tests.
      vi.spyOn(adapter, "backoff").mockResolvedValue(undefined);

      let blockCalls = 0;
      const result = await adapter.withRawConnection(
        { allowRetry: true, materializeTransactions: false },
        async () => {
          if (++blockCalls === 1) throw deadlocked;
          return "ok";
        },
      );

      expect(result).toBe("ok");
      expect(blockCalls).toBe(2);
    });

    it("retries once on LockWaitTimeout and returns on success", async () => {
      const lockTimeout = new LockWaitTimeout("lock wait timeout");
      let callCount = 0;
      const fakeClient = {
        query: vi.fn(async () => {
          if (++callCount === 1) throw lockTimeout;
          return { rows: [], fields: [] };
        }),
        release: () => {},
      };
      vi.spyOn(priv, "getClient").mockResolvedValue(fakeClient);
      vi.spyOn(adapter, "backoff").mockResolvedValue(undefined);

      let blockCalls = 0;
      const result = await adapter.withRawConnection(
        { allowRetry: true, materializeTransactions: false },
        async (_conn) => {
          blockCalls++;
          if (blockCalls === 1) throw lockTimeout;
          return "done";
        },
      );

      expect(result).toBe("done");
      expect(blockCalls).toBe(2);
    });

    it("re-throws after exhausting retries", async () => {
      const deadlocked = new Deadlocked("deadlock detected");
      vi.spyOn(priv, "getClient").mockResolvedValue({
        query: async () => {},
        release: () => {},
      });
      vi.spyOn(adapter, "backoff").mockResolvedValue(undefined);

      // connectionRetries defaults to 1; throw on every attempt.
      let calls = 0;
      await expect(
        adapter.withRawConnection(
          { allowRetry: true, materializeTransactions: false },
          async () => {
            calls++;
            throw deadlocked;
          },
        ),
      ).rejects.toThrow(deadlocked);
      // initial attempt + 1 retry = 2 total
      expect(calls).toBe(2);
    });
  });

  describe("Connection error triggers reconnect and recycles pg.Client", () => {
    beforeEach(() => {
      ({ adapter, priv } = makeAdapter());
    });

    it("re-acquires a fresh client after ConnectionNotEstablished", async () => {
      const connErr = new ConnectionNotEstablished("connection lost");
      const firstClient = { id: 1, release: () => {} };
      const secondClient = { id: 2, release: () => {} };

      let getClientCall = 0;
      vi.spyOn(priv, "getClient").mockImplementation(async () => {
        return ++getClientCall === 1 ? firstClient : secondClient;
      });

      // First block throws a connection error; second block returns the conn arg.
      let blockCalls = 0;
      const result = await adapter.withRawConnection(
        { allowRetry: true, materializeTransactions: false },
        async (conn) => {
          blockCalls++;
          if (blockCalls === 1) throw connErr;
          return conn;
        },
      );

      // Second block received the fresh (second) client.
      expect(result).toBe(secondClient);
      expect(blockCalls).toBe(2);
      // getClient() was called twice: once for the initial attempt, once after reconnect.
      expect(getClientCall).toBe(2);
    });

    it("rawConnectionForBlock() re-calls getClient() on each loop iteration", async () => {
      const clients: unknown[] = [];
      let getClientCall = 0;
      vi.spyOn(priv, "getClient").mockImplementation(async () => {
        const c = { id: ++getClientCall, release: () => {} };
        clients.push(c);
        return c;
      });

      // Each withRawConnection call should invoke rawConnectionForBlock() once.
      await adapter.withRawConnection({ materializeTransactions: false }, async () => "a");
      await adapter.withRawConnection({ materializeTransactions: false }, async () => "b");

      // Two sequential withRawConnection calls → two getClient() calls.
      expect(getClientCall).toBe(2);
    });
  });

  describe("_lockQueue serialization is preserved", () => {
    beforeEach(() => {
      ({ adapter, priv } = makeAdapter());
    });

    it("serializes concurrent withRawConnection calls through _lockQueue", async () => {
      vi.spyOn(priv, "getClient").mockResolvedValue({ release: () => {} });

      const order: number[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));

      const p1 = adapter.withRawConnection({ materializeTransactions: false }, async () => {
        order.push(1);
        await gate;
        order.push(2);
        return "a";
      });
      const p2 = adapter.withRawConnection({ materializeTransactions: false }, async () => {
        order.push(3);
        return "b";
      });

      release();
      expect(await Promise.all([p1, p2])).toEqual(["a", "b"]);
      expect(order).toEqual([1, 2, 3]);
    });
  });
});
