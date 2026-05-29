import { afterEach, beforeEach } from "vitest";
import { defineFixtures } from "./define-fixtures.js";
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
 */
export function useFixtures<M extends FixtureMap>(
  fixtures: M,
  getAdapter: () => DatabaseAdapter,
): UseFixturesResult<M>;
export function useFixtures<const N extends FixtureName>(
  names: readonly N[],
  getAdapter: () => DatabaseAdapter,
): UseFixturesByNameResult<N>;
export function useFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[],
  getAdapter: () => DatabaseAdapter,
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
