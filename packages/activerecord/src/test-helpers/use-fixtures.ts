import { afterEach, beforeAll, beforeEach } from "vitest";
import { defineFixtures, defineJoinTableFixtures } from "./define-fixtures.js";
import { defineSchema, type Schema } from "./define-schema.js";
import {
  fixtureRegistry,
  isJoinTableEntry,
  type FixtureName,
  type RegistryModel,
  type RegistryData,
  type IsJoinTableName,
} from "./fixtures-registry.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { Base } from "../base.js";

/**
 * A tableless fixture entry: seeds rows directly into the named table with no
 * model class. Mirrors Rails' "naked" fixture path — the table's schema columns
 * are validated at seed time, but no `ActiveRecord::Base` subclass is involved.
 *
 * The accessor key is the `table` value as-is (e.g. `{ table: "accounts" }` →
 * `result.accounts`). Rows return as plain resolved-attribute objects.
 */
export type TablelessFixtureEntry = {
  table: string;
  data: Record<string, Record<string, unknown>>;
};

export { FixtureSet } from "./fixture-set.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

type FixtureMap = Record<string, [BaseClass, Record<string, FixtureAttrs>]>;

/**
 * Internally-resolved fixture set. `model === null` marks a HABTM join-table set
 * (seeded via {@link defineJoinTableFixtures}); otherwise it's a model-backed set.
 * `table` is the DB table to seed/clean and to slice the schema by.
 */
type ResolvedFixtureSet = {
  table: string;
  model: BaseClass | null;
  data: Record<string, FixtureAttrs>;
};
type ResolvedFixtureMap = Record<string, ResolvedFixtureSet>;

type FixtureAccessor<T extends BaseClass, K extends string> = {
  (name: K): InstanceType<T>;
  all(): InstanceType<T>[];
};

/** Accessor for a HABTM join-table set: rows are plain resolved-attribute objects (no model instance). */
type JoinTableAccessor<K extends string> = {
  (name: K): Record<string, unknown>;
  all(): Record<string, unknown>[];
};

export type UseFixturesResult<M extends FixtureMap> = {
  [K in keyof M]: M[K] extends [
    infer T extends BaseClass,
    Record<infer N extends string, FixtureAttrs>,
  ]
    ? FixtureAccessor<T, N>
    : never;
};

/**
 * Result of the `string[]` overload: one accessor per requested fixture-set name,
 * with the label union pulled from the registry entry's data keys.
 */
export type UseFixturesByNameResult<N extends FixtureName> = {
  [K in N]: IsJoinTableName<K> extends true
    ? JoinTableAccessor<Extract<keyof RegistryData<K>, string>>
    : FixtureAccessor<RegistryModel<K>, Extract<keyof RegistryData<K>, string>>;
};

export interface UseFixturesOpts {
  /**
   * When set, `useFixtures` derives the minimal sub-schema for the requested sets
   * from this schema (via {@link deriveFixtureSchema}) and creates those tables in a
   * `beforeAll` — replacing a manual `defineSchema({ ...slice })` call. Pass the full
   * canonical schema (e.g. `TEST_SCHEMA`); only the tables the fixtures touch are created.
   */
  schema?: Schema;
}

/**
 * Resolves fixture-set names through the registry into the `[Model, data]` map shape.
 * Model classes are dynamic-imported (see {@link FixtureRegistryEntry}), so this is async.
 *
 * Rejects a request that names two sets backed by the same table (e.g.
 * `deadParrots`/`liveParrots` → `parrots`, `dogs`/`otherDogs` → `dogs`). Each
 * `defineFixtures` call deletes its table before inserting, so seeding both in
 * one call would wipe the first set's rows while leaving its accessor populated
 * with now-deleted instances. Rails loads multiple same-table fixture files by
 * deleting each table once and inserting all sets together; that combined path
 * needs a `defineFixtures` change (build rows per model, delete the shared table
 * once) and is deferred. Until then, load only ONE of the same-table sets in a
 * given test/scope — separate `useFixtures` calls don't help, since each
 * registers its own `beforeEach` loader and the later loader's delete still
 * clobbers the earlier set on every test.
 *
 * @internal
 */
