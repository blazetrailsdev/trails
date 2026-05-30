import { afterEach, beforeAll, beforeEach } from "vitest";
import { defineFixtures } from "./define-fixtures.js";
import { defineSchema, type Schema } from "./define-schema.js";
import {
  fixtureRegistry,
  type FixtureName,
  type RegistryModel,
  type RegistryData,
} from "./fixtures-registry.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { Base } from "../base.js";

export { FixtureSet } from "./fixture-set.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

type FixtureMap = Record<string, [BaseClass, Record<string, FixtureAttrs>]>;

type FixtureAccessor<T extends BaseClass, K extends string> = {
  (name: K): InstanceType<T>;
  all(): InstanceType<T>[];
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
  [K in N]: FixtureAccessor<RegistryModel<K>, Extract<keyof RegistryData<K>, string>>;
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
export async function resolveFixtureNames(names: readonly FixtureName[]): Promise<FixtureMap> {
  const map: FixtureMap = {};
  const tableToName = new Map<string, string>();
  for (const name of names) {
    const entry = fixtureRegistry[name as FixtureName] as
      | { model: () => Promise<BaseClass>; data: Record<string, FixtureAttrs> }
      | undefined;
    if (!entry) {
      throw new Error(
        `useFixtures: no fixture set named "${name}" in the registry — add it to fixtures-registry.ts`,
      );
    }
    const model = await entry.model();
    const prior = tableToName.get(model.tableName);
    if (prior !== undefined) {
      throw new Error(
        `useFixtures: "${name}" and "${prior}" both map to table "${model.tableName}"; ` +
          `combined same-table loading isn't supported yet (defineFixtures deletes the ` +
          `table per set). Load only one of them in this test/scope — splitting across ` +
          `separate useFixtures calls does not help, since the later loader's delete still ` +
          `clobbers the earlier set on every test.`,
      );
    }
    tableToName.set(model.tableName, name);
    map[name] = [model, entry.data];
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

/** Picks each resolved set's table out of `fullSchema`, keyed by the model's `tableName`. */
function sliceSchema(fixtures: FixtureMap, fullSchema: Schema): Schema {
  const sub: Schema = {};
  for (const [, [model]] of Object.entries(fixtures)) {
    const table = model.tableName;
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
export function useFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[],
  getAdapter: () => DatabaseAdapter,
  opts?: UseFixturesOpts,
): Record<string, unknown> {
  const isNameArray = Array.isArray(fixturesOrNames);
  // Keys are known synchronously (the names, or the map's own keys) so accessors
  // can be wired up before the (possibly async) model resolution in beforeEach.
  const keys: string[] = isNameArray
    ? (fixturesOrNames as readonly string[]).slice()
    : Object.keys(fixturesOrNames as FixtureMap);

  // The resolved `[Model, data]` map. For the object-map overload it's known
  // up front; for the name-array overload it's filled in beforeEach once the
  // model thunks resolve (dynamic imports must stay lazy — see fixtures-registry).
  let fixtures: FixtureMap | undefined = isNameArray ? undefined : (fixturesOrNames as FixtureMap);

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
  // PR to keep this one under the LOC ceiling. See docs/activerecord/fixtures-adoption-plan.md.
  beforeEach(async () => {
    // Resolve from the `keys` snapshot, not `fixturesOrNames`: a caller can mutate
    // the (mutable-assignable) array after this call, which would otherwise seed a
    // different set than the accessors built below from `keys`.
    if (!fixtures) fixtures = await resolveFixtureNames(keys as readonly FixtureName[]);
    const adapter = getAdapter();
    for (const [key, [ModelClass, data]] of Object.entries(fixtures)) {
      const result = await defineFixtures(adapter, ModelClass, data);
      store[key] = result as Record<string, unknown>;
    }
  });

  afterEach(async () => {
    if (!fixtures) return;
    const adapter = getAdapter();
    // Delete in reverse insertion order to respect FK constraints.
    for (const [, [ModelClass]] of Object.entries(fixtures).reverse()) {
      try {
        await adapter.executeMutation(
          `DELETE FROM ${adapter.quoteTableName(ModelClass.tableName)}`,
        );
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
