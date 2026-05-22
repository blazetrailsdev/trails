/**
 * PostgreSQLAdapter#withClient — pinned-TX concurrency.
 *
 * Reproduces the race that fanned a single logical TX across multiple
 * pg.PoolClient sockets under `Promise.all` writes. The prior shape
 * snapshotted `txClient = this._client` and then `await this.getClient()`;
 * a concurrent caller could yield while `_client` was null mid-begin and
 * checkout a fresh pool client, producing PG `08P01` / `25P02` in live
 * traffic. The fix: read `_client` synchronously and dispatch without
 * yielding — under a pinned TX every caller reuses the TX-pinned client.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostgreSQLAdapter } from "./postgresql-adapter.js";

interface PrivatePgAdapter {
  _client: unknown;
  withClient: <T>(fn: (client: unknown) => Promise<T>) => Promise<T>;
  getClient: () => Promise<unknown>;
  close: () => Promise<void>;
}

describe("PostgreSQLAdapter#withClient under pinned TX", () => {
  let adapter: PrivatePgAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  it("routes every concurrent caller to the TX-pinned client and never releases it", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;

    let txReleaseCount = 0;
    const txClient = {
      query: async () => ({ rows: [], fields: [] }),
      release: () => {
        txReleaseCount++;
      },
    };
    // Simulate an active pinned transaction.
    adapter._client = txClient;

    // If withClient ever falls through to getClient, fail the test: under
    // a pinned TX the synchronous _client read must short-circuit.
    const getClientSpy = vi.spyOn(adapter, "getClient").mockImplementation(async () => {
      throw new Error("getClient must not be called when _client is set");
    });

    const seen: unknown[] = [];
    const work = Array.from({ length: 11 }, (_, i) =>
      adapter.withClient(async (client) => {
        // Yield once to interleave with siblings.
        await Promise.resolve();
        seen.push(client);
        return i;
      }),
    );
    const results = await Promise.all(work);

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(seen).toHaveLength(11);
    for (const c of seen) expect(c).toBe(txClient);
    expect(txReleaseCount).toBe(0);
    expect(getClientSpy).not.toHaveBeenCalled();
  });

  it("acquires and releases a fresh client when no TX is active", async () => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 }) as unknown as PrivatePgAdapter;
    adapter._client = null;

    let releaseCount = 0;
    const freshClient = {
      query: async () => ({ rows: [], fields: [] }),
      release: () => {
        releaseCount++;
      },
    };
    vi.spyOn(adapter, "getClient").mockResolvedValue(freshClient);

    const result = await adapter.withClient(async (client) => {
      expect(client).toBe(freshClient);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(releaseCount).toBe(1);
  });
});
