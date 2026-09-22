import { afterEach, beforeEach, type TaskContext } from "vitest";
import { getCurrentSuite } from "vitest/suite";
import { Dir, File as RubyFile, include, included, merge } from "@blazetrails/ruby-compat";
import {
  Notifications,
  classAttribute,
  extend,
  isBlank,
  runLoadHooks,
  stringifyKeys,
  type NotificationSubscriber,
} from "@blazetrails/activesupport";
import { FixtureSet, checkAllForeignKeysValidBang } from "./fixtures.js";
import { File as FixtureFile } from "./fixture-set/file.js";
import { insertFixturesSet } from "./connection-adapters/abstract/database-statements.js";
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
  type WithTransactionalFixturesOptions,
} from "./test-fixtures/with-transactional-fixtures.js";
import { leaseFixtureConnection } from "./test-fixtures/fixture-connection.js";
import { NullPool, type ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";

function effectiveFixtureKey(
  model: typeof Base,
  label: string,
  row: Record<string, unknown>,
): string {
  const pk = model.primaryKey;
  if (Array.isArray(pk)) {
    const generated = FixtureSet.compositeIdentify(label, pk);
    return "c:" + JSON.stringify(pk.map((col) => row[col] ?? generated[col]));
  }
  if (typeof pk !== "string") return "l:" + label;
  return "s:" + String(row[pk] ?? FixtureSet.identify(label));
}

interface TestFixturesClassHost {
  name: string;
  fixturePaths: string[];
  fileFixturePath?: unknown;
  fixtureTableNames: string[];
  fixtureClassNames: Record<string, unknown>;
  fixtureSets: Record<string, string>;
  _usesTransaction?: string[];
}

export const ClassMethods = {
  setFixtureClass(this: TestFixturesClassHost, classNames: Record<string, unknown> = {}): void {
    this.fixtureClassNames = merge(this.fixtureClassNames, stringifyKeys(classNames));
  },

  fixtures(this: TestFixturesClassHost, ...fixtureSetNames: unknown[]): void {
    if (fixtureSetNames[0] === ":all") {
      if (isBlank(this.fixturePaths))
        throw new Error(`No fixture path found. Please set \`${this.name}.fixturePaths\`.`);
      fixtureSetNames = [
        ...new Set(
          this.fixturePaths.flatMap((path) => {
            let names = [
              ...new Set([
                ...Dir.glob(RubyFile.join(path, "{**,*}/*.{yml}")),
                ...FixtureFile.modules().filter((f) =>
                  RubyFile.fnmatch(
                    RubyFile.join(path, "{**,*}/*.{ts}"),
                    f,
                    RubyFile.FNM_EXTGLOB | RubyFile.FNM_PATHNAME,
                  ),
                ),
              ]),
            ];
            if (this.fileFixturePath)
              names = names.filter((f) => !f.startsWith(String(this.fileFixturePath)));
            return names.map((f) =>
              f.slice(String(path).length, -RubyFile.extname(f).length).replace(/^\//, ""),
            );
          }),
        ),
      ];
    } else {
      fixtureSetNames = fixtureSetNames.flat(Infinity).map((n) => String(n));
    }

    this.fixtureTableNames = [
      ...new Set([...this.fixtureTableNames, ...(fixtureSetNames as string[])]),
    ].sort();
    ClassMethods.setupFixtureAccessors.call(this, fixtureSetNames as string[]);
  },

  setupFixtureAccessors(
    this: TestFixturesClassHost,
    fixtureSetNames: string | string[] | null = null,
  ): void {
    fixtureSetNames = [fixtureSetNames ?? this.fixtureTableNames].flat();
    if (fixtureSetNames.length !== 0) {
      this.fixtureSets = { ...this.fixtureSets };
      for (const fsName of fixtureSetNames) {
        const key = fsName.includes("/") ? fsName.replaceAll("/", "_") : fsName;
        this.fixtureSets[key] = fsName;
      }
    }
  },

  usesTransaction(this: TestFixturesClassHost, ...methods: unknown[]): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_usesTransaction")) this._usesTransaction = [];
    this._usesTransaction!.push(...methods.map((m) => String(m)));
  },

  isUsesTransaction(this: TestFixturesClassHost, method: unknown): boolean {
    if (!Object.prototype.hasOwnProperty.call(this, "_usesTransaction")) this._usesTransaction = [];
    return this._usesTransaction!.includes(String(method));
  },
};

export const TestFixtures = {
  [included](base: unknown): void {
    extend(base as object, ClassMethods);
    classAttribute.call(base, "fixturePaths", { instanceWriter: false, default: [] });
    classAttribute.call(base, "fixtureTableNames", { default: [] });
    classAttribute.call(base, "fixtureClassNames", { default: {} });
    classAttribute.call(base, "useTransactionalTests", { default: true });
    classAttribute.call(base, "useInstantiatedFixtures", { default: false });
    classAttribute.call(base, "preLoadedFixtures", { default: false });
    classAttribute.call(base, "lockThreads", { default: true });
    classAttribute.call(base, "fixtureSets", { default: {} });

    runLoadHooks("active_record_fixtures", base);
  },
};

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
  (name: K, forceReload: true): Promise<InstanceType<T>>;
  (...names: [K, K, ...K[]]): InstanceType<T>[];
  (): InstanceType<T>[];
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
 * `insertFixturesSet` that deletes each table once and inserts all rows together,
 * mirroring how Rails loads multiple
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

let useFixturesCount = 0;

const alreadyLoadedFixtures = new Map<unknown, unknown>();

interface TestFixturesInstance {
  name: string;
  useTransactionalTests: boolean;
  lockThreads: boolean;
  constructor: TestCaseClass;
  _inEnclosingTransaction?: boolean;
}

function newTestCase(klass: TestCaseClass, ctx: TaskContext): TestFixturesInstance {
  const testCase = new klass() as TestFixturesInstance;
  testCase.name = ctx.task.name;
  return testCase;
}

/** @internal */
async function setupFixtures<T>(
  this: TestFixturesInstance,
  config: typeof Base,
  adapter: DatabaseAdapter,
  fixtureCacheKey: unknown,
  loadFixtures: (config: typeof Base) => Promise<T>,
): Promise<T> {
  let loadedFixtures: T;
  this._inEnclosingTransaction =
    ((adapter as { transactionManager?: { openTransactions: number } }).transactionManager
      ?.openTransactions ?? 0) > 0;
  if (isRunInTransaction.call(this)) {
    loadedFixtures = alreadyLoadedFixtures.get(fixtureCacheKey) as T;
    if (loadedFixtures === undefined) {
      alreadyLoadedFixtures.clear();
      loadedFixtures = await loadFixtures(config);
      alreadyLoadedFixtures.set(fixtureCacheKey, loadedFixtures);
    }

    await setupTransactionalFixtures.call(this, adapter);
  } else {
    FixtureSet.resetCache();
    invalidateAlreadyLoadedFixtures();
    loadedFixtures = await loadFixtures(config);
  }
  return loadedFixtures;
}

/**
 * @internal
 * @missingRailsCall teardown_asynchronous_queries_session — CONVERGEABLE converge-with-transactional-fixtures-onto-test-fixtures-setup
 * @missingRailsCall clear_active_connections! — CONVERGEABLE converge-with-transactional-fixtures-onto-test-fixtures-setup
 */
async function teardownFixtures(
  this: TestFixturesInstance,
  adapter: DatabaseAdapter,
): Promise<void> {
  if (isRunInTransaction.call(this)) {
    await teardownTransactionalFixtures.call(this, adapter);
  } else {
    FixtureSet.resetCache();
    invalidateAlreadyLoadedFixtures();
  }
}

/** @internal */
function isRunInTransaction(this: TestFixturesInstance): boolean {
  return (
    this.useTransactionalTests &&
    !this.constructor.isUsesTransaction(this.name) &&
    !this._inEnclosingTransaction
  );
}

/** @internal */
function invalidateAlreadyLoadedFixtures(): void {
  alreadyLoadedFixtures.clear();
}

let fixtureConnectionPools: ConnectionPool[] | null = null;

let fixtureScopeDepth = 0;

let pinnedPools: ConnectionPool[] = [];

let connectionSubscriber: NotificationSubscriber | null = null;

let pendingPins: Promise<void>[] = [];

function pooledAdapterPool(adapter: DatabaseAdapter): ConnectionPool | null {
  const pool = (adapter as { pool?: unknown }).pool;
  if (pool == null || pool instanceof NullPool) return null;
  return pool as ConnectionPool;
}

async function pinConnectionPool(pool: ConnectionPool, lockThreads: boolean): Promise<void> {
  await pool.pinConnectionBang(lockThreads);
  pinnedPools.push(pool);
  await pool.leaseConnection();
}

function transactionManager(adapter: DatabaseAdapter) {
  const host = adapter as unknown as {
    transactionManager?: {
      beginTransaction: (opts: { joinable: boolean; _lazy: boolean }) => Promise<unknown>;
      rollbackTransaction: () => Promise<void>;
      openTransactions: number;
    };
  };
  if (!host.transactionManager) {
    throw new Error(
      `setupTransactionalFixtures: adapter ${(adapter as { adapterName?: string }).adapterName ?? "unknown"} ` +
        `does not expose transactionManager`,
    );
  }
  return host.transactionManager;
}

/**
 * @internal
 * @missingRailsCall setup_shared_connection_pool — CONVERGEABLE converge-with-transactional-fixtures-onto-test-fixtures-setup
 */
async function setupTransactionalFixtures(
  this: TestFixturesInstance,
  adapter: DatabaseAdapter,
): Promise<void> {
  const lockThreads = this.lockThreads;
  const pool = pooledAdapterPool(adapter);
  if (pool) {
    if (fixtureConnectionPools === null) {
      fixtureConnectionPools = Base.connectionHandler.connectionPoolList("writing");
      if (!fixtureConnectionPools.includes(pool)) fixtureConnectionPools.push(pool);
      for (const p of fixtureConnectionPools) {
        await pinConnectionPool(p, lockThreads);
      }
    }
    fixtureScopeDepth++;
  } else {
    await transactionManager(adapter).beginTransaction({ joinable: false, _lazy: false });
  }

  connectionSubscriber = Notifications.subscribe("!connection.active_record", (event) => {
    const payload = event.payload as { connection_name?: string; shard?: string };
    const connectionName = "connection_name" in payload ? payload.connection_name : undefined;
    const shard = "shard" in payload ? payload.shard : undefined;

    if (connectionName != null) {
      const newPool = Base.connectionHandler.retrieveConnectionPool(connectionName, { shard });
      if (newPool) {
        if (fixtureConnectionPools !== null && !fixtureConnectionPools.includes(newPool)) {
          fixtureConnectionPools.push(newPool);
          pendingPins.push(
            newPool
              .leaseConnection()
              .then((connection) =>
                connection.lock.synchronize(() => pinConnectionPool(newPool, lockThreads)),
              ),
          );
        }
      }
    }
  });
}

/**
 * @internal
 * @missingRailsCall teardown_shared_connection_pool — CONVERGEABLE converge-with-transactional-fixtures-onto-test-fixtures-setup
 */
async function teardownTransactionalFixtures(
  this: TestFixturesInstance,
  adapter: DatabaseAdapter,
): Promise<void> {
  if (connectionSubscriber) {
    Notifications.unsubscribe(connectionSubscriber);
    connectionSubscriber = null;
  }
  const pins = pendingPins;
  pendingPins = [];
  const pinResults = await Promise.allSettled(pins);
  if (fixtureConnectionPools !== null && pooledAdapterPool(adapter) !== null) {
    if (--fixtureScopeDepth === 0) {
      const pools = pinnedPools;
      pinnedPools = [];
      let clean = true;
      for (const pool of pools) {
        if (!(await pool.unpinConnectionBang())) clean = false;
      }
      if (!clean) alreadyLoadedFixtures.clear();
      fixtureConnectionPools = null;
    }
  } else {
    const t = transactionManager(adapter);
    while (t.openTransactions > 0) await t.rollbackTransaction();
  }
  const failed = pinResults.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

/** @noRailsEquivalent CONVERGEABLE converge-with-transactional-fixtures-onto-test-fixtures-setup */
export function withTransactionalFixtures(
  getAdapter: () => DatabaseAdapter | Promise<DatabaseAdapter>,
  options: WithTransactionalFixturesOptions = {},
): void {
  const { eagerWarmSchemaCache: eagerWarm = true, usesTransaction = [] } = options;
  if (eagerWarm) warmSchemaCacheBeforeFirstTest(getAdapter);
  const klass = testCaseClassFor(getCurrentSuite().suite as SuiteScope | undefined);
  klass.usesTransaction(...usesTransaction);
  let testCase: TestFixturesInstance | null = null;

  beforeEach(async (ctx: TaskContext) => {
    testCase = newTestCase(klass, ctx);
    testCase.useTransactionalTests = true;
    if (!isRunInTransaction.call(testCase)) return;
    await setupTransactionalFixtures.call(testCase, await getAdapter());
  });

  afterEach(async () => {
    const current = testCase;
    testCase = null;
    if (current === null || !isRunInTransaction.call(current)) return;
    await teardownTransactionalFixtures.call(current, await getAdapter());
  });
}

/** @internal */
function useTablelessFixtures(
  entries: readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter | Promise<DatabaseAdapter>,
  newFixturesTestCase: (ctx: TaskContext) => TestFixturesInstance,
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
  const fixtureCacheKey = {};
  const fixturesDirectory = `use-fixtures/${++useFixturesCount}`;
  for (const { table, data } of entries) {
    FixtureFile.registerModule(`${fixturesDirectory}/${table}.ts`, data);
  }
  let testCase: TestFixturesInstance | null = null;

  beforeEach(async (ctx) => {
    const adapter = await getAdapter();
    const loadFixtures = async () => {
      const fixtureSets = entries.map(
        ({ table }) => new FixtureSet(null, table, null, `${fixturesDirectory}/${table}`),
      );
      const tableRowsForConnection: Record<string, Record<string, unknown>[]> = {};
      for (const fixtureSet of fixtureSets) {
        for (const [table, rows] of Object.entries(fixtureSet.tableRows())) {
          (tableRowsForConnection[table] ??= []).unshift(...rows);
        }
      }
      await insertFixturesSet.call(
        adapter as unknown as ThisParameterType<typeof insertFixturesSet>,
        tableRowsForConnection,
        Object.keys(tableRowsForConnection),
      );
      await checkAllForeignKeysValidBang(adapter);
      return fixtureSets.map((fixtureSet) =>
        Object.fromEntries(
          Object.entries(fixtureSet.fixtures).map(([label, fixture]) => [label, fixture.toHash()]),
        ),
      );
    };
    testCase = newFixturesTestCase(ctx);
    const results = await (setupFixtures<Record<string, unknown>[]>).call(
      testCase,
      Base,
      adapter,
      fixtureCacheKey,
      loadFixtures,
    );
    results.forEach((result, i) => {
      store[keys[i]] = result;
    });
  });

  afterEach(async () => {
    for (const key of keys) delete store[key];
    const current = testCase;
    testCase = null;
    if (current !== null) await teardownFixtures.call(current, await getAdapter());
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
  getAdapter: () => DatabaseAdapter | Promise<DatabaseAdapter>,
  newFixturesTestCase: (ctx: TaskContext) => TestFixturesInstance,
): UseFixturesResult<M>;
function useFixtures<const N extends FixtureName>(
  names: readonly N[],
  getAdapter: () => DatabaseAdapter | Promise<DatabaseAdapter>,
  newFixturesTestCase: (ctx: TaskContext) => TestFixturesInstance,
): UseFixturesByNameResult<N>;
function useFixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  getAdapter: () => DatabaseAdapter | Promise<DatabaseAdapter>,
  newFixturesTestCase: (ctx: TaskContext) => TestFixturesInstance,
): UseTablelessFixturesResult<T>;
function useFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter | Promise<DatabaseAdapter>,
  newFixturesTestCase: (ctx: TaskContext) => TestFixturesInstance,
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
    return useTablelessFixtures(
      fixturesOrNames as readonly TablelessFixtureEntry[],
      getAdapter,
      newFixturesTestCase,
    );
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
  const loadedFixtures: Record<string, FixtureSet> = {};
  const fixtureCacheKey = isNameArray ? JSON.stringify(keys) : {};
  const fixturesDirectory = `use-fixtures/${++useFixturesCount}`;
  let testCase: TestFixturesInstance | null = null;

  beforeEach(async (ctx) => {
    if (!fixtures) fixtures = await resolveFixtureNames(keys as readonly FixtureName[]);
    const fixtureClassNames: Record<string, BaseClass | null> = {};
    const fixtureSetNames: string[] = [];
    for (const [key, { table, model, data }] of Object.entries(fixtures)) {
      if (model !== null && "_isActiveRecordBase" in model) {
        registerModel(model);
      }
      const fsName = model === null ? table : key;
      FixtureFile.registerModule(`${fixturesDirectory}/${fsName}.ts`, data);
      fixtureClassNames[fsName] = model;
      fixtureSetNames.push(fsName);
    }
    const adapter = await getAdapter();
    const fixturePool = adapter.pool;
    const config =
      fixturePool instanceof NullPool
        ? Base
        : ({ connectionPool: () => fixturePool } as unknown as typeof Base);
    testCase = newFixturesTestCase(ctx);
    const fixtureSets = await (setupFixtures<FixtureSet[]>).call(
      testCase,
      config,
      adapter,
      fixtureCacheKey,
      (config) =>
        FixtureSet.createFixtures(fixturesDirectory, fixtureSetNames, fixtureClassNames, config),
    );
    const loaded = Object.keys(fixtures);
    for (let i = 0; i < loaded.length; i++) {
      const fixtureSet = fixtureSets[i];
      loadedFixtures[loaded[i]] = fixtureSet;
      const set: Record<string, unknown> = {};
      for (const [label, fixture] of Object.entries(fixtureSet.fixtures)) {
        set[label] =
          fixtureClassNames[fixtureSet.name] === null ? fixture.toHash() : await fixture.find();
      }
      store[loaded[i]] = set;
    }
  });

  afterEach(async () => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    const current = testCase;
    testCase = null;
    if (current !== null) await teardownFixtures.call(current, await getAdapter());
  });

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const accessor = (...fixtureNames: unknown[]) => {
      const set = store[key];
      if (!set)
        throw new Error(`useFixtures: fixture set "${key}" not loaded — call inside a test`);
      const forceReload = fixtureNames.at(-1) === true || fixtureNames.at(-1) === ":reload";
      if (forceReload) fixtureNames.pop();
      const returnSingleRecord = fixtureNames.length === 1;
      if (fixtureNames.length === 0) fixtureNames = Object.keys(set);
      const instances = fixtureNames.map((fName) => {
        if (typeof fName !== "string")
          throw new Error(`useFixtures: no fixture named "${String(fName)}" in set "${key}"`);
        if (forceReload) {
          const fixture = loadedFixtures[key]?.fixtures[fName];
          if (!fixture) throw new Error(`useFixtures: no fixture named "${fName}" in set "${key}"`);
          return fixture.find().then((instance: unknown) => (set[fName] = instance));
        }
        const instance = set[fName];
        if (!instance) throw new Error(`useFixtures: no fixture named "${fName}" in set "${key}"`);
        return instance;
      });
      if (forceReload) {
        return returnSingleRecord ? instances[0] : Promise.all(instances);
      }
      return returnSingleRecord ? instances[0] : instances;
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

type SuiteScope = { suite?: SuiteScope };
type TestCaseClass = (new () => object) & TestFixturesClassHost & typeof ClassMethods;

const testCaseClasses = new WeakMap<SuiteScope, TestCaseClass>();

function testCaseClassFor(suite: SuiteScope | undefined): TestCaseClass {
  if (suite === undefined) {
    const klass = class {} as TestCaseClass;
    include(klass, TestFixtures);
    return klass;
  }
  let klass = testCaseClasses.get(suite);
  if (klass === undefined) {
    klass = class extends testCaseClassFor(suite.suite) {} as TestCaseClass;
    testCaseClasses.set(suite, klass);
  }
  return klass;
}

/** @internal */
export function fixtures<M extends FixtureMap>(
  fixtures: M,
  options?: FixturesOptions,
): UseFixturesResult<M> & { readonly fixtureTableNames: string[] };
export function fixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: FixturesOptions,
): UseFixturesByNameResult<N> & { readonly fixtureTableNames: string[] };
export function fixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  options?: FixturesOptions,
): UseTablelessFixturesResult<T> & { readonly fixtureTableNames: string[] };
export function fixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  options: FixturesOptions | undefined = undefined,
): Record<string, unknown> {
  const { usesTransaction, useTransactionalTests, connection } = options ?? {};

  const getConnection = connection ?? leaseFixtureConnection;
  warmSchemaCacheBeforeFirstTest(getConnection);
  const klass = testCaseClassFor(getCurrentSuite().suite as SuiteScope | undefined);
  klass.usesTransaction(...(usesTransaction ?? []));
  const result = useFixtures(fixturesOrNames as FixtureMap, getConnection, (ctx) => {
    const testCase = newTestCase(klass, ctx);
    if (useTransactionalTests !== undefined) testCase.useTransactionalTests = useTransactionalTests;
    return testCase;
  });

  const fixtureSetNames = Array.isArray(fixturesOrNames)
    ? (fixturesOrNames as readonly (string | TablelessFixtureEntry)[]).map((entry) =>
        typeof entry === "string" ? entry : entry.table,
      )
    : Object.keys(fixturesOrNames);
  klass.fixtures(fixtureSetNames);

  Object.defineProperty(result, "fixtureTableNames", { get: () => klass.fixtureTableNames });
  return result;
}
