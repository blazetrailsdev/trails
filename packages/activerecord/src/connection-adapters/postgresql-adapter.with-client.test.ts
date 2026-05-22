/**
 * PostgreSQLAdapter#withClient — single persistent connection.
 *
 * After the dual-pool collapse the adapter owns one pg.Client for its
 * lifetime. Every withClient caller — inside or outside a transaction,
 * sequential or under Promise.all — uses the same connection; pg.Client
 * serializes concurrent query() calls on its socket, so a logical TX
 * can no longer fan across multiple sockets (root cause of #2253).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";

interface PrivatePgAdapter {
  _rawConnection: unknown;
  _client: unknown;
  withClient: <T>(fn: (client: unknown) => Promise<T>) => Promise<T>;
  _acquireFreshClient: () => Promise<unknown>;
  close: () => Promise<void>;
}

describe("PostgreSQLAdapter#withClient (single persistent connection)", () => {
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
    // Pretend the lazy acquire has already opened the connection so the
    // test exercises withClient without touching the real network.
    adapter._rawConnection = persistentClient;
    vi.spyOn(adapter, "_acquireFreshClient").mockResolvedValue(persistentClient);

    const seen: unknown[] = [];
    const work = Array.from({ length: 11 }, (_, i) =>
      adapter.withClient(async (client) => {
        await Promise.resolve();
        seen.push(client);
        return i;
      }),
    );
    const results = await Promise.all(work);

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(seen).toHaveLength(11);
    for (const c of seen) expect(c).toBe(persistentClient);
  });

  it("reuses the persistent client whether or not a TX is active", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;
    const persistentClient = { query: async () => ({ rows: [], fields: [] }) };
    adapter._rawConnection = persistentClient;
    vi.spyOn(adapter, "_acquireFreshClient").mockResolvedValue(persistentClient);

    // No TX active.
    adapter._client = null;
    let observed = await adapter.withClient(async (client) => client);
    expect(observed).toBe(persistentClient);

    // TX active — _client points at the same persistent client.
    adapter._client = persistentClient;
    observed = await adapter.withClient(async (client) => client);
    expect(observed).toBe(persistentClient);
  });
});
