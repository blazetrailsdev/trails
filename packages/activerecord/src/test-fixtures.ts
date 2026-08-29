import { afterEach, beforeEach } from "vitest";
import {
  prepareModelFixtures,
  prepareJoinTableFixtures,
  insertPreparedFixtureSets,
  effectiveFixtureKey,
  type PreparedFixtureSet,
} from "./fixtures.js";
import {
  fixtureRegistry,
  isJoinTableEntry,
  type FixtureName,
  type RegistryModel,
  type RegistryData,
  type IsJoinTableName,
} from "./test-helpers/fixtures-registry.js";
export type { FixtureName } from "./test-helpers/fixtures-registry.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { registerModel } from "./associations.js";
import {
  warmSchemaCacheBeforeFirstTest,
  withTransactionalFixtures,
  type WithTransactionalFixturesOptions,
} from "./test-fixtures/with-transactional-fixtures.js";
import {
  leaseFixtureConnection,
  leaseFixtureConnectionFor,
} from "./test-fixtures/fixture-connection.js";

export type TablelessFixtureEntry = {
  table: string;
  data: Record<string, Record<string, unknown>>;
};

export { FixtureSet } from "./fixtures.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

export type FixtureMap = Record<string, [BaseClass, Record<string, FixtureAttrs>]>;

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

export type UseFixturesByNameResult<N extends FixtureName> = {
  [K in N]: IsJoinTableName<K> extends true
    ? JoinTableAccessor<Extract<keyof RegistryData<K>, string>>
    : FixtureAccessor<RegistryModel<K>, Extract<keyof RegistryData<K>, string>>;
};

export interface FixturesConnectionOpts {
  connection?: () => DatabaseAdapter;
}

/**
 * Resolves fixture-set names through the registry into the `[Model, data]` map shape.
 * Model classes are dynamic-imported (see {@link FixtureRegistryEntry}), so this is async.
 *
 * Two requested sets backed by the same table (e.g. `deadParrots`/`liveParrots`
 * → `parrots`, `dogs`/`otherDogs` → `dogs`) load together in one call: the
 * loader prepares every set, MERGES their rows per table, and issues a single
 * `insertFixturesSet` that deletes each table once and inserts all rows together
 * (see {@link insertPreparedFixtureSets}), mirroring how Rails loads multiple
 * same-table fixture files (fixtures.rb groups by table then unshifts all rows).
 * The only rejected case is genuinely-conflicting rows: two same-table sets whose
 * rows resolve to the same primary key. A row's key is resolved the way the loader
 * derives it — an explicit pin on the model's real primary-key column, else the
 * label-derived CRC32 id — in one keyspace, so a pinned id and a colliding derived
 * id are both caught. Join-table sets (no model) concatenate and are not guarded.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE FixtureSet.create_fixtures' name-to-model resolution (fixtures.rb:595), async because model classes load by dynamic import.
 */
export async function resolveFixtureNames(
  names: readonly FixtureName[],
): Promise<ResolvedFixtureMap> {
  const map: ResolvedFixtureMap = {};
  const tableRowKeys = new Map<string, Map<string, string>>();
  for (const name of names) {
    const entry = fixtureRegistry[name] as (typeof fixtureRegistry)[FixtureName] | undefined;
    if (!entry) {
      throw new Error(
        `useFixtures: no fixture set named "${name}" in the registry — add it to fixtures-registry.ts`,
      );
    }
    let table: string;
    let model: BaseClass | null;
    if (isJoinTableEntry(entry)) {
      table = entry.joinTable;
      model = null;
    } else {
      if ("addOn" in entry) await entry.addOn?.();
      const resolved = await entry.model();
      const models = (Array.isArray(resolved) ? resolved : [resolved]) as BaseClass[];
      registerModel(models);
      const m = models[0];
      table = m.tableName;
      model = m;
    }
    if (model !== null) {
      let rowKeys = tableRowKeys.get(table);
      if (rowKeys === undefined) {
        rowKeys = new Map();
        tableRowKeys.set(table, rowKeys);
      }
      for (const [label, row] of Object.entries(entry.data)) {
        const key = effectiveFixtureKey(model, label, row);
        const prior = rowKeys.get(key);
        if (prior !== undefined) {
          throw new Error(
            `useFixtures: ${prior} and "${name}" (${label}) both map to table "${table}" with a ` +
              `row that resolves to the same primary key; same-table sets load together, but ` +
              `two rows sharing a primary key collide. Rename the label or change the pinned id.`,
          );
        }
        rowKeys.set(key, `"${name}" (${label})`);
      }
    }
    map[name] = { table, model, data: entry.data };
  }
  return map;
}

export type UseTablelessFixturesResult<T extends readonly TablelessFixtureEntry[]> = {
  [E in T[number] as E["table"]]: JoinTableAccessor<Extract<keyof E["data"], string>>;
};

