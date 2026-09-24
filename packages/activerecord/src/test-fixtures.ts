import { afterEach, beforeEach, type TaskContext } from "vitest";
import { getCurrentSuite } from "vitest/suite";
import {
  Dir,
  Hash,
  File as RubyFile,
  RuntimeError,
  StandardError,
  hashDelete,
  include,
  included,
  isEmpty,
  merge,
  rbEql,
} from "@blazetrails/ruby-compat";
import {
  Notifications,
  classAttribute,
  extend,
  indexBy,
  isBlank,
  runLoadHooks,
  stringifyKeys,
  underscore,
  type NotificationSubscriber,
} from "@blazetrails/activesupport";
import { FixtureSet } from "./fixtures.js";
import { File as FixtureFile } from "./fixture-set/file.js";
import {
  FIXTURES_ROOT,
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
import { NullPool, type ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import type { PoolConfig } from "./connection-adapters/pool-config.js";
import { writingRole } from "./active-record.js";

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
  connection?: () => DatabaseAdapter | Promise<DatabaseAdapter>;
}

/**
 * Resolves fixture-set names through the registry into their table and model.
 * Model classes are dynamic-imported (see {@link FixtureRegistryEntry}), so this is async.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE FixtureSet.create_fixtures' name-to-model resolution (fixtures.rb:595), async because model classes load by dynamic import.
 */
export async function resolveFixtureNames(
  names: readonly FixtureName[],
): Promise<ResolvedFixtureMap> {
  const map: ResolvedFixtureMap = {};
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
    map[name] = { table, model, data: entry.data };
  }
  return map;
}

const alreadyLoadedFixtures = new Map<unknown[], Record<string, FixtureSet>>();

export class TestFixtures {
  static [included](base: unknown): void {
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
  }

  declare protected name: string;
  declare fixtureSets: Record<string, string>;
  declare useTransactionalTests: boolean;
  declare useInstantiatedFixtures: boolean | string;
  declare preLoadedFixtures: boolean;
  declare lockThreads: boolean;
  declare _fixtureCache: Record<string, Record<string, unknown>>;
  declare _fixtureCacheKey: unknown[];
  declare _fixtureConnectionPools: ConnectionPool[];
  declare _connectionSubscriber: NotificationSubscriber | null;
  declare _savedPoolConfigs: Hash<string, Record<string, Record<string, PoolConfig>>>;
  declare _loadedFixtures: Record<string, FixtureSet>;
  declare _asyncQueriesSession: unknown;
  declare _fixtureAdapters: DatabaseAdapter[];
  declare _pendingPins: Promise<void>[];

  async beforeSetup(): Promise<void> {
    await this.setupFixtures();
  }

  async afterTeardown(): Promise<void> {
    await this.teardownFixtures();
  }

  fixture(fixtureSetName: string, ...fixtureNames: unknown[]): unknown {
    return this.activeRecordFixture(fixtureSetName, ...fixtureNames);
  }

  /** @internal */
  isRunInTransaction(): boolean {
    return (
      this.useTransactionalTests &&
      !(this.constructor as TestCaseClass).isUsesTransaction(this.name)
    );
  }

  /** @internal */
  async setupFixtures(config: typeof Base = Base): Promise<void> {
    if (this.preLoadedFixtures && !this.useTransactionalTests) {
      throw new RuntimeError("pre_loaded_fixtures requires use_transactional_tests");
    }

    this._fixtureCache = {};
    this._fixtureCacheKey = [
      [...(this.constructor as TestCaseClass).fixtureTableNames],
      [...(this.constructor as TestCaseClass).fixturePaths],
      { ...(this.constructor as TestCaseClass).fixtureClassNames },
    ];
    this._fixtureConnectionPools = [];
    this._connectionSubscriber = null;
    this._savedPoolConfigs = new Hash((hash, key) => {
      const value = {};
      hash.set(key, value);
      return value;
    });

    if (this.isRunInTransaction()) {
      const cacheKey = [...alreadyLoadedFixtures.keys()].find((key) =>
        rbEql(key, this._fixtureCacheKey),
      );
      this._loadedFixtures = alreadyLoadedFixtures.get(cacheKey!)!;
      if (!this._loadedFixtures) {
        alreadyLoadedFixtures.clear();
        this._loadedFixtures = await this.loadFixtures(config);
        alreadyLoadedFixtures.set(this._fixtureCacheKey, this._loadedFixtures);
      }

      await this.setupTransactionalFixtures();
    } else {
      FixtureSet.resetCache();
      this.invalidateAlreadyLoadedFixtures();
      this._loadedFixtures = await this.loadFixtures(config);
    }
    this.setupAsynchronousQueriesSession();

    if (this.useInstantiatedFixtures != null && this.useInstantiatedFixtures !== false) {
      await this.instantiateFixtures();
    }
  }

