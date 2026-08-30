import { afterEach, describe, expect, it, vi } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";

interface PrivatePgAdapter {
  _rawConnection: unknown;
  _client: unknown;
  _readyForQueryStatus: string;
  _acquireFreshClient: () => Promise<unknown>;
  reconnect: () => void;
  resetBang: () => void;
  lock: { synchronize: <T>(fn: () => Promise<T> | T) => Promise<T> };
  close: () => Promise<void>;
  isConnected: () => boolean;
}

describe("PostgreSQLAdapter#getClient (single persistent connection)", () => {
  let adapter: PrivatePgAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  it("routes every concurrent caller to the same persistent client", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    const persistentClient = {
      query: async () => ({ rows: [], fields: [] }),
    };
    adapter._rawConnection = persistentClient;
    vi.spyOn(adapter, "_acquireFreshClient").mockResolvedValue(persistentClient);

    const work = Array.from({ length: 11 }, () => adapter._acquireFreshClient());
    const seen = await Promise.all(work);

    expect(seen).toHaveLength(11);
    for (const c of seen) expect(c).toBe(persistentClient);
  });

  it("reuses the persistent client whether or not a TX is active", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;
    const persistentClient = { query: async () => ({ rows: [], fields: [] }) };
    adapter._rawConnection = persistentClient;
    vi.spyOn(adapter, "_acquireFreshClient").mockResolvedValue(persistentClient);

    adapter._client = null;
    expect(await adapter._acquireFreshClient()).toBe(persistentClient);

    adapter._client = persistentClient;
    expect(await adapter._acquireFreshClient()).toBe(persistentClient);
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
    };
    adapter._rawConnection = fakeClient;
    adapter._client = fakeClient;
    adapter._readyForQueryStatus = "T";

    vi.spyOn(
      adapter as unknown as { _maybeConfigureConnection: () => Promise<void> },
      "_maybeConfigureConnection",
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

  it("serializes the initial connect so concurrent callers share one pg.Client", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    let openCount = 0;
    let resolveConnect: (() => void) | null = null;
    const connectGate = new Promise<void>((r) => {
      resolveConnect = r;
    });
    const fakeClient = {
      query: async () => ({ rows: [], fields: [] }),
      connect: async () => {
        openCount++;
        await connectGate;
      },
      end: async () => {},
      on: () => fakeClient,
    };
    const pgModule = (await import("pg")).default;
    vi.spyOn(pgModule, "Client" as never).mockImplementation((() => fakeClient) as never);
    vi.spyOn(
      adapter as unknown as { _maybeConfigureConnection: () => Promise<void> },
      "_maybeConfigureConnection",
    ).mockResolvedValue(undefined);

    const calls = Array.from({ length: 5 }, () => adapter._acquireFreshClient());
    await Promise.resolve();
    resolveConnect!();
    const clients = await Promise.all(calls);

    expect(openCount).toBe(1);
    for (const c of clients) expect(c).toBe(fakeClient);
  });
});
