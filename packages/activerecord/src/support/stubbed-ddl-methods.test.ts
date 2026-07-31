import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";
import { STUBBED_DDL_METHODS } from "./stubbed-ddl-methods.js";

/**
 * Adapter members the canonical lay path is allowed to touch *without* being in
 * `STUBBED_DDL_METHODS`. Every entry is a read, a cache-bust or a renderer input
 * — none of them is a point where intercepting the member would stop the schema
 * being laid, which is the only thing the guarded set is about. Widening this
 * list is a deliberate act: a new entry needs a reason on the same line.
 */
const NON_EMITTING: ReadonlyMap<string, string> = new Map([
  [
    "adapterName",
    "read — picks the per-adapter type map and gates schema.rb's inline adapter clauses",
  ],
  [
    "getDatabaseVersion",
    "warm-up read — primes the memoized version the index sort-order predicates gate on",
  ],
  ["schemaCache", "cache-bust — clearDataSourceCacheBang around a create"],
  ["pool", "argument to clearDataSourceCacheBang, not a DDL emitter"],
  ["clearCacheBang", "post-lay prepared-statement reset (PG stale-plan 0A000)"],
  ["supportsComments", "capability read — decides whether a table comment rides inline"],
  [
    "supportsExpressionIndex",
    "capability read — skips expression indexes on adapters that lack them",
  ],
  ["supportsIndexesInCreate", "capability read — decides whether indexes ride inside CREATE TABLE"],
  ["indexNameLength", "limit read used to validate/truncate an index name"],
  [
    "createTableDefinition",
    "definition factory — a stub returns no TableDefinition and dies at once, so it cannot silently lay nothing",
  ],
]);

/**
 * The guarded set is a point-in-time trace of what `loadCanonicalSchema` really
 * goes through. Nothing else holds it true: if the lay path grows another
 * adapter call, a cover that intercepts the new member lays nothing and the
 * canonical half dies with `relation "…" does not exist` on the PG lane only —
 * the exact shape PR #5676 shipped. So drive the real loader against a
 * recording proxy and pin what it touches.
 *
 * `schemaStatements(host)` is re-bound to the proxy deliberately: the companion
 * is where the lay path's adapter calls actually come from, and letting the real
 * adapter hand back a companion bound to itself would record none of them.
 *
 * SQLite is the lane here because it needs no server, but the lay path being
 * pinned is the shared abstract one — a new `this.adapter.<member>` call in
 * `SchemaStatements.createTable`/`addIndex` surfaces regardless of adapter.
 */
describe("STUBBED_DDL_METHODS", () => {
  test("covers every adapter member the canonical lay path touches", async () => {
    const real = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    const touched = new Set<string>();
    const proxy: AbstractAdapter = new Proxy(real, {
      get(target, prop, receiver) {
        if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
        touched.add(prop);
        if (prop === "schemaStatements") {
          return (host?: AbstractAdapter) => target.schemaStatements(host ?? proxy);
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });

    try {
      await loadCanonicalSchema(proxy);
    } finally {
      await (real as unknown as BetterSQLite3Adapter).close();
    }

    // Floor: a proxy that recorded almost nothing would pass the subset check
    // vacuously.
    expect(touched.has("execute")).toBe(true);
    expect(touched.has("schemaStatements")).toBe(true);

    const unaccounted = [...touched]
      .filter((name) => !STUBBED_DDL_METHODS.includes(name) && !NON_EMITTING.has(name))
      .sort();
    expect(
      unaccounted,
      `The canonical lay path now touches adapter member(s) outside STUBBED_DDL_METHODS: ` +
        `${unaccounted.join(", ")}. Either add each one to STUBBED_DDL_METHODS in ` +
        `packages/activerecord/src/support/stubbed-ddl-methods.ts (so covers stub it and the ` +
        `ESLint rule guards it), or — if intercepting it would not stop the schema being laid — ` +
        `add it to NON_EMITTING in this file with a one-line reason.`,
    ).toEqual([]);
  });
});