  /** @internal */
  async teardownFixtures(): Promise<void> {
    this.teardownAsynchronousQueriesSession();

    if (this.isRunInTransaction()) {
      await this.teardownTransactionalFixtures();
    } else {
      FixtureSet.resetCache();
      this.invalidateAlreadyLoadedFixtures();
    }

    Base.connectionHandler.clearActiveConnectionsBang("all");
  }

  /** @internal */
  setupAsynchronousQueriesSession(): void {
    this._asyncQueriesSession = Base.asynchronousQueriesTracker().startSession();
  }

  /** @internal */
  teardownAsynchronousQueriesSession(): void {
    if (this._asyncQueriesSession) Base.asynchronousQueriesTracker().finalizeSession(true);
  }

  /** @internal */
  invalidateAlreadyLoadedFixtures(): void {
    alreadyLoadedFixtures.clear();
  }

  /** @internal */
  async setupTransactionalFixtures(): Promise<void> {
    this.setupSharedConnectionPool();

    this._fixtureConnectionPools = Base.connectionHandler.connectionPoolList("writing");
    for (const pool of this._fixtureConnectionPools) {
      await pool.pinConnectionBang(this.lockThreads);
      await pool.leaseConnection();
    }
    await pinFixtureAdapters.call(this);

    this._pendingPins = [];
    this._connectionSubscriber = Notifications.subscribe("!connection.active_record", (event) => {
      const payload = event.payload as { connection_name?: string; shard?: string };
      const connectionName = "connection_name" in payload ? payload.connection_name : undefined;
      const shard = "shard" in payload ? payload.shard : undefined;

      if (connectionName != null) {
        const pool = Base.connectionHandler.retrieveConnectionPool(connectionName, { shard });
        if (pool) {
          this.setupSharedConnectionPool();

          if (!this._fixtureConnectionPools.includes(pool)) {
            this._fixtureConnectionPools.push(pool);
            deferConnectionPoolPin.call(this, pool);
          }
        }
      }
    });
  }

  /**
   * @internal
   * @missingRailsName connectionSubscriber — PERMANENT
   */
  async teardownTransactionalFixtures(): Promise<void> {
    if (this._connectionSubscriber) Notifications.unsubscribe(this._connectionSubscriber);

    const pinFailure = await settlePendingPins.call(this);
    const unpinned = await Promise.all(
      this._fixtureConnectionPools.map((pool) => pool.unpinConnectionBang()),
    );
    if (!unpinned.every(Boolean)) {
      alreadyLoadedFixtures.clear();
    }
    await unpinFixtureAdapters.call(this);
    this._fixtureConnectionPools = [];
    this.teardownSharedConnectionPool();
    if (pinFailure) throw pinFailure.reason;
  }

  /** @internal */
  setupSharedConnectionPool(): void {
    const handler = Base.connectionHandler;

    for (const name of handler.connectionPoolNames()) {
      const poolManager = handler["_connectionNameToPoolManager"].get(name)!;
      for (const shardName of poolManager.shardNames) {
        const writingPoolConfig = poolManager.getPoolConfig(writingRole(), shardName);
        const savedShards = this._savedPoolConfigs.get(name)!;
        savedShards[shardName] ??= {};
        for (const role of poolManager.roleNames) {
          const poolConfig = poolManager.getPoolConfig(role, shardName);
          if (!poolConfig) continue;
          if (poolConfig === writingPoolConfig) continue;

          savedShards[shardName][role] = poolConfig;
          poolManager.setPoolConfig(role, shardName, writingPoolConfig!);
        }
      }
    }
  }

  /** @internal */
  teardownSharedConnectionPool(): void {
    const handler = Base.connectionHandler;

    for (const [name, shards] of this._savedPoolConfigs) {
      const poolManager = handler["_connectionNameToPoolManager"].get(name)!;
      for (const [shardName, roles] of Object.entries(shards)) {
        for (const [role, poolConfig] of Object.entries(roles)) {
          if (!poolManager.getPoolConfig(role, shardName)) continue;

          poolManager.setPoolConfig(role, shardName, poolConfig);
        }
      }
    }

    this._savedPoolConfigs.clear();
  }

