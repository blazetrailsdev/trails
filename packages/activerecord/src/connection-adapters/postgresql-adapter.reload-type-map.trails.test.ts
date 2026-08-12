import { describe, expect, it } from "vitest";

// Rails wraps the whole of `reload_type_map` in `@lock.synchronize`
// (postgresql_adapter.rb:358-370). The port nulls `@type_map` and then awaits
// `load_additional_types`, so without that lock the map is absent across a
// scheduling point and a concurrent caller observes the null.
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
    a._transactionManager = new TransactionManager(adapter as never);
    a._typeMap = { loaded: 0 };
    const observed: unknown[] = [];
    a.loadAdditionalTypes = async () => {
      // The other caller runs here if the critical section is not held.
      await Promise.resolve();
      observed.push(a._typeMap);
      a._typeMap = { loaded: 1 };
    };

    await Promise.all([adapter.reloadTypeMap(), adapter.reloadTypeMap()]);

    // Each reload sees only its own null-then-fill window; neither observes the
    // other's. On the baseline both run concurrently and the second reload's
    // null lands inside the first's window.
    expect(observed).toEqual([null, null]);
    expect(a._typeMap).toEqual({ loaded: 1 });
  });
});
