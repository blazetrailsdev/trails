import { resetLocalTimeZoneId } from "@blazetrails/date";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import {
  MethodCallAssertions,
  Notifications,
  Stream,
  _assertNothingRaisedOrWarn,
  assert,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  camelize,
  getEnv,
  setZone,
  zone,
  type CallbackChain,
} from "@blazetrails/activesupport";
import {
  Fiber,
  RuntimeError,
  Thread,
  extend,
  include,
  puts,
  rbEqq,
  rbEqual,
  rbInspect,
  rbModConstSet,
  rbObjRespondTo,
  setEnv,
  stderr,
  stdout,
  type Extended,
} from "@blazetrails/ruby-compat";
import {
  dbWarningsIgnore,
  defaultTimezone,
  setDbWarningsAction,
  setDbWarningsIgnore,
  setDefaultTimezone,
} from "../active-record.js";
import type { Base } from "../base.js";
import type { PoolManager } from "../connection-adapters/pool-manager.js";
import { FixtureSet } from "../fixtures.js";
import { ActiveRecord } from "../namespaces.js";
import type { AssociationReflection } from "../reflection.js";
import { AdapterHelper } from "../support/adapter-helper.js";
import { LoadSchemaHelper } from "../support/load-schema-helper.js";
import { TestFixtures, type ClassMethods } from "../test-fixtures.js";
import { QueryAssertions, SQLCounter } from "../testing/query-assertions.js";
import { FIXTURES_ROOT } from "../config.js";
import { ValidationsRepairHelper } from "./validations-repair-helper.js";

