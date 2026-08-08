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
    "validateCreateTableOptionsBang",
    "option validation — raises on an unknown key, emits no DDL of its own",
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
  [
    "buildCreateTableDefinition",
    "definition factory — a stub returns no TableDefinition and dies at once, so it cannot silently lay nothing",
  ],
  [
    "buildCreateIndexDefinition",
    "definition factory — a stub returns no CreateIndexDefinition and dies at once",
  ],
  ["databaseVersion", "version read behind the index sort-order predicates"],
  ["_statementPool", "prepared-statement slot clearCacheBang resets, not a DDL emitter"],
  ["_schemaCache", "memoized backing slot of the schemaCache read"],
  ["_poolSchemaReflection", "pool reflection the schemaCache read binds to"],
  ["quoteColumnName", "renderer input — quotes a name into DDL the renderer is already building"],
  ["quoteTableName", "renderer input — quotes a table name into DDL, emits nothing itself"],
  ["quoteDefaultExpression", "renderer input — renders a column default, emits nothing itself"],
  ["quotedColumnsForIndex", "renderer input — renders an index's column list"],
  ["nativeDatabaseTypes", "renderer input — the type map typeToSql reads, a read not an emitter"],
  ["supportsForeignKeys", "capability read — decides whether the renderer emits inline REFERENCES"],
  [
    "supportsCheckConstraints",
    "capability read — decides whether the renderer emits inline CHECK constraints",
  ],
  ["supportsPartialIndex", "capability read — decides whether an index renders its WHERE clause"],
  ["supportsIndexInclude", "capability read — decides whether an index renders INCLUDE (...)"],
  [
    "supportsNullsNotDistinct",
    "capability read — decides whether an index renders NULLS NOT DISTINCT",
  ],
  ["_config", "connection-config read the renderer consults, not a DDL emitter"],
]);

/**
 * A getter whose body reads a private field brand-checks its receiver and
 * throws when the recording view is that receiver. That is the one throw the
 * recorder may answer by re-reading off the real adapter; anything else is a
 * genuine failure in the getter body, and swallowing it would let the trace go
 * quietly shallower for that member instead of failing — the drift the guard's
 * staleness rule exists to prevent. Match the brand-check shape only.
 */
function isPrivateFieldBrandCheck(error: unknown): boolean {
  return error instanceof TypeError && /private (member|field|method)/i.test(error.message);
}

/**
 * Lay the canonical schema through a proxy that records every adapter member
 * the loader reaches for.
 *
 * The mixed-in `SchemaStatements` bodies are the adapter's own methods, so a
 * proxy that bound them to the real adapter would see only the loader's first
 * call and nothing those bodies do. The recorder is therefore two levels deep:
 * a member reached off the proxy is recorded and bound to a second recording
 * view, so the `this.<member>` calls the mixed-in body makes are recorded one
 * hop deep, while the calls that view then makes to the real adapter stay
 * unrecorded. `this.adapter` — how a mixed-in body names the adapter, which is
 * itself — is answered with the same view so that hop stays recorded.
 *
 * Getters are the second half of the boundary. A getter read off the view is
 * evaluated with the view as receiver, not the real adapter, so whatever it
 * builds off `this` keeps recording: `schemaCreation` hands back a renderer
 * holding the view, and the renderer's own quoting and type reads
 * (`quoteColumnName`, `quoteDefaultExpression`, `nativeDatabaseTypes`, …) come
 * back through the proxy and are pinned again. Getters that read a private
 * field brand-check their receiver and throw on a proxy; those fall back to
 * evaluating on the real adapter, unrecorded.
 *
 * Depth stops there, deliberately. Self-binding the recorded functions so that
 * *every* hop inside an adapter method is recorded drags in the whole adapter
 * internals — 44 further members (`_performQuery`, `materializeTransactions`,
 * `verifiedBang`, `ensureConnected`, …), none of which is a surface a cover
 * stubs, and exempting them one by one would turn NON_EMITTING into the blanket
 * exemption its own staleness rule exists to prevent. The boundary this pins is
 * the one a cover can actually intercept: the loader's calls into the adapter,
 * the calls those bodies make back into it, and everything the renderer they
 * build reads. Members reached deeper than that (`createTableDefinition`,
 * `indexNameLength`, …) are not pinned; `schemaCreation` stays in the guarded
 * set because stubbing it still removes the renderer wholesale.
 */
async function recordLayPath(): Promise<Set<string>> {
  const real = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
  const touched = new Set<string>();
  const recorder = (inner: AbstractAdapter): AbstractAdapter => {
    const self: AbstractAdapter = new Proxy(real, {
      get(target, prop, receiver) {
        if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
        touched.add(prop);
        let value: unknown;
        try {
          value = Reflect.get(target, prop, self);
        } catch (error) {
          if (!isPrivateFieldBrandCheck(error)) throw error;
          value = Reflect.get(target, prop, target);
        }
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(inner)
          : value;
      },
    });
    return self;
  };
  const proxy: AbstractAdapter = recorder(recorder(real));

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
 * `addIndex`, `dropTable`; PostgreSQL: `dropTable`, `schemaCreation` — not an
 * exhaustive list, check the class before relying on it), but none of those
 * overrides changes what this pins: `dropTable` is off the lay path for every
 * adapter (the canonical loader passes no `force:`), MySQL's `addIndex` reaches
 * the database through the same `adapter.execute` this records, and every
 * adapter's `schemaCreation` renderer reads back through the same boundary.
 */
describe("STUBBED_DDL_METHODS", () => {
  test("covers every adapter member the canonical lay path touches", async () => {
    const touched = await recordLayPath();

    // Floor: a proxy that recorded almost nothing would pass the subset check
    // vacuously.
    expect(touched.has("execute")).toBe(true);
    expect(touched.has("createTable")).toBe(true);
    expect(touched.has("addIndex")).toBe(true);
    // Floor: these come back only through the renderer boundary.
    expect(touched.has("quoteTableName")).toBe(true);
    expect(touched.has("nativeDatabaseTypes")).toBe(true);

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

  test("falls back only for a private-field brand check", () => {
    class Branded {
      #field = 1;
      get value(): number {
        return this.#field;
      }
    }
    const branded = new Branded();
    let brandCheck: unknown;
    try {
      Reflect.get(branded, "value", new Proxy(branded, {}));
    } catch (error) {
      brandCheck = error;
    }

    expect(isPrivateFieldBrandCheck(brandCheck)).toBe(true);
    expect(isPrivateFieldBrandCheck(new TypeError("something genuinely broke"))).toBe(false);
    expect(isPrivateFieldBrandCheck(new Error("Cannot read private member #x"))).toBe(false);
  });

  test("gives every exemption a reason", () => {
    const unexplained = [...NON_EMITTING].filter(([, reason]) => reason.trim() === "");
    expect(unexplained.map(([name]) => name)).toEqual([]);
  });
});
