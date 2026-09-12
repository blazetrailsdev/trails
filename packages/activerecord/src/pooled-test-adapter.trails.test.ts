import { describe, it, expect, afterAll } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";

import { createPooledTestAdapter, _resetPooledTestAdapterForTests } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";

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
      await adapter.execute(`DROP TABLE IF EXISTS ${tableName}`);
      await adapter.execute(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, name TEXT)`);
      const cache = adapter.internalSchemaCache;
      expect(cache).toBeTruthy();
      const cols = await cache.columns(pool, tableName);
      expect(cols).toBeTruthy();
      const names = (cols ?? []).map((c) => (c as { name: string }).name).sort();
      expect(names).toEqual(["id", "name"]);
    } finally {
      await adapter.execute(`DROP TABLE IF EXISTS ${tableName}`);
    }
  });

  it.skipIf(inMemoryDb())(
    "pinConnectionBang + write + unpinConnectionBang rolls back",
    async () => {
      const { adapter: setupAdapter, pool } = await createPooledTestAdapter();
      const tableName = "pooled_smoke_pin_rollback";
      await setupAdapter.execute(`DROP TABLE IF EXISTS ${tableName}`);
      await setupAdapter.execute(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY)`);
      try {
        await new Thread(async () => {
          await pool.pinConnectionBang(false);
          try {
            const pinned = await pool.checkout();
            await pinned.execute(`INSERT INTO ${tableName} (id) VALUES (1)`);
            const inside = (
              await pinned.selectAll(`SELECT count(*) AS c FROM ${tableName}`)
            ).toArray();
            expect(Number((inside[0] as { c: number }).c)).toBe(1);
          } finally {
            const clean = await pool.unpinConnectionBang();
            expect(clean).toBe(true);
          }
        }).value();

        const after = (
          await setupAdapter.selectAll(`SELECT count(*) AS c FROM ${tableName}`)
        ).toArray();
        expect(Number((after[0] as { c: number }).c)).toBe(0);
      } finally {
        await setupAdapter.execute(`DROP TABLE IF EXISTS ${tableName}`);
      }
    },
  );

  it("two pooled-adapter handles share the same pool", async () => {
    const a = await createPooledTestAdapter();
    const b = await createPooledTestAdapter();
    expect(a.pool).toBe(b.pool);
  });
});