type CallbacksHost = typeof Base & Record<string, CallbackChain | undefined>;
type DbWarningsAction = Parameters<typeof setDbWarningsAction>[0];
type InverseMemos = { _inverseNameCache?: unknown; _inverseOfCache?: unknown };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {
  declare static fixturePaths: string[];
  declare static fixtureTableNames: string[];
  declare static fixtureClassNames: Record<string, typeof Base | string | null>;
  declare static useInstantiatedFixtures: boolean | string;
  declare static useTransactionalTests: boolean;
  declare static setFixtureClass: Extended<typeof ClassMethods>["setFixtureClass"];
  declare static fixtures: Extended<typeof ClassMethods>["fixtures"];
  declare static setupFixtureAccessors: Extended<typeof ClassMethods>["setupFixtureAccessors"];
  declare static usesTransaction: Extended<typeof ClassMethods>["usesTransaction"];
  declare static isUsesTransaction: Extended<typeof ClassMethods>["isUsesTransaction"];

  static readonly EXPECTED_ZONE = null;
  static readonly EXPECTED_DEFAULT_TIMEZONE = "utc";
  static readonly EXPECTED_AWARE_TYPES = ["datetime", "time"];
  static readonly EXPECTED_TIME_ZONE_AWARE_ATTRIBUTES = false;

  declare _originalDbWarningsAction: DbWarningsAction | undefined;

  static {
    include(this, MethodCallAssertions);
    include(this, Stream);
    include(this, QueryAssertions);
    include(this, TestFixtures);
    include(this, ValidationsRepairHelper);
    include(this, AdapterHelper);
    extend(this, AdapterHelper);
    include(this, LoadSchemaHelper);
    extend(this, LoadSchemaHelper);
    this.fixturePaths = [FIXTURES_ROOT];
    this.useInstantiatedFixtures = false;
    this.useTransactionalTests = true;
  }

  override async afterTeardown(): Promise<void> {
    await super.afterTeardown();
    await this.checkConnectionLeaks();
  }

  async checkConnectionLeaks(): Promise<void> {
    if (this.inMemoryDb()) return;

    const leakedConn: [Thread | Fiber, unknown][] = [];
    for (const pool of ActiveRecord.Base.connectionHandler.eachConnectionPool()) {
      if (pool.asyncExecutor) {
        if (pool.asyncExecutor.scheduledTaskCount !== pool.asyncExecutor.completedTaskCount) {
          for (const conn of pool.connections) {
            if (
              conn.isInUse() &&
              conn.owner !== Fiber.current() &&
              conn.owner !== Thread.current()
            ) {
              if (rbObjRespondTo(conn.owner, "join")) {
                await (conn.owner as Thread | null)?.join(0.5);
              }
            }
          }
        }
      }

      await pool.reap();
      for (const conn of pool.connections) {
        if (conn.isInUse()) {
          if (conn.owner !== Fiber.current() && conn.owner !== Thread.current()) {
            leakedConn.push([conn.owner!, (conn.owner as { backtrace?: unknown }).backtrace]);
            (conn.owner as Thread | null)?.kill();
          }
          conn.stealBang();
          pool.checkin(conn);
        }
      }
    }

    if (leakedConn.length > 0) {
      puts.call(stdout, `Found ${leakedConn.length} leaked connections`);
      for (const [owner, backtrace] of leakedConn) {
        puts.call(stdout, `owner: ${owner}`);
        puts.call(stdout, `backtrace:\n${backtrace}`);
        puts.call(stdout);
      }
      throw new RuntimeError(
        `Found ${leakedConn.length} leaked connection after ${this.constructor.name}#${this.name}`,
      );
    }
  }

  createFixtures(...fixtureSetNames: string[]) {
    return FixtureSet.createFixtures(
      TestCase.fixturePaths,
      fixtureSetNames,
      this.fixtureClassNames,
    );
  }

  async captureSql(
    { includeSchema = false }: { includeSchema?: boolean } = {},
    block: () => unknown,
  ): Promise<string[]> {
    const counter = new SQLCounter();
    return Notifications.subscribed(counter, "sql.active_record", async () => {
      await block();
      if (includeSchema) {
        return counter.logAll;
      } else {
        return counter.log;
      }
    });
  }

  async captureSqlAndBinds(block: () => unknown): Promise<[string, unknown[]][]> {
    const counter = new SQLCounter();
    return Notifications.subscribed(counter, "sql.active_record", async () => {
      await block();
      return counter.logFull;
    });
  }

  /** @missingRailsCall assert_operator — CONVERGEABLE activerecord-describes-are-named-test-case-constants */
  async assertQueriesMatch<T>(
    match: RegExp | string,
    {
      count = null,
      includeSchema = false,
    }: { count?: number | null; includeSchema?: boolean } = {},
    block?: () => T | Promise<T>,
  ): Promise<T | undefined> {
    const counter = new SQLCounter();
    return Notifications.subscribed(counter, "sql.active_record", async () => {
      const result = await _assertNothingRaisedOrWarn("assert_queries_match", block);
      const queries = includeSchema ? counter.logAll : counter.log;
      const matchedQueries = queries.filter((query) => rbEqq(match, query));

      if (count != null) {
        assertEqual(
          count,
          matchedQueries.length,
          `${matchedQueries.length} instead of ${count} queries were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
        );
      } else {
        assert(
          matchedQueries.length >= 1,
          `1 or more queries expected, but none were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
        );
      }

      return result;
    });
  }

  async assertColumn(model: typeof Base, columnName: string, msg?: string): Promise<void> {
    await model.resetColumnInformation();
    assertIncludes(model.columnNames(), String(columnName), msg);
  }

  async assertNoColumn(model: typeof Base, columnName: string, msg?: string): Promise<void> {
    await model.resetColumnInformation();
    assertNotIncludes(model.columnNames(), String(columnName), msg);
  }

  async withHasManyInversing(
    model: typeof Base = ActiveRecord.Base,
    block: () => unknown,
  ): Promise<void> {
    const old = model.hasManyInversing;
    try {
      model.hasManyInversing = true;
      await block();
    } finally {
      model.hasManyInversing = old;
    }
  }

  async withAutomaticScopeInversing(
    ...args: [...reflections: AssociationReflection[], block: () => unknown]
  ): Promise<void> {
    const block = args.pop() as () => unknown;
    const reflections = args as AssociationReflection[];
    const old = reflections.map((reflection) => reflection.klass.automaticScopeInversing);

    try {
      for (const reflection of reflections) {
        reflection.klass.automaticScopeInversing = true;
        delete (reflection as unknown as InverseMemos)._inverseNameCache;
        delete (reflection as unknown as InverseMemos)._inverseOfCache;
      }

      await block();
    } finally {
      reflections.forEach((reflection, i) => {
        reflection.klass.automaticScopeInversing = old[i];
        delete (reflection as unknown as InverseMemos)._inverseNameCache;
        delete (reflection as unknown as InverseMemos)._inverseOfCache;
      });
    }
  }

  async withDbWarningsAction(
    action: DbWarningsAction,
    warningsToIgnore: (string | RegExp)[] = [],
    block: () => unknown,
  ): Promise<void> {
    const originalDbWarningsIgnore = dbWarningsIgnore();

    try {
      setDbWarningsAction(action);
      setDbWarningsIgnore(warningsToIgnore);

      await (await ActiveRecord.Base.leaseConnection()).disconnectBang();

      await block();
    } finally {
      setDbWarningsAction(this._originalDbWarningsAction!);
      setDbWarningsIgnore(originalDbWarningsIgnore);
      await (await ActiveRecord.Base.leaseConnection()).disconnectBang();
    }
  }

  async resetCallbacks(klass: typeof Base, kind: string, block: () => unknown): Promise<void> {
    const oldCallbacks = new Map<typeof Base, CallbackChain | undefined>();
    try {
      oldCallbacks.set(
        klass,
        (klass as CallbacksHost)[`_${camelize(kind, false)}Callbacks`]!.dup(),
      );
      for (const subclass of klass.subclasses) {
        oldCallbacks.set(
          subclass,
          (subclass as CallbacksHost)[`_${camelize(kind, false)}Callbacks`]!.dup(),
        );
      }
      await block();
    } finally {
      (klass as CallbacksHost)[`_${camelize(kind, false)}Callbacks`] = oldCallbacks.get(klass);
      for (const subclass of klass.subclasses) {
        (subclass as CallbacksHost)[`_${camelize(kind, false)}Callbacks`] =
          oldCallbacks.get(subclass);
      }
    }
  }

  async withPostgresqlDatetimeType(type: string, block: () => unknown): Promise<void> {
    let datetimeTypeWas: string | undefined;
    try {
      const adapter = ActiveRecord.ConnectionAdapters.PostgreSQLAdapter;
      delete (adapter as unknown as { _nativeDatabaseTypes?: unknown })._nativeDatabaseTypes;
      datetimeTypeWas = adapter.datetimeType;
      adapter.datetimeType = type;
      await block();
    } finally {
      const adapter = ActiveRecord.ConnectionAdapters.PostgreSQLAdapter;
      adapter.datetimeType = datetimeTypeWas!;
      delete (adapter as unknown as { _nativeDatabaseTypes?: unknown })._nativeDatabaseTypes;
    }
  }

  /** @inventedArm resetLocalTimeZoneId — CONVERGEABLE set-env-tz-resets-the-cached-local-zone */
  async withEnvTz(newTz = "US/Eastern", block: () => unknown): Promise<void> {
    const oldTz = getEnv("TZ");
    try {
      setEnv("TZ", newTz);
      resetLocalTimeZoneId();
      await block();
    } finally {
      setEnv("TZ", oldTz != null ? oldTz : undefined);
      resetLocalTimeZoneId();
    }
  }

  async withTimezoneConfig(
    cfg: {
      default?: "utc" | "local";
      awareAttributes?: boolean;
      awareTypes?: string[];
      zone?: string;
    },
    block: () => unknown,
  ): Promise<void> {
    this.verifyDefaultTimezoneConfig();

    const oldDefaultZone = defaultTimezone();
    const oldAwareness = ActiveRecord.Base.timeZoneAwareAttributes;
    const oldAwareTypes = ActiveRecord.Base.timeZoneAwareTypes;
    const oldZone = zone();

    try {
      if ("default" in cfg) {
        setDefaultTimezone(cfg.default!);
      }
      if ("awareAttributes" in cfg) {
        ActiveRecord.Base.timeZoneAwareAttributes = cfg.awareAttributes!;
      }
      if ("awareTypes" in cfg) {
        ActiveRecord.Base.timeZoneAwareTypes = cfg.awareTypes!;
      }
      if ("zone" in cfg) {
        setZone(cfg.zone!);
      }
      await block();
    } finally {
      setDefaultTimezone(oldDefaultZone);
      ActiveRecord.Base.timeZoneAwareAttributes = oldAwareness;
      ActiveRecord.Base.timeZoneAwareTypes = oldAwareTypes;
      setZone(oldZone);
    }
  }

  verifyDefaultTimezoneConfig(): void {
    if (zone() !== TestCase.EXPECTED_ZONE) {
      puts.call(
        stderr,
        `    \n${this}\n        Global state \`Time.zone\` was leaked.\n          Expected: ${TestCase.EXPECTED_ZONE ?? ""}\n          Got: ${zone() ?? ""}\n`,
      );
    }
    if (defaultTimezone() !== TestCase.EXPECTED_DEFAULT_TIMEZONE) {
      puts.call(
        stderr,
        `    \n${this}\n        Global state \`ActiveRecord.default_timezone\` was leaked.\n          Expected: ${TestCase.EXPECTED_DEFAULT_TIMEZONE}\n          Got: ${defaultTimezone()}\n`,
      );
    }
    if (
      ActiveRecord.Base.timeZoneAwareAttributes !== TestCase.EXPECTED_TIME_ZONE_AWARE_ATTRIBUTES
    ) {
      puts.call(
        stderr,
        `    \n${this}\n        Global state \`ActiveRecord::Base.time_zone_aware_attributes\` was leaked.\n          Expected: ${TestCase.EXPECTED_TIME_ZONE_AWARE_ATTRIBUTES}\n          Got: ${ActiveRecord.Base.timeZoneAwareAttributes}\n`,
      );
    }
    if (!rbEqual(ActiveRecord.Base.timeZoneAwareTypes, TestCase.EXPECTED_AWARE_TYPES)) {
      puts.call(
        stderr,
        `    \n${this}\n        Global state \`ActiveRecord::Base.time_zone_aware_types\` was leaked.\n          Expected: ${rbInspect(TestCase.EXPECTED_AWARE_TYPES)}\n          Got: ${rbInspect(ActiveRecord.Base.timeZoneAwareTypes)}\n`,
      );
    }
  }

  cleanUpConnectionHandler(): void {
    const handler = ActiveRecord.Base.connectionHandler as unknown as {
      _connectionNameToPoolManager: { eachPair(block: (k: string, v: PoolManager) => void): void };
    };
    handler._connectionNameToPoolManager.eachPair((owner, poolManager) => {
      for (const roleName of [...poolManager.roleNames]) {
        if (
          roleName === ActiveRecord.Base.defaultRole &&
          ["ActiveRecord::Base", "ARUnit2Model", "Contact", "ContactSti"].includes(owner)
        )
          continue;
        poolManager.removeRole(roleName);
      }
    });
  }

  quoteTableName(name: string): string {
    return ActiveRecord.Base.adapterClass().quoteTableName(name);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestCase extends Omit<TestFixtures, "beforeSetup" | "afterTeardown"> {
  assertCalled: typeof MethodCallAssertions.assertCalled;
  assertCalledWith: typeof MethodCallAssertions.assertCalledWith;
  assertNotCalled: typeof MethodCallAssertions.assertNotCalled;
  expectCalledWith: typeof MethodCallAssertions.expectCalledWith;
  assertCalledOnInstanceOf: typeof MethodCallAssertions.assertCalledOnInstanceOf;
  assertNotCalledOnInstanceOf: typeof MethodCallAssertions.assertNotCalledOnInstanceOf;
  stubAnyInstance: typeof MethodCallAssertions.stubAnyInstance;
  silenceStream: typeof Stream.silenceStream;
  quietly: typeof Stream.quietly;
  capture: typeof Stream.capture;
  assertQueriesCount: typeof QueryAssertions.assertQueriesCount;
  assertNoQueries: typeof QueryAssertions.assertNoQueries;
  assertNoQueriesMatch: typeof QueryAssertions.assertNoQueriesMatch;
  repairValidations: typeof ValidationsRepairHelper.repairValidations;
  currentAdapter: typeof AdapterHelper.currentAdapter;
  inMemoryDb: typeof AdapterHelper.inMemoryDb;
  sqlite3AdapterStrictStringsDisabled: typeof AdapterHelper.sqlite3AdapterStrictStringsDisabled;
  mysqlEnforcingGtidConsistency: typeof AdapterHelper.mysqlEnforcingGtidConsistency;
  supportsDefaultExpression: typeof AdapterHelper.supportsDefaultExpression;
  supportsNonUniqueConstraintName: typeof AdapterHelper.supportsNonUniqueConstraintName;
  supportsTextColumnWithDefault: typeof AdapterHelper.supportsTextColumnWithDefault;
  supportsSqlStandardDropConstraint: typeof AdapterHelper.supportsSqlStandardDropConstraint;
  enableExtensionBang: typeof AdapterHelper.enableExtensionBang;
  disableExtensionBang: typeof AdapterHelper.disableExtensionBang;
  loadSchema: typeof LoadSchemaHelper.loadSchema;
}

rbModConstSet(ActiveRecord, "TestCase", TestCase);
