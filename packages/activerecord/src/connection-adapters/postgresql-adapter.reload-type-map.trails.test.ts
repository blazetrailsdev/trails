import { describe, expect, it } from "vitest";

describe("PostgreSQLAdapter#reloadTypeMap", () => {
  it("never exposes a null type map to a concurrent reloader", async () => {
    const { PostgreSQLAdapter } = await import("./postgresql-adapter.js");
    const { TransactionManager } = await import("./abstract/transaction.js");
    const adapter = Object.create(PostgreSQLAdapter.prototype) as InstanceType<
      typeof PostgreSQLAdapter
    >;
    const { LoadInterlockAwareMonitor } = await import("@blazetrails/activesupport");
    const a = adapter as unknown as Record<string, unknown>;
    a.lock = new LoadInterlockAwareMonitor();
    a._statements = { reset: () => {} };
    a._regtypeOids = new Map();
    a._transactionManager = new TransactionManager(adapter as never);
    const typeMap = {
      seeded: true,
      clear() {
        this.seeded = false;
      },
    };
    a._typeMap = typeMap;

    const observed: boolean[] = [];
    let inCriticalSection = 0;
    let maxConcurrent = 0;
    a.initializeTypeMap = async () => {
      inCriticalSection++;
      maxConcurrent = Math.max(maxConcurrent, inCriticalSection);
      await Promise.resolve();
      observed.push(typeMap.seeded);
      typeMap.seeded = true;
      inCriticalSection--;
    };

    await Promise.all([adapter.reloadTypeMap(), adapter.reloadTypeMap()]);

    expect(maxConcurrent).toBe(1);
    expect(observed).toEqual([false, false]);
    expect(typeMap.seeded).toBe(true);
  });
});
