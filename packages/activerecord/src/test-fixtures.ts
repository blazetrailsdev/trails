import { afterEach, beforeEach, type TaskContext } from "vitest";
import { getCurrentSuite } from "vitest/suite";
import {
  Dir,
  Hash,
  Module,
  File as RubyFile,
  NoMethodError,
  RuntimeError,
  StandardError,
  hashDelete,
  include,
  isEmpty,
  isSymbol,
  merge,
  rbEql,
  rbObjClass,
  symbolToS,
} from "@blazetrails/ruby-compat";
import {
  Concern,
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
import { Base } from "./base.js";
import { registerModel } from "./associations.js";
import {
  warmSchemaCacheBeforeFirstTest,
  type WithTransactionalFixturesOptions,
} from "./test-fixtures/with-transactional-fixtures.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
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

export type FixtureSetAccessor<T> = {
  (fixtureName: string, forceReload?: true | ":reload"): T | Promise<T>;
  (...fixtureNames: unknown[]): Array<T | Promise<T>>;
};

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
      table = m.tableName!;
      model = m;
    }
    map[name] = { table, model, data: entry.data };
  }
  return map;
}

const alreadyLoadedFixtures = new Map<unknown[], Record<string, FixtureSet>>();

export interface TestFixtures {
  fixtureSets: Record<string, string>;
  useTransactionalTests: boolean;
  useInstantiatedFixtures: boolean | string;
  preLoadedFixtures: boolean;
  lockThreads: boolean;
  _fixtureCache: Record<string, Record<string, unknown>>;
  _fixtureCacheKey: unknown[];
  _fixtureConnectionPools: ConnectionPool[];
  _connectionSubscriber: NotificationSubscriber | null;
  _savedPoolConfigs: Hash<string, Record<string, Record<string, PoolConfig>>>;
  _loadedFixtures: Record<string, FixtureSet>;
  _asyncQueriesSession: unknown;
  _pendingPins: Promise<void>[];
  beforeSetup: OmitThisParameter<typeof beforeSetup>;
  afterTeardown: OmitThisParameter<typeof afterTeardown>;
  fixture: OmitThisParameter<typeof fixture>;
  isRunInTransaction: OmitThisParameter<typeof isRunInTransaction>;
  setupFixtures: OmitThisParameter<typeof setupFixtures>;
  teardownFixtures: OmitThisParameter<typeof teardownFixtures>;
  setupAsynchronousQueriesSession: OmitThisParameter<typeof setupAsynchronousQueriesSession>;
  teardownAsynchronousQueriesSession: OmitThisParameter<typeof teardownAsynchronousQueriesSession>;
  invalidateAlreadyLoadedFixtures: OmitThisParameter<typeof invalidateAlreadyLoadedFixtures>;
  setupTransactionalFixtures: OmitThisParameter<typeof setupTransactionalFixtures>;
  teardownTransactionalFixtures: OmitThisParameter<typeof teardownTransactionalFixtures>;
  setupSharedConnectionPool: OmitThisParameter<typeof setupSharedConnectionPool>;
  teardownSharedConnectionPool: OmitThisParameter<typeof teardownSharedConnectionPool>;
  loadFixtures: OmitThisParameter<typeof loadFixtures>;
  instantiateFixtures: OmitThisParameter<typeof instantiateFixtures>;
  isLoadInstances: OmitThisParameter<typeof isLoadInstances>;
  methodMissing: OmitThisParameter<typeof methodMissing>;
  respondToMissing: OmitThisParameter<typeof respondToMissing>;
  activeRecordFixture: OmitThisParameter<typeof activeRecordFixture>;
  accessFixture: OmitThisParameter<typeof accessFixture>;
}

async function beforeSetup(this: TestFixtures): Promise<void> {
  await this.setupFixtures();
  await TestFixtures.superMethod(this, "beforeSetup")?.();
}

async function afterTeardown(this: TestFixtures): Promise<void> {
  try {
    await TestFixtures.superMethod(this, "afterTeardown")?.();
  } finally {
    await this.teardownFixtures();
  }
}

function fixture(this: TestFixtures, fixtureSetName: string, ...fixtureNames: unknown[]): unknown {
  return this.activeRecordFixture(fixtureSetName, ...fixtureNames);
}

/** @internal */
function isRunInTransaction(this: TestCase): boolean {
  return (
    this.useTransactionalTests && !(this.constructor as TestCaseClass).isUsesTransaction(this.name)
  );
}

