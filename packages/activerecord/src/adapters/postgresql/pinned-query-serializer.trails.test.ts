/**
 * White-box unit tests for PostgreSQLAdapter's pinned-client query serializer
 * (`_serializePinnedQuery`) — a trails-only primitive with no Rails counterpart.
 *
 * The serializer is a promise-chain mutex sharing the adapter's single
 * `_maintenanceTail` so no two `client.query` calls on the pinned `pg.Client`
 * ever overlap on the wire (the fix for the write-path idle-in-transaction hang;
 * see the method's doc comment). These tests exercise the primitive directly
 * against a fake pinned client, so they need no live PostgreSQL server and run
 * on every CI adapter — the concurrency invariants are pure promise logic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";

// The private surface we reach into. Constructing the adapter never opens a
// socket (the constructor only stores config), so a dummy URL is fine.
interface SerializerHarness {
  _rawConnection: unknown;
  _maintenanceTail: Promise<void>;
  _serializePinnedQuery<R>(client: unknown, fn: () => Promise<R>): Promise<R>;
  _enqueueMaintenance(fn: () => Promise<unknown>): Promise<void>;
}

function makeAdapter(): { adapter: SerializerHarness; pinned: { query: () => Promise<unknown> } } {
  const adapter = new PostgreSQLAdapter(
    "postgres://localhost:5432/rails_js_test",
  ) as unknown as SerializerHarness;
  // A minimal fake pinned client. The `_rawConnection` setter registers a
  // dealloc serializer closure over it but never invokes it here.
  const pinned = { query: async () => ({ rows: [] }) };
  adapter._rawConnection = pinned;
  return { adapter, pinned };
}

const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("PostgreSQLAdapter pinned-client query serializer", () => {
  let adapter: SerializerHarness;
  let pinned: { query: () => Promise<unknown> };

  beforeEach(() => {
    ({ adapter, pinned } = makeAdapter());
  });

  it("never runs two queries on the pinned client concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const run = (id: number, ms: number): Promise<number> =>
      adapter._serializePinnedQuery(pinned, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await tick(ms);
        active -= 1;
        return id;
      });

    // Fire many overlapping calls; the mutex must collapse them to one in
    // flight at a time and preserve submission order.
    const ids = [...Array(12)].map((_, i) => i);
    const results = await Promise.all(ids.map((i) => run(i, (12 - i) % 5)));

    expect(maxActive).toBe(1);
    expect(results).toEqual(ids);
  });

  it("serializes user queries against maintenance ops on the same tail", async () => {
    const order: string[] = [];
    // Enqueue a maintenance op, then a query, then another maintenance op.
    // All three chain onto _maintenanceTail, so they must run in FIFO order
    // with no interleaving.
    const m1 = adapter._enqueueMaintenance(async () => {
      await tick(4);
      order.push("m1");
    });
    const q = adapter._serializePinnedQuery(pinned, async () => {
      await tick(2);
      order.push("q");
    });
    const m2 = adapter._enqueueMaintenance(async () => {
      order.push("m2");
    });
    await Promise.all([m1, q, m2]);
    expect(order).toEqual(["m1", "q", "m2"]);
  });

  it("re-acquires sequentially without self-deadlock (retry-style)", async () => {
    // Mirrors `_runQuery`'s cached-plan retry: attempt() runs, releases the
    // gate, then attempt() runs again. Because the gate is released before the
    // first call returns, the second acquisition never awaits its own
    // outstanding promise.
    let attempts = 0;
    const attempt = (): Promise<number> =>
      adapter._serializePinnedQuery(pinned, async () => {
        attempts += 1;
        await tick(1);
        return attempts;
      });
    await attempt();
    const second = await attempt();
    expect(second).toBe(2);
  });

  it("keeps the shared tail non-rejecting after a failing query (drain-safe)", async () => {
    // Drain barriers (`await this._maintenanceTail`) do a bare await with no
    // catch, so a rejected in-flight query must not poison the tail.
    await adapter
      ._serializePinnedQuery(pinned, async () => {
        throw new Error("boom");
      })
      .catch(() => {});
    // A subsequent query still runs, and the tail resolves cleanly.
    const ok = await adapter._serializePinnedQuery(pinned, async () => 42);
    expect(ok).toBe(42);
    await expect(adapter._maintenanceTail).resolves.toBeUndefined();
  });

  it("bypasses the mutex for a non-pinned (configure-time) client", async () => {
    // Configure-time queries run on a not-yet-published client
    // (client !== _rawConnection) and must run direct — chaining them onto the
    // shared tail during connect/reset would deadlock the reset barrier.
    const other = { query: async () => ({ rows: [] }) };
    let ran = false;
    // Park a never-settling op on the tail; a pinned query would block on it,
    // but a non-pinned query must ignore the tail entirely.
    adapter._maintenanceTail = new Promise<void>(() => {});
    await adapter._serializePinnedQuery(other, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