export async function resolveFixtureNames(
  names: readonly FixtureName[],
): Promise<ResolvedFixtureMap> {
  const map: ResolvedFixtureMap = {};
  const tableToName = new Map<string, string>();
  for (const name of names) {
    const entry = fixtureRegistry[name as FixtureName] as
      | (typeof fixtureRegistry)[FixtureName]
      | undefined;
    if (!entry) {
      throw new Error(
        `useFixtures: no fixture set named "${name}" in the registry — add it to fixtures-registry.ts`,
      );
    }
    // Join-table sets have no model class — resolve straight to the literal table.
    // A model entry may declare an `addOn` (e.g. the encryption bootstrap) that
    // MUST run before its model thunk: the model's import-time side effects
    // (`encrypts()`) throw unless the add-on registered its hooks first.
    let table: string;
    let model: BaseClass | null;
    if (isJoinTableEntry(entry)) {
      table = entry.joinTable;
      model = null;
    } else {
      if ("addOn" in entry) await entry.addOn?.();
      const m = await entry.model();
      table = m.tableName;
      model = m;
    }
    const prior = tableToName.get(table);
    if (prior !== undefined) {
      throw new Error(
        `useFixtures: "${name}" and "${prior}" both map to table "${table}"; ` +
          `combined same-table loading isn't supported yet (defineFixtures deletes the ` +
          `table per set). Load only one of them in this test/scope — splitting across ` +
          `separate useFixtures calls does not help, since the later loader's delete still ` +
          `clobbers the earlier set on every test.`,
      );
    }
    tableToName.set(table, name);
    map[name] = { table, model, data: entry.data };
  }
  return map;
}

/**
 * Slices the minimal sub-schema needed to seed the requested fixture sets out of a
 * full schema: each set's table (resolved through the registry), keyed by the model's
 * own `tableName`. Lets a caller hand `useFixtures` the whole canonical `TEST_SCHEMA`
 * and have it pick out only the tables it touches — no hand-maintained
 * `defineSchema({ customers: TEST_SCHEMA.customers })` slice that drifts when the
 * fixture set's columns change.
 *
 * A requested set whose table is absent from `fullSchema` is silently skipped here —
 * the seed-time `defineFixtures` call then surfaces a precise "no such table" error,
 * which is a better signal than an opaque schema-derivation failure. Column-level
 * `references:` targets are intentionally NOT pulled in: `defineSchema` treats them
 * as creation-ordering hints only (never emitted as FK constraints) and skips any
 * target missing from the schema, so a per-table slice creates valid DDL on its own.
 */
export async function deriveFixtureSchema(
  names: readonly FixtureName[],
  fullSchema: Schema,
): Promise<Schema> {
  return sliceSchema(await resolveFixtureNames(names), fullSchema);
}

/** Picks each resolved set's table out of `fullSchema`. */
function sliceSchema(fixtures: ResolvedFixtureMap, fullSchema: Schema): Schema {
  const sub: Schema = {};
  for (const { table } of Object.values(fixtures)) {
    if (table in fullSchema) sub[table] = fullSchema[table]!;
  }
  return sub;
}

/** Returns true for "table/relation does not exist" errors from any adapter. */
function isTableMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("no such table") || // SQLite
    /Table '.*' doesn't exist/i.test(msg) || // MySQL: Table 'db.tbl' doesn't exist
    /relation ".*" does not exist/i.test(msg) // PostgreSQL: relation "tbl" does not exist
  );
}

/**
 * Result of the tableless overload: one `JoinTableAccessor` per entry, keyed by `table`.
 * The label union is derived from `entry.data`'s own keys so `accessor("root")` is
 * compile-time checked when the data literal is inlined (same pattern as the by-name overload).
 */
export type UseTablelessFixturesResult<T extends readonly TablelessFixtureEntry[]> = {
  [E in T[number] as E["table"]]: JoinTableAccessor<Extract<keyof E["data"], string>>;
};

/**
 * Implements the tableless overload of `useFixtures`. Seeds each entry directly
 * into the named table via {@link defineJoinTableFixtures} — no model class required.
 * Columns are validated against the live schema; unknown columns throw at seed time.
 * @internal
 */
function useTablelessFixtures(
  entries: readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter,
  opts?: UseFixturesOpts,
): Record<string, unknown> {
  // Mirror the same-table duplicate guard in resolveFixtureNames: each
  // defineJoinTableFixtures call deletes the table before inserting, so a
  // second entry for the same table would wipe the first entry's rows.
  const seenTables = new Set<string>();
  for (const { table } of entries) {
    if (seenTables.has(table)) {
      throw new Error(
        `useFixtures: two tableless entries both target table "${table}"; ` +
          `the second insert would delete the first entry's rows. Use a single entry instead.`,
      );
    }
    seenTables.add(table);
  }

  const keys = entries.map((e) => e.table);
  const store: Record<string, Record<string, unknown>> = {};

  if (opts?.schema) {
    const fullSchema = opts.schema;
    beforeAll(async () => {
      const sub: Schema = {};
      for (const { table } of entries) {
        if (table in fullSchema) sub[table] = fullSchema[table]!;
      }
      await defineSchema(getAdapter(), sub);
    });
  }

  beforeEach(async () => {
    const adapter = getAdapter();
    for (const { table, data } of entries) {
      store[table] = await defineJoinTableFixtures(adapter, table, data);
    }
  });

  afterEach(async () => {
    const adapter = getAdapter();
    for (const { table } of [...entries].reverse()) {
      try {
        await adapter.executeMutation(`DELETE FROM ${adapter.quoteTableName(table)}`);
      } catch (e) {
        if (!isTableMissingError(e)) throw e;
      }
    }
    for (const key of keys) delete store[key];
  });

  const result: Record<string, unknown> = {};
  for (const { table } of entries) {
    const accessor = (name: string) => {
      const set = store[table];
      if (!set)
        throw new Error(`useFixtures: fixture set "${table}" not loaded — call inside a test`);
      const row = set[name];
      if (!row) throw new Error(`useFixtures: no fixture named "${name}" in set "${table}"`);
      return row;
    };
    accessor.all = () => {
      const set = store[table];
      if (!set)
        throw new Error(`useFixtures: fixture set "${table}" not loaded — call inside a test`);
      return Object.values(set);
    };
    result[table] = accessor;
  }
  return result;
}