/** @internal */
function useTablelessFixtures(
  entries: readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter,
): Record<string, unknown> {
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

  beforeEach(async () => {
    const adapter = getAdapter();
    const prepared: PreparedFixtureSet[] = [];
    const tables: string[] = [];
    for (const { table, data } of entries) {
      prepared.push(await prepareJoinTableFixtures(adapter, table, data));
      tables.push(table);
    }
    const results = await insertPreparedFixtureSets(adapter, prepared);
    results.forEach((result, i) => {
      store[tables[i]] = result;
    });
  });

  afterEach(() => {
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

/** @internal */
function useFixtures<M extends FixtureMap>(
  fixtures: M,
  getAdapter: () => DatabaseAdapter,
): UseFixturesResult<M>;
function useFixtures<const N extends FixtureName>(
  names: readonly N[],
  getAdapter: () => DatabaseAdapter,
): UseFixturesByNameResult<N>;
function useFixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  getAdapter: () => DatabaseAdapter,
): UseTablelessFixturesResult<T>;
function useFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter,
): Record<string, unknown> {
  if (
    Array.isArray(fixturesOrNames) &&
    fixturesOrNames.length > 0 &&
    typeof (fixturesOrNames as readonly unknown[])[0] === "object" &&
    (fixturesOrNames as readonly unknown[])[0] !== null &&
    "table" in ((fixturesOrNames as readonly TablelessFixtureEntry[])[0] as object)
  ) {
    for (let i = 1; i < (fixturesOrNames as readonly unknown[]).length; i++) {
      const el = (fixturesOrNames as readonly unknown[])[i];
      if (typeof el !== "object" || el === null || !("table" in el)) {
        throw new Error(
          `useFixtures: mixed tableless and by-name entries are not supported. ` +
            `Element at index ${i} (${JSON.stringify(el)}) is not a tableless { table, data } entry.`,
        );
      }
    }
    return useTablelessFixtures(fixturesOrNames as readonly TablelessFixtureEntry[], getAdapter);
  }
  if (
    Array.isArray(fixturesOrNames) &&
    fixturesOrNames.length > 1 &&
    typeof (fixturesOrNames as readonly unknown[])[0] === "string"
  ) {
    for (let i = 1; i < (fixturesOrNames as readonly unknown[]).length; i++) {
      const el = (fixturesOrNames as readonly unknown[])[i];
      if (typeof el === "object" && el !== null && "table" in el) {
        throw new Error(
          `useFixtures: mixed tableless and by-name entries are not supported. ` +
            `Element at index ${i} is a tableless { table, data } entry but the array started with a by-name string.`,
        );
      }
    }
  }
  const isNameArray = Array.isArray(fixturesOrNames);
  const keys: string[] = isNameArray
    ? (fixturesOrNames as readonly string[]).slice()
    : Object.keys(fixturesOrNames as FixtureMap);

  let fixtures: ResolvedFixtureMap | undefined = isNameArray
    ? undefined
    : Object.fromEntries(
        Object.entries(fixturesOrNames as FixtureMap).map(([key, [model, data]]) => [
          key,
          { table: model.tableName, model, data },
        ]),
      );

  const store: Record<string, Record<string, unknown>> = {};

  beforeEach(async () => {
    if (!fixtures) fixtures = await resolveFixtureNames(keys as readonly FixtureName[]);
    const fixtureConnection = getAdapter();
    const groups = new Map<DatabaseAdapter, { prepared: PreparedFixtureSet[]; keys: string[] }>();
    for (const [key, { table, model, data }] of Object.entries(fixtures)) {
      if (model !== null && "_isActiveRecordBase" in model) {
        registerModel(model);
      }
      const adapter = await leaseFixtureConnectionFor(model, fixtureConnection);
      let group = groups.get(adapter);
      if (group === undefined) {
        group = { prepared: [], keys: [] };
        groups.set(adapter, group);
      }
      group.prepared.push(
        model === null
          ? await prepareJoinTableFixtures(adapter, table, data)
          : await prepareModelFixtures(adapter, model, data),
      );
      group.keys.push(key);
    }
    for (const [adapter, group] of groups) {
      const results = await insertPreparedFixtureSets(adapter, group.prepared);
      results.forEach((result, i) => {
        store[group.keys[i]] = result;
      });
    }
  });

  afterEach(() => {
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

type FixturesOptions = WithTransactionalFixturesOptions & FixturesConnectionOpts;

/** @internal */
export function fixtures<M extends FixtureMap>(
  fixtures: M,
  options?: FixturesOptions,
): UseFixturesResult<M>;
export function fixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: FixturesOptions,
): UseFixturesByNameResult<N>;
export function fixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  options?: FixturesOptions,
): UseTablelessFixturesResult<T>;
export function fixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  options: FixturesOptions | undefined = undefined,
): Record<string, unknown> {
  const { usesTransaction, useTransactionalTests, connection } = options ?? {};

  const getConnection = connection ?? leaseFixtureConnection;

  if (useTransactionalTests !== false) {
    withTransactionalFixtures(getConnection, { usesTransaction });
  } else {
    warmSchemaCacheBeforeFirstTest(getConnection);
  }

  return useFixtures(fixturesOrNames as FixtureMap, getConnection);
}
