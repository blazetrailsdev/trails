import { afterEach, describe, expect, it, vi } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { pgConnection } from "../pg/connection.js";

interface PrivatePgAdapter {
  _rawConnection: unknown;
  reconnect: () => void;
  resetBang: () => void;
  lock: { synchronize: <T>(fn: () => Promise<T> | T) => Promise<T> };
  disconnectBang: () => Promise<void>;
  isConnected: () => boolean;
}

describe("PostgreSQLAdapter#getClient (single persistent connection)", () => {
  let adapter: PrivatePgAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.disconnectBang().catch(() => undefined);
  });

  it("isConnected() reflects the raw pg.Client finished? state", () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    adapter._rawConnection = { _queryable: true, _ending: false, _ended: false };
    expect(adapter.isConnected()).toBe(true);

    adapter._rawConnection = { _ending: true };
    expect(adapter.isConnected()).toBe(false);
    adapter._rawConnection = { _ended: true };
    expect(adapter.isConnected()).toBe(false);

    adapter._rawConnection = { _queryable: false };
    expect(adapter.isConnected()).toBe(true);
    adapter._rawConnection = { _connectionError: true };
    expect(adapter.isConnected()).toBe(true);

    adapter._rawConnection = null;
    expect(adapter.isConnected()).toBe(false);
  });

  it("resetBang runs ROLLBACK + DISCARD ALL + reconfigure under one lock", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    const order: string[] = [];
    let resolveDiscard!: () => void;
    const discardGate = new Promise<void>((r) => {
      resolveDiscard = r;
    });

    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        order.push(sql);
        if (sql === "DISCARD ALL") {
          await discardGate;
          order.push("discard-end");
        }
        return { rows: [], fields: [] };
      }),
      end: async () => {},
      on: () => fakeClient,
      connection: {
        on: (event: string, listener: (message: { status: string }) => void) => {
          if (event === "readyForQuery") listener({ status: "T" });
        },
      },
    };
    adapter._rawConnection = pgConnection(fakeClient);

    vi.spyOn(
      adapter as unknown as { configureConnection: () => Promise<void> },
      "configureConnection",
    ).mockResolvedValue(undefined);

    adapter.resetBang();

    const foreign = adapter.lock.synchronize(() => {
      order.push("foreign");
    });

    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(order).toEqual(["ROLLBACK", "DISCARD ALL"]);

    resolveDiscard();
    await foreign;

    expect(order).toEqual(["ROLLBACK", "DISCARD ALL", "discard-end", "foreign"]);
  });
});
