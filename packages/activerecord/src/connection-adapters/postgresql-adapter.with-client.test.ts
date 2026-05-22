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

  it("serializes the initial connect so concurrent callers share one pg.Client", async () => {
    // Repro for the race Copilot flagged: two concurrent _acquireFreshClient
    // callers can both see _rawConnection == null and each open a pg.Client.
    // The shared `_acquiring` promise must converge them on a single open.
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
    // Stub pg.Client so each `new pg.Client()` returns our fake and
    // we count how many times connect() runs. Cast through `unknown` —
    // vi.spyOn doesn't infer constructor signatures, and we want a
    // plain factory here, not a class.
    const pgModule = (await import("pg")).default;
    vi.spyOn(pgModule, "Client" as never).mockImplementation((() => fakeClient) as never);
    // Bypass _maybeConfigureConnection's SET queries.
    vi.spyOn(
      adapter as unknown as { _maybeConfigureConnection: () => Promise<void> },
      "_maybeConfigureConnection",
    ).mockResolvedValue(undefined);

    const calls = Array.from({ length: 5 }, () => adapter._acquireFreshClient());
    // Release the gate after all 5 callers are queued behind _acquiring.
    await Promise.resolve();
    resolveConnect!();
    const clients = await Promise.all(calls);

    expect(openCount).toBe(1);
    for (const c of clients) expect(c).toBe(fakeClient);
  });
});
