import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";
import { STUBBED_DDL_METHODS } from "./stubbed-ddl-methods.js";

const NON_EMITTING: ReadonlyMap<string, string> = new Map([
  [
    "typeRegistryKey",
    "read — picks the per-adapter type map and gates schema.rb's inline adapter clauses",
  ],
  [
    "validateCreateTableOptionsBang",
    "option validation — raises on an unknown key, emits no DDL of its own",
  ],
  [
    "validateTableLengthBang",
    "name validation — raises on an over-long table name, emits no DDL of its own",
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
  ["_statements", "prepared-statement slot clearCacheBang resets, not a DDL emitter"],
  ["lock", "the connection monitor clearCacheBang synchronizes on, not a DDL emitter"],
  ["_schemaCache", "memoized backing slot of the schemaCache read"],
  ["_poolSchemaReflection", "pool reflection the schemaCache read binds to"],
  ["quoteColumnName", "renderer input — quotes a name into DDL the renderer is already building"],
  ["quoteTableName", "renderer input — quotes a table name into DDL, emits nothing itself"],
  ["quoteDefaultExpression", "renderer input — renders a column default, emits nothing itself"],
  ["quotedColumnsForIndex", "renderer input — renders an index's column list"],
  [
    "typeToSql",
    "renderer input — renders a column's SQL type from the adapter's type map, emits no DDL itself",
  ],
  ["useForeignKeys", "capability read — decides whether the renderer emits inline REFERENCES"],
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
]);

function isPrivateFieldBrandCheck(error: unknown): boolean {
  return error instanceof TypeError && /private (member|field|method)/i.test(error.message);
}

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

describe("STUBBED_DDL_METHODS", () => {
  test("covers every adapter member the canonical lay path touches", async () => {
    const touched = await recordLayPath();

    expect(touched.has("execute")).toBe(true);
    expect(touched.has("createTable")).toBe(true);
    expect(touched.has("addIndex")).toBe(true);
    expect(touched.has("quoteTableName")).toBe(true);
    expect(touched.has("typeToSql")).toBe(true);

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