  /** @internal */
  async loadFixtures(config: typeof Base): Promise<Record<string, FixtureSet>> {
    return indexBy(
      await FixtureSet.createFixtures(
        (this.constructor as TestCaseClass).fixturePaths,
        (this.constructor as TestCaseClass).fixtureTableNames,
        (this.constructor as TestCaseClass).fixtureClassNames as Record<
          string,
          BaseClass | string | null
        >,
        config,
      ),
      (fixtureSet) => fixtureSet.name,
    );
  }

  /** @internal */
  async instantiateFixtures(): Promise<void> {
    if (this.preLoadedFixtures) {
      if (isEmpty(FixtureSet.allLoadedFixtures))
        throw new RuntimeError("Load fixtures before instantiating them.");
      await FixtureSet.instantiateAllLoadedFixtures(this, this.isLoadInstances());
    } else {
      if (this._loadedFixtures == null)
        throw new RuntimeError("Load fixtures before instantiating them.");
      for (const fixtureSet of Object.values(this._loadedFixtures)) {
        await FixtureSet.instantiateFixtures(this, fixtureSet, this.isLoadInstances());
      }
    }
  }

  /** @internal */
  isLoadInstances(): boolean {
    return this.useInstantiatedFixtures !== ":no_instances";
  }

  /** @internal */
  activeRecordFixture(fixtureSetName: string, ...fixtureNames: unknown[]): unknown {
    const fsName = this.fixtureSets[fixtureSetName];
    if (fsName) {
      return this.accessFixture(fsName, ...fixtureNames);
    } else {
      throw new StandardError(`No fixture set named ':${fixtureSetName}'`);
    }
  }

  /**
   * @internal
   * @missingRailsCall delete — PERMANENT
   */
  accessFixture(fsName: string, ...fixtureNames: unknown[]): unknown {
    const forceReload =
      fixtureNames.at(-1) === true || fixtureNames.at(-1) === ":reload"
        ? fixtureNames.pop()
        : undefined;
    const returnSingleRecord = fixtureNames.length === 1;

    if (fixtureNames.length === 0)
      fixtureNames = Object.keys(this._loadedFixtures[fsName].fixtures);
    this._fixtureCache[fsName] ??= {};

    const instances = fixtureNames.map((name) => {
      const fName = String(name);
      if (forceReload) hashDelete(this._fixtureCache[fsName], fName);

      const loaded = this._loadedFixtures[fsName].fixtures[fName];
      if (loaded) {
        return (this._fixtureCache[fsName][fName] ??= loaded
          .find()
          .then((record: unknown) => (this._fixtureCache[fsName][fName] = record)));
      } else {
        throw new StandardError(`No fixture named '${fName}' found for fixture set '${fsName}'`);
      }
    });

    return returnSingleRecord ? instances[0] : instances;
  }
}

/** @noRailsEquivalent PERMANENT */
function deferConnectionPoolPin(this: TestFixtures, pool: ConnectionPool): void {
  this._pendingPins.push(
    pool.leaseConnection().then((connection) =>
      connection.lock.synchronize(async () => {
        await pool.pinConnectionBang(this.lockThreads);
        await pool.leaseConnection();
      }),
    ),
  );
}

/** @noRailsEquivalent PERMANENT */
async function settlePendingPins(this: TestFixtures): Promise<PromiseRejectedResult | undefined> {
  const pinResults = await Promise.allSettled(this._pendingPins);
  this._pendingPins = [];
  return pinResults.find((r): r is PromiseRejectedResult => r.status === "rejected");
}

/** @noRailsEquivalent CONVERGEABLE converge-fixture-raw-adapter-arm-onto-pool-walk */
async function pinFixtureAdapters(this: TestFixtures): Promise<void> {
  for (const adapter of this._fixtureAdapters) {
    const pool = adapter.pool;
    if (pool == null || pool instanceof NullPool) {
      await (
        adapter as unknown as {
          transactionManager: {
            beginTransaction(opts: { joinable: boolean; _lazy: boolean }): Promise<unknown>;
          };
        }
      ).transactionManager.beginTransaction({ joinable: false, _lazy: false });
    } else if (!this._fixtureConnectionPools.includes(pool)) {
      await pool.pinConnectionBang(this.lockThreads);
      await pool.leaseConnection();
      this._fixtureConnectionPools.push(pool);
    }
  }
}

