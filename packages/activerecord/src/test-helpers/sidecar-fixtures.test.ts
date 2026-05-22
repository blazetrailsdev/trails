import { describe, it, expect, beforeEach } from "vitest";
import { createSidecarTestAdapter, resetTestAdapterState } from "../test-adapter.js";

describe("createSidecarTestAdapter (path 2 sidecar)", () => {
  beforeEach(async () => {
    await resetTestAdapterState();
  });

  it("returns the real adapter and a fresh SidecarFixtures handle", () => {
    const { adapter, fixtures } = createSidecarTestAdapter();
    expect(typeof adapter.adapterName).toBe("string");
    expect(fixtures.adapter).toBe(adapter);
    expect(fixtures.inTransaction).toBe(false);
    expect(fixtures.openTransactions).toBe(0);
  });

  it("each call returns a distinct fixtures handle but the same shared adapter", () => {
    const a = createSidecarTestAdapter();
    const b = createSidecarTestAdapter();
    expect(a.adapter).toBe(b.adapter);
    expect(a.fixtures).not.toBe(b.fixtures);
  });

  it("records CREATE/DROP TABLE via fixtures.exec for defineSchema cache invalidation", async () => {
    const { adapter, fixtures } = createSidecarTestAdapter();
    const table = "sidecar_smoke_test";
    const q = adapter.adapterName === "mysql" ? "`" : '"';
    await fixtures.exec(`CREATE TABLE ${q}${table}${q} (id INTEGER PRIMARY KEY)`);
    const { getCreatedTables } = await import("./ddl-tracker.js");
    expect(getCreatedTables().has(table)).toBe(true);
    await fixtures.exec(`DROP TABLE ${q}${table}${q}`);
    expect(getCreatedTables().has(table)).toBe(false);
  });

  it("hides transaction state from foreign async chains", async () => {
    const { fixtures } = createSidecarTestAdapter();
    expect(fixtures.currentTransaction()).toBeNull();

    let foreignSawTx: unknown = "unset";
    let releaseForeign!: () => void;
    const foreignReady = new Promise<void>((resolve) => {
      releaseForeign = resolve;
    });
    const foreignChain = (async () => {
      await foreignReady;
      foreignSawTx = fixtures.currentTransaction();
    })();

    let ownChainSawTx: unknown = null;
    await fixtures.withinNewTransaction({ joinable: false }, async () => {
      ownChainSawTx = fixtures.currentTransaction();
      releaseForeign();
      await foreignChain;
    });

    expect(ownChainSawTx).not.toBeNull();
    expect(foreignSawTx).toBeNull();
    expect(fixtures.currentTransaction()).toBeNull();
  });

  it("manual beginTransaction/commit bumps depth and exposes state to the caller", async () => {
    const { fixtures } = createSidecarTestAdapter();
    await fixtures.beginTransaction();
    expect(fixtures.inTransaction).toBe(true);
    expect(fixtures.openTransactions).toBeGreaterThan(0);
    await fixtures.commit();
    expect(fixtures.inTransaction).toBe(false);
    expect(fixtures.openTransactions).toBe(0);
  });

  it("manual beginTransaction/rollback also clears depth and hides state", async () => {
    const { fixtures } = createSidecarTestAdapter();
    await fixtures.beginTransaction();
    expect(fixtures.inTransaction).toBe(true);
    await fixtures.rollback();
    expect(fixtures.inTransaction).toBe(false);
    expect(fixtures.openTransactions).toBe(0);
  });
});
