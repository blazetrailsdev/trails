import { describe, expect, it } from "vitest";

// Rails wraps the whole of `reload_type_map` in `@lock.synchronize`
// (postgresql_adapter.rb:359-369). The port clears the existing map (or
// allocates a fresh one) and then awaits `initialize_type_map`, whose
// `load_additional_types` tail is a query — so the map sits emptied across a
// scheduling point and, without that lock, a concurrent caller both observes
// the emptied map and re-enters the critical section.
describe("PostgreSQLAdapter#reloadTypeMap", () => {
  it("never exposes a null type map to a concurrent reloader", async () => {
    const { PostgreSQLAdapter } = await import("./postgresql-adapter.js");
    const { TransactionManager } = await import("./abstract/transaction.js");
    const adapter = Object.create(PostgreSQLAdapter.prototype) as InstanceType<
      typeof PostgreSQLAdapter
    >;
    const { LoadInterlockAwareMonitor } = await import("@blazetrails/activesupport");
    const a = adapter as unknown as Record<string, unknown>;
    // `Object.create` skips the field initializers, so install the monitor the
    // adapter would have built as `@lock` (abstract_adapter.rb:181-192).
    a.lock = new LoadInterlockAwareMonitor();
    // Likewise `@statements = build_statement_pool` (abstract_adapter.rb:156);
    // reloadTypeMap resets it so the next PREPARE re-parses against fresh OIDs.
    a._statements = { reset: () => {} };
    a._transactionManager = new TransactionManager(adapter as never);
    // Stands in for the HashLookupTypeMap `@type_map` holds; `seeded` tracks
    // the clear-then-refill window `reload_type_map` opens.
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
      // The other caller runs here if the critical section is not held.
      await Promise.resolve();
      observed.push(typeMap.seeded);
      typeMap.seeded = true;
      inCriticalSection--;
    };

    await Promise.all([adapter.reloadTypeMap(), adapter.reloadTypeMap()]);

    // Each reload sees only its own clear-then-refill window; neither observes
    // the other's, and neither runs while the other holds the section. On a
    // lock-less baseline both bodies enter before the first await, so
    // maxConcurrent is 2.
    expect(maxConcurrent).toBe(1);
    expect(observed).toEqual([false, false]);
    expect(typeMap.seeded).toBe(true);
  });
});