/** @noRailsEquivalent CONVERGEABLE converge-fixture-raw-adapter-arm-onto-pool-walk */
async function unpinFixtureAdapters(this: TestFixtures): Promise<void> {
  for (const adapter of this._fixtureAdapters) {
    if (adapter.pool == null || adapter.pool instanceof NullPool) {
      const manager = (
        adapter as unknown as {
          transactionManager: { openTransactions: number; rollbackTransaction(): Promise<void> };
        }
      ).transactionManager;
      while (manager.openTransactions > 0) await manager.rollbackTransaction();
    }
  }
}

type FixturesOptions = WithTransactionalFixturesOptions &
  FixturesConnectionOpts & { useInstantiatedFixtures?: boolean | string };

type FixturesResult = {
  readonly fixtureTableNames: string[];
  readonly self: () => TestFixtures & Record<string, unknown>;
};

type SuiteScope = { suite?: SuiteScope };
type TestCaseClass = (new () => TestFixtures) &
  TestFixturesClassHost &
  typeof ClassMethods & {
    useTransactionalTests: boolean;
    useInstantiatedFixtures: boolean | string;
  };

const USE_FIXTURES_ROOT = "use-fixtures";

let useFixturesCount = 0;

let rootTestCaseClass: TestCaseClass | undefined;

const testCaseClasses = new WeakMap<SuiteScope, TestCaseClass>();

const fixtureRegistrations = new WeakMap<
  TestCaseClass,
  { count: number; adapters: (() => DatabaseAdapter | Promise<DatabaseAdapter>)[] }
>();

const testCases = new WeakMap<object, { testCase: TestFixtures; pending: number }>();

let currentTestCase: TestFixtures | null = null;

function testCaseClassFor(suite: SuiteScope | undefined): TestCaseClass {
  if (suite === undefined) {
    if (rootTestCaseClass === undefined) {
      rootTestCaseClass = class {} as unknown as TestCaseClass;
      include(rootTestCaseClass, TestFixtures);
      rootTestCaseClass.fixturePaths = [FIXTURES_ROOT, USE_FIXTURES_ROOT];
    }
    return rootTestCaseClass;
  }
  let klass = testCaseClasses.get(suite);
  if (klass === undefined) {
    klass = class extends testCaseClassFor(suite.suite) {} as TestCaseClass;
    testCaseClasses.set(suite, klass);
  }
  return klass;
}

function registrationsFor(klass: TestCaseClass) {
  let registrations = fixtureRegistrations.get(klass);
  if (registrations === undefined) {
    registrations = { count: 0, adapters: [] };
    fixtureRegistrations.set(klass, registrations);
  }
  return registrations;
}

const fixtureRegistryNames = new Map(
  (Object.keys(fixtureRegistry) as FixtureName[]).map((name) => [underscore(name), name]),
);

async function resolveFixtureClassNames(klass: TestCaseClass): Promise<void> {
  const names = klass.fixtureTableNames.filter(
    (fsName) => fixtureRegistryNames.has(fsName) && !(fsName in klass.fixtureClassNames),
  );
  const resolved = await resolveFixtureNames(
    names.map((fsName) => fixtureRegistryNames.get(fsName)!),
  );
  const classNames: Record<string, unknown> = {};
  for (const [name, { model }] of Object.entries(resolved)) {
    if (model !== null) classNames[underscore(name)] = model;
  }
  if (Object.keys(classNames).length > 0) klass.setFixtureClass(classNames);
  for (const model of Object.values(klass.fixtureClassNames)) {
    if (typeof model === "function" && "_isActiveRecordBase" in model) {
      registerModel(model as BaseClass);
    }
  }
}

