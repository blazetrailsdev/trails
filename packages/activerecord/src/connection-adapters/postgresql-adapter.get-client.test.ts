/**
 * PostgreSQLAdapter connection acquisition — single persistent connection.
 *
 * After the dual-pool collapse the adapter owns one pg.Client for its
 * lifetime. Every `_acquireFreshClient()` caller — inside or outside a
 * transaction, sequential or under Promise.all — uses the same connection;
 * pg.Client serializes concurrent query() calls on its socket, so a logical
 * TX can no longer fan across multiple sockets (root cause of #2253).
 *
 * Connection-error recovery routes through withRawConnection, whose retry
 * loop drives reconnectBang → the PG reconnect() override (which eagerly
 * re-acquires). The base loop yields `_connection` directly — opened eagerly
 * by connectBang() — with no per-iteration re-acquire. That recovery is
 * asserted by the unskipped Rails mirrors (adapter.test.ts +
 * adapters/postgresql/postgresql-adapter.test.ts reconnect cluster).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";

interface PrivatePgAdapter {
  _rawConnection: unknown;
  _client: unknown;
  _inFlightReset: Promise<void> | null;
  _acquireFreshClient: () => Promise<unknown>;
  reconnect: () => void;
  resetBang: () => void;
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
    // Pretend the lazy acquire has already opened the connection so the
    // test exercises getClient without touching the real network.
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

    // No TX active.
    adapter._client = null;
    expect(await adapter._acquireFreshClient()).toBe(persistentClient);

    // TX active — _client points at the same persistent client.
    adapter._client = persistentClient;
    expect(await adapter._acquireFreshClient()).toBe(persistentClient);
  });

  // Deterministic mirror of Rails' `connected?`
  // (`!(@raw_connection.nil? || @raw_connection.finished?)`): isConnected()
  // tracks node-pg's "finished" liveness flags, not just `_connection !== null`.
  it("isConnected() reflects the raw pg.Client finished? state", () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    adapter._rawConnection = { _queryable: true, _ending: false, _ended: false };
    expect(adapter.isConnected()).toBe(true);

    // Each node-pg "finished" signal independently flips connected? false.
    adapter._rawConnection = { _queryable: false };
    expect(adapter.isConnected()).toBe(false);
    adapter._rawConnection = { _ending: true };
    expect(adapter.isConnected()).toBe(false);
    adapter._rawConnection = { _ended: true };
    expect(adapter.isConnected()).toBe(false);
    adapter._rawConnection = { _connectionError: true };
    expect(adapter.isConnected()).toBe(false);

    // A nil raw connection is connected? false via the existing _connection guard.
    adapter._rawConnection = null;
    expect(adapter.isConnected()).toBe(false);
  });

  it("resetBang barrier: real _acquireFreshClient waits until DISCARD ALL resolves", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    const order: string[] = [];
    let resolveDiscard!: () => void;
    const discardGate = new Promise<void>((r) => {
      resolveDiscard = r;
    });

    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        if (sql === "DISCARD ALL") {
          order.push("discard-start");
          await discardGate;
          order.push("discard-end");
        }
        return { rows: [], fields: [] };
      }),
      end: async () => {},
      on: () => fakeClient,
    };
    // Pre-seed the connection so _doAcquire reuses it rather than
    // opening a new socket (avoids real network I/O).
    adapter._rawConnection = fakeClient;

    // resetBang() clears _connectionConfigured, so _acquireFreshClient
    // will call _maybeConfigureConnection via _doAcquire after the
    // barrier clears. Stub it to avoid real SET queries on the fake client.
    vi.spyOn(
      adapter as unknown as { _maybeConfigureConnection: () => Promise<void> },
      "_maybeConfigureConnection",
    ).mockResolvedValue(undefined);

    // Fire resetBang (sync) — sets _inFlightReset before returning.
    adapter.resetBang();
    expect(adapter._inFlightReset).not.toBeNull();

    // Concurrent acquire using the REAL _acquireFreshClient — must queue
    // behind the in-flight reset.
    const acquirePromise = adapter._acquireFreshClient().then((c) => {
      order.push("acquire-done");
      return c;
    });

    // Yield several microtask ticks; DISCARD ALL gate holds everything up.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(order).toEqual(["discard-start"]);

    // Release DISCARD ALL — the acquire should now proceed.
    resolveDiscard();
    await acquirePromise;

    expect(order).toEqual(["discard-start", "discard-end", "acquire-done"]);
    // Barrier is cleared after reset completes.
    expect(adapter._inFlightReset).toBeNull();
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
