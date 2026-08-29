import { describe, it, expect, afterAll } from "vitest";

import { createPooledTestAdapter, _resetPooledTestAdapterForTests } from "./test-adapter.js";
import { withExecutionContext } from "./connection-adapters/abstract/connection-pool/execution-context.js";
import { inMemoryDb } from "./support/adapter-helper.js";

type Execable = { exec(sql: string): Promise<void> };
const asExec = (a: unknown) => a as Execable;

describe("createPooledTestAdapter (Phase B smoke)", () => {
  afterAll(() => {
    _resetPooledTestAdapterForTests();
  });

  it("returns an adapter with a non-null pool back-reference", async () => {
    const { adapter, pool } = await createPooledTestAdapter();
    expect(pool).toBeTruthy();
    expect((adapter as unknown as { pool: unknown }).pool).toBe(pool);
  });

  it("lazy-loads internalSchemaCache.columns after CREATE TABLE", async () => {
    const { adapter, pool } = await createPooledTestAdapter();
    const tableName = "pooled_smoke_columns";
    try {
      await asExec(adapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
      await asExec(adapter).exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, name TEXT)`);
      const cache = adapter.internalSchemaCache;
      expect(cache).toBeTruthy();
      const cols = await cache.columns(pool, tableName);
      expect(cols).toBeTruthy();
      const names = (cols ?? []).map((c) => (c as { name: string }).name).sort();
      expect(names).toEqual(["id", "name"]);
    } finally {
      await asExec(adapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
    }
  });

  it.skipIf(inMemoryDb())(
    "pinConnectionBang + write + unpinConnectionBang rolls back",
    async () => {
      const { adapter: setupAdapter, pool } = await createPooledTestAdapter();
      const tableName = "pooled_smoke_pin_rollback";
      await asExec(setupAdapter).exec(`DROP TABLE IF EXISTS ${tableName}`);
      await asExec(setupAdapter).exec(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY)`);
      try {
        await withExecutionContext(async () => {
          await pool.pinConnectionBang(false);
          try {
            const pinned = await pool.checkout();
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
    },
  );

  it("two pooled-adapter handles share the same pool", async () => {
    const a = await createPooledTestAdapter();
    const b = await createPooledTestAdapter();
    expect(a.pool).toBe(b.pool);
  });
});
