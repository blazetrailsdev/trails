import { describe } from "@blazetrails/activesupport/testing/autorun";
import { getCurrentSuite } from "vitest/suite";
import { RuntimeError, StandardError, rbClassInheritedP } from "@blazetrails/ruby-compat";
import { underscore } from "@blazetrails/activesupport";
import { File as FixtureFile } from "../fixture-set/file.js";
import {
  fixtureRegistry,
  isJoinTableEntry,
  type FixtureName,
  type RegistryModel,
  type RegistryData,
  type IsJoinTableName,
} from "./fixtures-registry.js";
import { ensureCanonicalTables } from "../support/canonical-table-rebuild.js";
export type { FixtureName } from "./fixtures-registry.js";
import { Base } from "../base.js";
import type { TestCase as ActiveRecordTestCase } from "../cases/test-case.js";
import { ActiveRecord } from "../namespaces.js";
import { registerModel } from "../associations.js";
import type { WithTransactionalFixturesOptions } from "../test-fixtures/with-transactional-fixtures.js";
import { eagerWarmSchemaCache } from "../support/schema-cache-dump.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

export type FixtureMap = Record<string, [BaseClass, Record<string, FixtureAttrs>]>;

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

type FixturesOptions = WithTransactionalFixturesOptions & {
  useInstantiatedFixtures?: boolean | string;
};

type FixturesResult = {
  readonly fixtureTableNames: string[];
  readonly self: () => TestCase & Record<string, unknown>;
  readonly canonicalTables: (
    adapter: Parameters<typeof ensureCanonicalTables>[0],
    names: readonly string[],
  ) => Promise<void>;
};

type SuiteScope = Parameters<typeof describe>[0];
type TestCaseClass = typeof ActiveRecordTestCase;
type TestCase = InstanceType<TestCaseClass>;

const USE_FIXTURES_ROOT = "use-fixtures";

let useFixturesCount = 0;

const warmed = new WeakSet<TestCaseClass>();

let rootTestCaseClass: TestCaseClass | undefined;

let currentTestCase: TestCase | null = null;

/** @internal */
export function rootTestCase(): TestCaseClass {
  if (rootTestCaseClass === undefined) {
    const { TestCase } = ActiveRecord;
    rootTestCaseClass = class extends TestCase {
      override async beforeSetup(): Promise<void> {
        const testKlass = this.constructor as TestCaseClass;
        currentTestCase = this;
        if (testKlass.fixtureTableNames.length > 0 && !warmed.has(testKlass)) {
          warmed.add(testKlass);
          await Base.withConnection(eagerWarmSchemaCache);
        }
        await resolveFixtureClassNames(testKlass);
        await super.beforeSetup();

        for (const [fsName, fixtureSet] of Object.entries(this._loadedFixtures)) {
          const cache = (this._fixtureCache[fsName] ??= {});
          for (const [label, fixture] of Object.entries(fixtureSet.fixtures)) {
            cache[label] = fixtureSet.modelClass ? await fixture.find() : fixture.toHash();
          }
        }
      }

      override async afterTeardown(): Promise<void> {
        try {
          await super.afterTeardown();
        } finally {
          if (currentTestCase === this) currentTestCase = null;
        }
      }
    };
    rootTestCaseClass.fixturePaths = [...TestCase.fixturePaths, USE_FIXTURES_ROOT];
  }
  return rootTestCaseClass;
}

const fixtureRegistryNames = new Map(
  (Object.keys(fixtureRegistry) as FixtureName[]).map((name) => [underscore(name), name]),
);

async function resolveFixtureClassNames(klass: TestCaseClass): Promise<void> {
  const names = klass.fixtureTableNames.filter(
    (fsName) => fixtureRegistryNames.has(fsName) && !(fsName in klass.fixtureClassNames),
  );
  const classNames: Record<string, unknown> = {};
  for (const fsName of names) {
    const entry = fixtureRegistry[fixtureRegistryNames.get(fsName)!];
    if (isJoinTableEntry(entry)) continue;
    if ("addOn" in entry) await entry.addOn?.();
    const resolved = await entry.model();
    const models = (Array.isArray(resolved) ? resolved : [resolved]) as BaseClass[];
    registerModel(models);
    classNames[fsName] = models[0];
  }
  if (Object.keys(classNames).length > 0) klass.setFixtureClass(classNames);
  for (const model of Object.values(klass.fixtureClassNames)) {
    if (typeof model === "function" && rbClassInheritedP(model, Base) === true) {
      registerModel(model);
    }
  }
}

function fixtureAccessor(fixtureSetName: string) {
  const accessor = (...fixtureNames: unknown[]) => {
    if (currentTestCase === null) {
      throw new RuntimeError(
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

  const klass = describe(getCurrentSuite().suite as SuiteScope) as TestCaseClass;
  klass.usesTransaction(
    ...(usesTransaction ?? []).map((name) => `test_${name.replace(/\s+/g, "_")}`),
  );
  if (useTransactionalTests !== undefined) klass.useTransactionalTests = useTransactionalTests;
  if (useInstantiatedFixtures !== undefined)
    klass.useInstantiatedFixtures = useInstantiatedFixtures;

  const accessors: Record<string, string> = {};
  const fixtureSetNames: string[] = [];
  if (Array.isArray(fixturesOrNames)) {
    for (const name of fixturesOrNames as readonly FixtureName[]) {
      if (!(name in fixtureRegistry)) {
        throw new StandardError(
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

  const result: Record<string, unknown> = {};
  for (const [key, fsName] of Object.entries(accessors)) {
    result[key] = fixtureAccessor(fsName.replaceAll("/", "_"));
  }
  Object.defineProperty(result, "fixtureTableNames", { get: () => klass.fixtureTableNames });
  result.self = () => currentTestCase;
  result.canonicalTables = ensureCanonicalTables;
  return result;
}
