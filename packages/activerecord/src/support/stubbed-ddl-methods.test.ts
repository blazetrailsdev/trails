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
 * list is a deliberate act: a new entry needs a reason on the same line, and a
 * stale one fails too — an entry the lay path no longer touches has to go, so
 * the list can never drift into a blanket exemption nobody re-derived.
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
 * Lay the canonical schema through a proxy that records every adapter member
 * the loader reaches for.
 *
 * `schemaStatements(host)` is re-bound to the proxy deliberately: the companion
 * is where the lay path's adapter calls actually come from, and letting the real
 * adapter hand back a companion bound to itself would record none of them.
 * Every other member is handed back bound to the *real* adapter, so calls the
 * adapter makes to itself internally stay unrecorded — the boundary being
 * pinned is the one a cover can intercept.
 *
 * That boundary is the whole scope, and the `schemaCreation` hop shows where it
 * stops: the getter hands back the *real* adapter's SchemaCreation instance, so
 * every quoting/type call it makes while rendering DDL (`quoteColumnName`,
 * `quoteDefaultExpression`, `lookupCastType`, …) resolves against the real
 * adapter and is invisible here. The `schemaCreation` access is recorded; what
 * happens downstream of it is not. That is deliberate — a cover intercepts an
 * adapter member, and nothing downstream of `schemaCreation` is reachable that
 * way — but it means the floor assertions below pin the boundary, not the full
 * DDL-rendering call graph.
 */
async function recordLayPath(): Promise<Set<string>> {
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
  return touched;
}

/**
 * The guarded set is a point-in-time trace of what `loadCanonicalSchema` really
 * goes through. Nothing else holds it true: if the lay path grows another
 * adapter call, a cover that intercepts the new member lays nothing and the
 * canonical half dies with `relation "…" does not exist` on the PG lane only —
 * the exact shape PR #5676 shipped. So drive the real loader and pin what it
 * touches.
 *
 * SQLite is the lane here because it needs no server, and the lay path it walks
 * is the shared abstract one. The companions do override members (MySQL:
 * `addIndex`, `dropTable`; PostgreSQL: `dropTable`, `createTableDefinition` —
 * not an exhaustive list, check the class before relying on it), but none of
 * those overrides changes what this pins: `dropTable` is off the lay path for
 * every adapter (the canonical loader passes no `force:`), `createTableDefinition`
 * is exempt whichever adapter's override runs, and MySQL's `addIndex` reaches the
 * database through the same `adapter.execute` this records.
 */
describe("STUBBED_DDL_METHODS", () => {
  test("covers every adapter member the canonical lay path touches", async () => {
    const touched = await recordLayPath();

    // Floor: a proxy that recorded almost nothing would pass the subset check
    // vacuously.
    expect(touched.has("execute")).toBe(true);
    expect(touched.has("schemaStatements")).toBe(true);
    expect(touched.has("schemaCreation")).toBe(true);

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

  test("carries no exemption the canonical lay path has stopped needing", async () => {
    const touched = await recordLayPath();

    const stale = [...NON_EMITTING.keys()].filter((name) => !touched.has(name)).sort();
    expect(
      stale,
      `NON_EMITTING exempts adapter member(s) the canonical lay path no longer touches: ` +
        `${stale.join(", ")}. Delete them from this file — an exemption nobody can re-derive ` +
        `from the code is how the guarded set drifts back out of date.`,
    ).toEqual([]);
  });

  test("gives every exemption a reason", () => {
    const unexplained = [...NON_EMITTING].filter(([, reason]) => reason.trim() === "");
    expect(unexplained.map(([name]) => name)).toEqual([]);
  });
});