/**
 * Vitest helper that inserts fixture rows in a `beforeEach` and cleans them up in `afterEach`.
 *
 * Returns an object of typed accessor functions — one per fixture set. Each accessor is callable
 * by label (`topics("first")`) and has an `.all()` method.
 *
 * ```ts
 * const { topics, posts } = useFixtures(
 *   { topics: [Topic, topicData], posts: [Post, postData] },
 *   () => adapter,
 * );
 * ```
 *
 * Or by Rails-style fixture-set name, resolved through `fixtures-registry.ts`:
 *
 * ```ts
 * const { authors, posts } = useFixtures(["authors", "posts"], () => adapter);
 * authors("david"); // → Author instance
 * ```
 *
 * Subdirectory fixture sets use slash-keyed names; access via bracket notation.
 * Once the set is registered in `fixtures-registry.ts` (Phase 2+), the names
 * overload works too. Until then, use the object-map overload:
 *
 * ```ts
 * const fixtures = useFixtures(
 *   { "admin/accounts": [AdminAccount, adminAccountFixtureData] },
 *   () => adapter,
 * );
 * fixtures["admin/accounts"]("signals37"); // → Admin::Account instance
 * ```
 *
 * Pass `{ schema }` to skip the manual `defineSchema` step: `useFixtures` derives the
 * minimal sub-schema for the requested sets (see {@link deriveFixtureSchema}) and
 * creates those tables in a `beforeAll`. Hand it the whole `TEST_SCHEMA` and it picks
 * out only what it needs:
 *
 * ```ts
 * setupHandlerSuite();
 * useHandlerTransactionalFixtures();
 * const { customers } = useFixtures(["customers"], () => Base.connection, { schema: TEST_SCHEMA });
 * ```
 */
