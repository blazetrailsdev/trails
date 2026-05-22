/**
 * Smoke test for {@link createPooledTestAdapter} (Phase B of the
 * connection-pool-epic). Verifies the pooled adapter wires through
 * `PoolConfig` + `ConnectionHandler` correctly and that
 * `pinConnectionBang` / `unpinConnectionBang` provide per-test isolation.
 *
 * Does NOT migrate any consumers — that's Phase C/D follow-up work.
 */
import { describe, it, expect, afterAll } from "vitest";

import { createPooledTestAdapter, _resetPooledTestAdapterForTests } from "../test-adapter.js";
import { withExecutionContext } from "../connection-adapters/abstract/connection-pool/execution-context.js";

type Execable = { exec(sql: string): Promise<void> };
const asExec = (a: unknown) => a as Execable;

describe("createPooledTestAdapter (Phase B smoke)", () => {
  afterAll(() => {
    _resetPooledTestAdapterForTests();
  });

  it("returns an adapter with a non-null pool back-reference", async () => {
    const { adapter, pool } = await createPooledTestAdapter();
    expect(pool).toBeTruthy();
    // Rails-shape invariant: every pooled connection has a `pool` back-ref
    // set by `ConnectionPool#newConnection`. Bug 3 (schema-cache lazy-load)
    // hinges on this not being null.
    expect((adapter as unknown as { pool: unknown }).pool).toBe(pool);
  });

  it("lazy-loads schemaCache.columns after CREATE TABLE", async () => {
    const { adapter, pool } = await createPooledTestAdapter();
    const tableName = "pooled_smoke_columns";
    try {
      await asExec(adapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
      await asExec(adapter).exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, name TEXT)`);
      const cache = adapter.schemaCache;
      expect(cache).toBeTruthy();
      const cols = await cache!.columns(pool, tableName);
      expect(cols).toBeTruthy();
      const names = (cols ?? []).map((c) => (c as { name: string }).name).sort();
      expect(names).toEqual(["id", "name"]);
    } finally {
      await asExec(adapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
    }
  });

  it("pinConnectionBang + write + unpinConnectionBang rolls back", async () => {
    const { adapter: setupAdapter, pool } = await createPooledTestAdapter();
    const tableName = "pooled_smoke_pin_rollback";
    await asExec(setupAdapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
    await asExec(setupAdapter).exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY)`);
    try {
      await withExecutionContext(async () => {
        // Pin first, THEN check out so the pinned connection is the one we
        // write through. Leases are keyed by executionContextId, so a lease
        // taken outside this context would resolve to a different connection.
        await pool.pinConnectionBang(false);
        try {
          const pinned = pool.checkout();
          await asExec(pinned).exec(`INSERT INTO ${tableName} (id) VALUES (1)`);
          const inside = await pinned.execute(`SELECT count(*) AS c FROM ${tableName}`);
          expect(Number((inside[0] as { c: number }).c)).toBe(1);
        } finally {
          const clean = await pool.unpinConnectionBang();
          expect(clean).toBe(true);
        }
      });

      const after = await setupAdapter.execute(`SELECT count(*) AS c FROM ${tableName}`);
      expect(Number((after[0] as { c: number }).c)).toBe(0);
    } finally {
      await asExec(setupAdapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
    }
  });

  it("two pooled-adapter handles share the same pool", async () => {
    const a = await createPooledTestAdapter();
    const b = await createPooledTestAdapter();
    expect(a.pool).toBe(b.pool);
    // SidecarFixtures handles are independent instances.
    expect(a.fixtures).not.toBe(b.fixtures);
  });
});