function registerFixtureHooks(
  klass: TestCaseClass,
  getAdapter?: () => DatabaseAdapter | Promise<DatabaseAdapter>,
): void {
  const registrations = registrationsFor(klass);
  registrations.count++;
  if (getAdapter) registrations.adapters.push(getAdapter);

  beforeEach(async (ctx: TaskContext) => {
    if (testCases.has(ctx.task)) return;
    const testKlass = testCaseClassFor(ctx.task.suite as SuiteScope | undefined);
    const testCase = new testKlass();
    testCase["name"] = ctx.task.name;
    testCase._fixtureConnectionPools = [];
    testCase._pendingPins = [];
    testCase._savedPoolConfigs = new Hash();
    testCase._fixtureAdapters = [];
    let pending = 0;
    const getters: (() => DatabaseAdapter | Promise<DatabaseAdapter>)[] = [];
    for (
      let k: TestCaseClass | null = testKlass;
      k !== null && k !== (Object.getPrototypeOf(Function) as unknown);
      k = Object.getPrototypeOf(k) as TestCaseClass | null
    ) {
      const own = fixtureRegistrations.get(k);
      if (own) {
        pending += own.count;
        getters.push(...own.adapters);
      }
    }
    testCases.set(ctx.task, { testCase, pending });
    currentTestCase = testCase;

    await resolveFixtureClassNames(testKlass);
    for (const getter of getters) {
      const adapter = await getter();
      if (!testCase._fixtureAdapters.includes(adapter)) testCase._fixtureAdapters.push(adapter);
    }
    await testCase.beforeSetup();

    for (const [fsName, fixtureSet] of Object.entries(testCase._loadedFixtures)) {
      const cache = (testCase._fixtureCache[fsName] ??= {});
      for (const [label, fixture] of Object.entries(fixtureSet.fixtures)) {
        cache[label] = fixtureSet.modelClass ? await fixture.find() : fixture.toHash();
      }
    }
  });

  afterEach(async (ctx: TaskContext) => {
    const state = testCases.get(ctx.task);
    if (state === undefined || --state.pending > 0) return;
    testCases.delete(ctx.task);
    if (currentTestCase === state.testCase) currentTestCase = null;
    await state.testCase.afterTeardown();
  });
}

function fixtureAccessor(fixtureSetName: string) {
  const accessor = (...fixtureNames: unknown[]) => {
    if (currentTestCase === null) {
      throw new Error(
        `useFixtures: fixture set "${fixtureSetName}" not loaded — call inside a test`,
      );
    }
    return currentTestCase.activeRecordFixture(fixtureSetName, ...fixtureNames);
  };
  accessor.all = () => accessor() as unknown[];
  return accessor;
}

/** @internal */
export function fixtures<M extends FixtureMap>(
  fixtures: M,
  options?: FixturesOptions,
): UseFixturesResult<M> & FixturesResult;
export function fixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: FixturesOptions,
): UseFixturesByNameResult<N> & FixturesResult;
export function fixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[],
  options: FixturesOptions | undefined = undefined,
): Record<string, unknown> {
  const { usesTransaction, useTransactionalTests, useInstantiatedFixtures, connection } =
    options ?? {};

  warmSchemaCacheBeforeFirstTest(connection);
  const klass = testCaseClassFor(getCurrentSuite().suite as SuiteScope | undefined);
  klass.usesTransaction(...(usesTransaction ?? []));
  if (useTransactionalTests !== undefined) klass.useTransactionalTests = useTransactionalTests;
  if (useInstantiatedFixtures !== undefined)
    klass.useInstantiatedFixtures = useInstantiatedFixtures;

  const accessors: Record<string, string> = {};
  const fixtureSetNames: string[] = [];
  if (Array.isArray(fixturesOrNames)) {
    for (const name of fixturesOrNames as readonly FixtureName[]) {
      if (!(name in fixtureRegistry)) {
        throw new Error(
          `useFixtures: no fixture set named "${name}" in the registry — add it to fixtures-registry.ts`,
        );
      }
      const fsName = underscore(name);
      accessors[name] = fsName;
      fixtureSetNames.push(fsName);
    }
  } else {
    const directory = String(++useFixturesCount);
    const classNames: Record<string, unknown> = {};
    for (const [key, [model, data]] of Object.entries(fixturesOrNames as FixtureMap)) {
      const fsName = `${directory}/${key}`;
      FixtureFile.registerModule(`${USE_FIXTURES_ROOT}/${fsName}.ts`, data);
      classNames[fsName] = model;
      accessors[key] = fsName;
      fixtureSetNames.push(fsName);
    }
    klass.setFixtureClass(classNames);
  }
  klass.fixtures(fixtureSetNames);
  registerFixtureHooks(klass, connection ?? (() => Base.leaseConnection()));

  const result: Record<string, unknown> = {};
  for (const [key, fsName] of Object.entries(accessors)) {
    result[key] = fixtureAccessor(fsName.replaceAll("/", "_"));
  }
  Object.defineProperty(result, "fixtureTableNames", { get: () => klass.fixtureTableNames });
  result.self = () => currentTestCase;
  return result;
}