export function useFixtures<M extends FixtureMap>(
  fixtures: M,
  getAdapter: () => DatabaseAdapter,
  opts?: UseFixturesOpts,
): UseFixturesResult<M>;
export function useFixtures<const N extends FixtureName>(
  names: readonly N[],
  getAdapter: () => DatabaseAdapter,
  opts?: UseFixturesOpts,
): UseFixturesByNameResult<N>;
export function useFixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  getAdapter: () => DatabaseAdapter,
  opts?: UseFixturesOpts,
): UseTablelessFixturesResult<T>;
export function useFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter,
  opts?: UseFixturesOpts,
): Record<string, unknown> {
  // Tableless array: every element is an object with { table, data }.
  // The `length > 0` guard is intentional: an empty array is vacuously correct for
  // both the by-name and tableless overloads (both seed zero fixtures and return `{}`),
  // so falling through to the by-name path is safe. Callers passing a non-empty
  // tableless array computed dynamically must ensure at least one element is present;
  // the TypeScript overload resolution enforces the correct return type at the call site.
  if (
    Array.isArray(fixturesOrNames) &&
    fixturesOrNames.length > 0 &&
    typeof (fixturesOrNames as readonly unknown[])[0] === "object" &&
    (fixturesOrNames as readonly unknown[])[0] !== null &&
    "table" in ((fixturesOrNames as readonly TablelessFixtureEntry[])[0] as object)
  ) {
    // Validate that all elements are uniformly tableless to catch mixed arrays early
    // rather than surfacing a confusing downstream error in resolveFixtureNames or
    // defineJoinTableFixtures.
    for (let i = 1; i < (fixturesOrNames as readonly unknown[]).length; i++) {
      const el = (fixturesOrNames as readonly unknown[])[i];
      if (typeof el !== "object" || el === null || !("table" in (el as object))) {
        throw new Error(
          `useFixtures: mixed tableless and by-name entries are not supported. ` +
            `Element at index ${i} (${JSON.stringify(el)}) is not a tableless { table, data } entry.`,
        );
      }
    }
    return useTablelessFixtures(
      fixturesOrNames as readonly TablelessFixtureEntry[],
      getAdapter,
      opts,
    );
  }
  // Symmetric guard: if the first element is a by-name string, scan remaining elements
  // for any tableless { table, data } object. A mixed array here would reach
  // resolveFixtureNames with an object, producing a confusing "no registry entry" error.
  if (
    Array.isArray(fixturesOrNames) &&
    fixturesOrNames.length > 1 &&
    typeof (fixturesOrNames as readonly unknown[])[0] === "string"
  ) {
    for (let i = 1; i < (fixturesOrNames as readonly unknown[]).length; i++) {
      const el = (fixturesOrNames as readonly unknown[])[i];
      if (typeof el === "object" && el !== null && "table" in (el as object)) {
        throw new Error(
          `useFixtures: mixed tableless and by-name entries are not supported. ` +
            `Element at index ${i} is a tableless { table, data } entry but the array started with a by-name string.`,
        );
      }
    }
  }
  const isNameArray = Array.isArray(fixturesOrNames);
  // Keys are known synchronously (the names, or the map's own keys) so accessors
  // can be wired up before the (possibly async) model resolution in beforeEach.
  const keys: string[] = isNameArray
    ? (fixturesOrNames as readonly string[]).slice()
    : Object.keys(fixturesOrNames as FixtureMap);

  // The resolved set map. For the object-map overload it's known up front (each
  // `[Model, data]` tuple maps to a model-backed set); for the name-array overload
  // it's filled in beforeEach once the model thunks resolve (dynamic imports must
  // stay lazy — see fixtures-registry).
  let fixtures: ResolvedFixtureMap | undefined = isNameArray
    ? undefined
    : Object.fromEntries(
        Object.entries(fixturesOrNames as FixtureMap).map(([key, [model, data]]) => [
          key,
          { table: model.tableName, model, data },
        ]),
      );

  // Per-test mutable state: populated in beforeEach, cleared in afterEach.
  const store: Record<string, Record<string, unknown>> = {};

  // Schema auto-derivation (opt-in via opts.schema): create just the tables these
  // fixture sets touch, sliced from the supplied schema. Registered as a beforeAll so
  // it runs once before the per-test seeding beforeEach below — and after any handler
  // suite's setup (registered earlier in the describe body), so getAdapter() is live.
  if (opts?.schema) {
    const fullSchema = opts.schema;
    beforeAll(async () => {
      if (!fixtures) fixtures = await resolveFixtureNames(keys as readonly FixtureName[]);
      await defineSchema(getAdapter(), sliceSchema(fixtures, fullSchema));
    });
  }

  // TODO(fixtures-adoption Spike S1): seed once per worker in a global beforeAll
  // (before the pinned transaction opens) when useHandlerTransactionalFixtures is
  // active, falling back to this per-test seed otherwise. Deferred to a follow-up
  // PR to keep this one under the LOC ceiling. See docs/activerecord/activerecord-index.md (fixtures-adoption note).
  beforeEach(async () => {
    // Resolve from the `keys` snapshot, not `fixturesOrNames`: a caller can mutate
    // the (mutable-assignable) array after this call, which would otherwise seed a
    // different set than the accessors built below from `keys`.
    if (!fixtures) fixtures = await resolveFixtureNames(keys as readonly FixtureName[]);
    const adapter = getAdapter();
    for (const [key, { table, model, data }] of Object.entries(fixtures)) {
      const result =
        model === null
          ? await defineJoinTableFixtures(adapter, table, data)
          : await defineFixtures(adapter, model, data);
      store[key] = result as Record<string, unknown>;
    }
  });

  afterEach(async () => {
    if (!fixtures) return;
    const adapter = getAdapter();
    // Delete in reverse insertion order to respect FK constraints.
    for (const { table } of Object.values(fixtures).reverse()) {
      try {
        await adapter.executeMutation(`DELETE FROM ${adapter.quoteTableName(table)}`);
      } catch (e) {
        if (!isTableMissingError(e)) throw e;
      }
    }
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const accessor = (name: string) => {
      const set = store[key];
      if (!set)
        throw new Error(`useFixtures: fixture set "${key}" not loaded — call inside a test`);
      const instance = set[name];
      if (!instance) throw new Error(`useFixtures: no fixture named "${name}" in set "${key}"`);
      return instance;
    };
    accessor.all = () => {
      const set = store[key];
      if (!set)
        throw new Error(`useFixtures: fixture set "${key}" not loaded — call inside a test`);
      return Object.values(set);
    };
    result[key] = accessor;
  }
  return result;
}