/** @internal */
async function setupFixtures(this: TestFixtures, config: typeof Base = Base): Promise<void> {
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
async function teardownFixtures(this: TestFixtures): Promise<void> {
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
function setupAsynchronousQueriesSession(this: TestFixtures): void {
  this._asyncQueriesSession = Base.asynchronousQueriesTracker().startSession();
}

/** @internal */
function teardownAsynchronousQueriesSession(this: TestFixtures): void {
  if (this._asyncQueriesSession) Base.asynchronousQueriesTracker().finalizeSession(true);
}

/** @internal */
function invalidateAlreadyLoadedFixtures(this: TestFixtures): void {
  alreadyLoadedFixtures.clear();
}

/** @internal */
async function setupTransactionalFixtures(this: TestFixtures): Promise<void> {
  this.setupSharedConnectionPool();

  this._fixtureConnectionPools = Base.connectionHandler.connectionPoolList("writing");
  for (const pool of this._fixtureConnectionPools) {
    await pool.pinConnectionBang(this.lockThreads);
    await pool.leaseConnection();
  }

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
async function teardownTransactionalFixtures(this: TestFixtures): Promise<void> {
  if (this._connectionSubscriber) Notifications.unsubscribe(this._connectionSubscriber);

  const pinFailure = await settlePendingPins.call(this);
  const unpinned = await Promise.all(
    this._fixtureConnectionPools.map((pool) => pool.unpinConnectionBang()),
  );
  if (!unpinned.every(Boolean)) {
    alreadyLoadedFixtures.clear();
  }
  this._fixtureConnectionPools = [];
  this.teardownSharedConnectionPool();
  if (pinFailure) throw pinFailure.reason;
}

/** @internal */
function setupSharedConnectionPool(this: TestFixtures): void {
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
function teardownSharedConnectionPool(this: TestFixtures): void {
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
async function loadFixtures(
  this: TestFixtures,
  config: typeof Base,
): Promise<Record<string, FixtureSet>> {
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
async function instantiateFixtures(this: TestFixtures): Promise<void> {
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
function isLoadInstances(this: TestFixtures): boolean {
  return this.useInstantiatedFixtures !== ":no_instances";
}

function methodMissing(this: TestFixtures, method: string, ...args: unknown[]): unknown {
  if (Object.prototype.hasOwnProperty.call(this.fixtureSets, method)) {
    return this.activeRecordFixture(method, ...args);
  } else {
    throw new NoMethodError(
      `undefined method '${method}' for an instance of ${rbObjClass(this)}`,
      method,
      args,
      false,
      { receiver: this },
    );
  }
}

function respondToMissing(
  this: TestFixtures,
  method: string,
  includePrivate: boolean = false,
): boolean {
  if (includePrivate && Object.prototype.hasOwnProperty.call(this.fixtureSets, method)) {
    return true;
  } else {
    return false;
  }
}

/** @internal */
function activeRecordFixture(
  this: TestFixtures,
  fixtureSetName: string,
  ...fixtureNames: unknown[]
): unknown {
  const fsName = this.fixtureSets[fixtureSetName];
  if (fsName) {
    return this.accessFixture(fsName, ...fixtureNames);
  } else {
    throw new StandardError(`No fixture set named ':${fixtureSetName}'`);
  }
}

/** @internal */
function accessFixture(this: TestFixtures, fsName: string, ...fixtureNames: unknown[]): unknown {
  const forceReload =
    fixtureNames.at(-1) === true || fixtureNames.at(-1) === ":reload"
      ? fixtureNames.pop()
      : undefined;
  const returnSingleRecord = fixtureNames.length === 1;

  if (fixtureNames.length === 0) fixtureNames = Object.keys(this._loadedFixtures[fsName].fixtures);
  this._fixtureCache[fsName] ??= {};

  const instances = fixtureNames.map((name) => {
    let fName = name as string;
    if (isSymbol(fName)) fName = symbolToS(fName);
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

export const TestFixtures = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: TestCaseClass) => void): void }).included(
    null,
    function (this: TestCaseClass) {
      classAttribute.call(this, "fixturePaths", { instanceWriter: false, default: [] });
      classAttribute.call(this, "fixtureTableNames", { default: [] });
      classAttribute.call(this, "fixtureClassNames", { default: {} });
      classAttribute.call(this, "useTransactionalTests", { default: true });
      classAttribute.call(this, "useInstantiatedFixtures", { default: false });
      classAttribute.call(this, "preLoadedFixtures", { default: false });
      classAttribute.call(this, "lockThreads", { default: true });
      classAttribute.call(this, "fixtureSets", { default: {} });

      runLoadHooks("active_record_fixtures", this);

      const link = Object.getPrototypeOf(this.prototype) as object;
      Object.setPrototypeOf(
        link,
        new Proxy(Object.create(Object.getPrototypeOf(link) as object) as object, {
          get(target, prop, receiver: TestFixtures) {
            const value = Reflect.get(target, prop, receiver);
            if (value !== undefined || typeof prop === "symbol" || Reflect.has(target, prop)) {
              return value;
            }
            if (receiver.respondToMissing(prop, true)) {
              return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
            }
            return value;
          },
        }),
      );
    },
  );

  (mod as unknown as { ClassMethods: typeof ClassMethods }).ClassMethods = ClassMethods;

  mod.moduleEval((m) => {
    Object.assign(m, {
      beforeSetup,
      afterTeardown,
      fixture,
      isRunInTransaction,
      setupFixtures,
      teardownFixtures,
      setupAsynchronousQueriesSession,
      teardownAsynchronousQueriesSession,
      invalidateAlreadyLoadedFixtures,
      setupTransactionalFixtures,
      teardownTransactionalFixtures,
      setupSharedConnectionPool,
      teardownSharedConnectionPool,
      loadFixtures,
      instantiateFixtures,
      isLoadInstances,
      methodMissing,
      respondToMissing,
      activeRecordFixture,
      accessFixture,
    });
  });
});

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

async function settlePendingPins(this: TestFixtures): Promise<PromiseRejectedResult | undefined> {
  const pinResults = await Promise.allSettled(this._pendingPins);
  this._pendingPins = [];
  return pinResults.find((r): r is PromiseRejectedResult => r.status === "rejected");
}

type FixturesOptions = WithTransactionalFixturesOptions & {
  useInstantiatedFixtures?: boolean | string;
};

type FixturesResult = {
  readonly fixtureTableNames: string[];
  readonly self: () => TestFixtures & Record<string, unknown>;
};

type SuiteScope = { suite?: SuiteScope };
type TestCase = TestFixtures & { name: string };
type TestCaseClass = (new () => TestCase) &
  TestFixturesClassHost &
  typeof ClassMethods & {
    useTransactionalTests: boolean;
    useInstantiatedFixtures: boolean | string;
  };

const USE_FIXTURES_ROOT = "use-fixtures";

let useFixturesCount = 0;

let rootTestCaseClass: TestCaseClass | undefined;

const testCaseClasses = new WeakMap<SuiteScope, TestCaseClass>();

const fixtureRegistrations = new WeakMap<TestCaseClass, { count: number }>();

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
    registrations = { count: 0 };
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

function registerFixtureHooks(klass: TestCaseClass): void {
  const registrations = registrationsFor(klass);
  registrations.count++;

  beforeEach(async (ctx: TaskContext) => {
    if (testCases.has(ctx.task)) return;
    const testKlass = testCaseClassFor(ctx.task.suite as SuiteScope | undefined);
    const testCase = new testKlass();
    testCase.name = ctx.task.name;
    testCase._fixtureConnectionPools = [];
    testCase._pendingPins = [];
    testCase._savedPoolConfigs = new Hash();
    let pending = 0;
    for (
      let k: TestCaseClass | null = testKlass;
      k !== null && k !== (Object.getPrototypeOf(Function) as unknown);
      k = Object.getPrototypeOf(k) as TestCaseClass | null
    ) {
      const own = fixtureRegistrations.get(k);
      if (own) pending += own.count;
    }
    testCases.set(ctx.task, { testCase, pending });
    currentTestCase = testCase;

    await resolveFixtureClassNames(testKlass);
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
  const { usesTransaction, useTransactionalTests, useInstantiatedFixtures } = options ?? {};

  warmSchemaCacheBeforeFirstTest();
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
  registerFixtureHooks(klass);

  const result: Record<string, unknown> = {};
  for (const [key, fsName] of Object.entries(accessors)) {
    result[key] = fixtureAccessor(fsName.replaceAll("/", "_"));
  }
  Object.defineProperty(result, "fixtureTableNames", { get: () => klass.fixtureTableNames });
  result.self = () => currentTestCase;
  return result;
}
