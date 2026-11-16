import { ActiveRecord } from "@blazetrails/activerecord";
import { EnvironmentInquirer, TopLevel } from "@blazetrails/activesupport";
import { env as ENV, regexpEscape } from "@blazetrails/ruby-compat";
import type { StoreOptions } from "@blazetrails/activesupport/cache";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { Configuration, Entry, Record, SolidCache, Store } from "../../lib/index.js";
import { loadCacheSchema } from "./cache-schema.js";

export async function waitForBackgroundTasks(cache: Store, { timeout = 2 } = {}): Promise<void> {
  const timeoutAt = Date.now() + timeout * 1000;
  const threadpool = cache._background;

  for (;;) {
    if (threadpool.completedTaskCount === threadpool.scheduledTaskCount) break;
    if (Date.now() > timeoutAt) throw new Error("Timeout waiting for cache background tasks");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

export const SOLID_CACHE_CONFIG: string | undefined = ENV["SOLID_CACHE_CONFIG"];

export function isSingleDatabase(): boolean {
  return [
    "config/cache_database.yml",
    "config/cache_no_database.yml",
    "config/cache_unprepared_statements.yml",
  ].includes(SOLID_CACHE_CONFIG ?? "");
}

export function isDefaultDatabase(): boolean {
  return SOLID_CACHE_CONFIG === "config/cache_no_database.yml";
}

export function firstShardKey(): string {
  return isDefaultDatabase() ? "default" : SolidCache.configuration.shardKeys()[0];
}

export function secondShardKey(): string {
  return SolidCache.configuration.shardKeys()[1];
}

export function useSolidCache(): {
  lookupStore(options?: StoreOptions): Store;
  keyPattern(key: string, options?: { namespace?: string | null }): RegExp;
  namespace(): string;
  shardKeys(cache: Store, shard: string): Promise<string[]>;
  allStores: Store[];
} {
  const state = { namespace: "" };
  const allStores: Store[] = [];
  let old: typeof TopLevel.Trails;
  let oldConfiguration: Configuration;

  beforeAll(async () => {
    old = TopLevel.Trails;
    TopLevel.Trails = {
      ...old,
      env: old?.env ?? new EnvironmentInquirer(ActiveRecord.ConnectionHandling.DEFAULT_ENV()),
    } as unknown as typeof TopLevel.Trails;
    await loadCacheSchema();
    oldConfiguration = SolidCache.configuration;
    SolidCache.configuration = new Configuration({ storeOptions: { maxAge: 3600, maxSize: null } });
  });

  afterAll(() => {
    TopLevel.Trails = old;
    SolidCache.configuration = oldConfiguration;
  });

  afterEach(async () => {
    for (const store of allStores.splice(0)) await waitForBackgroundTasks(store);
  });

  beforeEach(async () => {
    state.namespace = `test-${crypto.randomUUID().replaceAll("-", "")}`;
    await Record.eachShard(() => Entry.deleteAll());
  });

  return {
    lookupStore(options: StoreOptions = {}): Store {
      const store = new Store({ namespace: state.namespace, ...options });
      allStores.push(store);
      return store;
    },

    namespace: () => state.namespace,

    async shardKeys(cache: Store, shard: string): Promise<string[]> {
      const namespacedKeys: Uint8Array[] = [];
      for (let i = 0; i < 100; i++) {
        namespacedKeys.push(
          await (
            cache as unknown as { normalizeKey(k: string, o: object): Promise<Uint8Array> }
          ).normalizeKey(`key${i}`, {}),
        );
      }
      const keys = cache.connections().assign(namespacedKeys).get(shard)!;
      const prefix = `${state.namespace}:`;
      return keys.map((key) => {
        const decoded = new TextDecoder().decode(key);
        return decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded;
      });
    },
    allStores,

    keyPattern(key: string, { namespace = state.namespace }: { namespace?: string | null } = {}) {
      return new RegExp(
        `${regexpEscape(namespace ?? "")}${namespace != null ? ":" : ""}${regexpEscape(key)}`,
      );
    },
  };
}
