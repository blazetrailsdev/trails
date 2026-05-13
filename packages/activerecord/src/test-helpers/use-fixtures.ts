import { afterEach, beforeEach } from "vitest";
import { defineFixtures } from "./define-fixtures.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { Base } from "../base.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

type FixtureMap = Record<string, [BaseClass, Record<string, FixtureAttrs>]>;

type FixtureAccessor<T extends BaseClass, K extends string> = {
  (name: K): InstanceType<T>;
  all(): InstanceType<T>[];
};

type UseFixturesResult<M extends FixtureMap> = {
  [K in keyof M]: M[K] extends [
    infer T extends BaseClass,
    Record<infer N extends string, FixtureAttrs>,
  ]
    ? FixtureAccessor<T, N>
    : never;
};

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
 */
export function useFixtures<M extends FixtureMap>(
  fixtures: M,
  getAdapter: () => DatabaseAdapter,
): UseFixturesResult<M> {
  // Per-test mutable state: populated in beforeEach, cleared in afterEach.
  const store: Record<string, Record<string, unknown>> = {};

  beforeEach(async () => {
    const adapter = getAdapter();
    for (const [key, [ModelClass, data]] of Object.entries(fixtures)) {
      const result = await defineFixtures(adapter, ModelClass, data);
      store[key] = result as Record<string, unknown>;
    }
  });

  afterEach(async () => {
    const adapter = getAdapter();
    // Delete inserted rows for each declared table.
    for (const [, [ModelClass]] of Object.entries(fixtures)) {
      try {
        await adapter.execute(`DELETE FROM ${adapter.quoteTableName(ModelClass.tableName)}`, []);
      } catch {
        // Best-effort cleanup; if the table is gone, ignore.
      }
    }
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  const result = {} as UseFixturesResult<M>;
  for (const key of Object.keys(fixtures)) {
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
    (result as Record<string, unknown>)[key] = accessor;
  }
  return result;
}

/**
 * A thin class wrapper around `defineFixtures` that satisfies the static
 * `FixtureSet.createFixtures(adapter, name, data)` call shape expected by
 * the virtual-column test (and mirrors the Rails FixtureSet API surface).
 */
export class FixtureSet {
  static async createFixtures<T extends BaseClass, K extends string>(
    adapter: DatabaseAdapter,
    ModelClass: T,
    fixtures: Record<K, FixtureAttrs>,
  ): Promise<{ [P in K]: InstanceType<T> }> {
    return defineFixtures(adapter, ModelClass, fixtures);
  }
}
