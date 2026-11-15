import { Hash, rbCallSuper, rbModName, rbObjId, slice } from "@blazetrails/ruby-compat";
import { underscore } from "../../inflector.js";
import { extractOptionsBang } from "../../hash-utils.js";
import { IsolatedExecutionState } from "../../isolated-execution-state.js";
import type { Entry } from "../entry.js";
import type { StoreOptions } from "../store.js";

type Options = StoreOptions & { event?: Record<string, unknown> };

/** @internal */
export interface LocalCacheHost {
  mergedOptions(options?: StoreOptions): StoreOptions;
  normalizeKey(name: unknown, options?: StoreOptions): Promise<unknown>;
  normalizeVersion(name: unknown, options?: StoreOptions): Promise<string | undefined>;
  deserializeEntry(payload: unknown, options?: StoreOptions): Entry | null;
  serializeEntry(entry: Entry, options?: StoreOptions): unknown;
  newEntry(value: unknown, options?: StoreOptions): Entry;
}

type Host = LocalCacheHost & { _localCacheKey?: string };

/** @internal */
export const LocalCacheRegistry = {
  cacheFor(localCacheKey: string): LocalStore | null | undefined {
    let registry = IsolatedExecutionState.get<Record<string, LocalStore | null>>(
      "active_support_local_cache_registry",
    );
    if (registry == null) {
      registry = {};
      IsolatedExecutionState.set("active_support_local_cache_registry", registry);
    }
    return registry[localCacheKey];
  },

  setCacheFor(localCacheKey: string, value: LocalStore | null | undefined): void {
    let registry = IsolatedExecutionState.get<Record<string, LocalStore | null | undefined>>(
      "active_support_local_cache_registry",
    );
    if (registry == null) {
      registry = {};
      IsolatedExecutionState.set("active_support_local_cache_registry", registry);
    }
    registry[localCacheKey] = value;
  },
};

export class LocalStore {
  static toString(): string {
    return "ActiveSupport::Cache::Strategy::LocalCache::LocalStore";
  }

  private data: Hash<unknown, unknown>;

  constructor() {
    this.data = new Hash();
  }

  clear(_options: unknown = null): void {
    this.data.clear();
  }

  readEntry(key: unknown): unknown {
    return this.data.get(key);
  }

  readMultiEntries(keys: unknown[]): Hash<unknown, unknown> {
    return slice(this.data, ...keys);
  }

  writeEntry(key: unknown, entry: unknown): boolean {
    this.data.set(key, entry);
    return true;
  }

  deleteEntry(key: unknown): boolean {
    const value = this.data.get(key);
    this.data.delete(key);
    return value != null && value !== false;
  }

  async fetchEntry(key: unknown, block?: () => unknown): Promise<unknown> {
    if (this.data.has(key)) return this.data.get(key);
    const value = await block!();
    this.data.set(key, value);
    return value;
  }
}

export const LocalCache = {
  withLocalCache<T>(this: Host, block: () => T | Promise<T>): Promise<T> {
    return LocalCache.useTemporaryLocalCache.call(this, new LocalStore(), block) as Promise<T>;
  },

  async clear(this: Host, options: StoreOptions | null = null): Promise<void> {
    const cache = LocalCache.localCache.call(this);
    if (cache == null) return (await rbCallSuper(this, LocalCache.clear, options)) as void;
    cache.clear(options);
    await rbCallSuper(this, LocalCache.clear, options);
  },

  async cleanup(this: Host, options: StoreOptions | null = null): Promise<void> {
    const cache = LocalCache.localCache.call(this);
    if (cache == null) return (await rbCallSuper(this, LocalCache.cleanup, options)) as void;
    cache.clear(options);
    await rbCallSuper(this, LocalCache.cleanup, options);
  },

  async deleteMatched(
    this: Host,
    matcher: unknown,
    options: StoreOptions | null = null,
  ): Promise<void> {
    const cache = LocalCache.localCache.call(this);
    if (cache == null)
      return (await rbCallSuper(this, LocalCache.deleteMatched, matcher, options)) as void;
    cache.clear(options);
    await rbCallSuper(this, LocalCache.deleteMatched, matcher, options);
  },

  async increment(
    this: Host,
    name: string,
    amount = 1,
    options: StoreOptions = {},
  ): Promise<unknown> {
    if (LocalCache.localCache.call(this) == null)
      return await rbCallSuper(this, LocalCache.increment, name, amount, options);
    const value = await LocalCache.bypassLocalCache.call(this, () =>
      rbCallSuper(this, LocalCache.increment, name, amount, options),
    );
    await LocalCache.writeCacheValue.call(this, name, value, { raw: true, ...options });
    return value;
  },

  async decrement(
    this: Host,
    name: string,
    amount = 1,
    options: StoreOptions = {},
  ): Promise<unknown> {
    if (LocalCache.localCache.call(this) == null)
      return await rbCallSuper(this, LocalCache.decrement, name, amount, options);
    const value = await LocalCache.bypassLocalCache.call(this, () =>
      rbCallSuper(this, LocalCache.decrement, name, amount, options),
    );
    await LocalCache.writeCacheValue.call(this, name, value, { raw: true, ...options });
    return value;
  },

  async fetchMulti(this: Host, ...names: unknown[]): Promise<Map<unknown, unknown>> {
    const block = names.pop() as (key: unknown) => unknown;
    if (LocalCache.localCache.call(this) == null || names.length === 0)
      return (await rbCallSuper(this, LocalCache.fetchMulti, ...names, block)) as Map<
        unknown,
        unknown
      >;

    let options: StoreOptions = extractOptionsBang(names);
    options = this.mergedOptions(options);

    const keysToNames = new Hash<unknown, unknown>();
    for (const name of names) keysToNames.set(await this.normalizeKey(name, options), name);

    const localCache = LocalCache.localCache.call(this)!;
    const localEntries = localCache.readMultiEntries([...keysToNames.keys()]);
    const results = new Map<unknown, unknown>();
    for (const [key, value] of localEntries) {
      if (value == null) continue;

      const entry = this.deserializeEntry(value, options);

      const normalizedKey = keysToNames.get(key);
      if (entry == null) {
        results.set(normalizedKey, null);
      } else if (
        entry.isExpired() ||
        entry.isMismatched((await this.normalizeVersion(normalizedKey, options)) ?? null)
      ) {
        localCache.deleteEntry(key);
      } else {
        results.set(normalizedKey, entry.value);
      }
    }

    if (results.size < names.length) {
      const rest = (await rbCallSuper(
        this,
        LocalCache.fetchMulti,
        ...names.filter((name) => !results.has(name)),
        options,
        block,
      )) as Map<unknown, unknown>;
      for (const [k, v] of rest) results.set(k, v);
    }

    return results;
  },

  /** @internal */
  async readSerializedEntry(this: Host, key: unknown, options: Options = {}): Promise<unknown> {
    const cache = LocalCache.localCache.call(this);
    if (cache != null) {
      let hit = true;
      const entry = await cache.fetchEntry(key, () => {
        hit = false;
        return rbCallSuper(this, LocalCache.readSerializedEntry, key, options);
      });
      if (hit && options.event) options.event.store = rbModName(cache.constructor);
      return entry;
    } else {
      return await rbCallSuper(this, LocalCache.readSerializedEntry, key, options);
    }
  },

  /** @internal */
  async readMultiEntries(
    this: Host,
    names: unknown[],
    options: StoreOptions = {},
  ): Promise<Map<unknown, unknown>> {
    const localCache = LocalCache.localCache.call(this);
    if (localCache == null)
      return (await rbCallSuper(this, LocalCache.readMultiEntries, names, options)) as Map<
        unknown,
        unknown
      >;

    const keysToNames = new Hash<unknown, unknown>();
    for (const name of names) keysToNames.set(await this.normalizeKey(name, options), name);

    const localEntries = localCache.readMultiEntries([...keysToNames.keys()]);

    const results = new Map<unknown, unknown>();
    for (const [key, value] of localEntries) {
      if (value == null) continue;

      const entry = this.deserializeEntry(value, options);

      const normalizedKey = keysToNames.get(key);
      if (entry == null) {
        results.set(normalizedKey, null);
      } else if (
        entry.isExpired() ||
        entry.isMismatched((await this.normalizeVersion(normalizedKey, options)) ?? null)
      ) {
        localCache.deleteEntry(key);
      } else {
        results.set(normalizedKey, entry.value);
      }
    }

    if (results.size < names.length) {
      const rest = (await rbCallSuper(
        this,
        LocalCache.readMultiEntries,
        names.filter((name) => !results.has(name)),
        options,
      )) as Map<unknown, unknown>;
      for (const [k, v] of rest) results.set(k, v);
    }

    return results;
  },

  /** @internal */
  writeSerializedEntry(
    this: Host,
    key: unknown,
    payload: unknown,
    options?: StoreOptions,
  ): unknown {
    const returnValue = rbCallSuper(this, LocalCache.writeSerializedEntry, key, payload, options);
    const localCache = LocalCache.localCache.call(this);
    if (returnValue != null && returnValue !== false) {
      if (localCache != null) localCache.writeEntry(key, payload);
    } else {
      if (localCache != null) localCache.deleteEntry(key);
    }
    return returnValue;
  },

  /** @internal */
  async deleteEntry(this: Host, key: unknown, options?: StoreOptions): Promise<boolean> {
    const localCache = LocalCache.localCache.call(this);
    if (localCache != null) localCache.deleteEntry(key);
    return (await rbCallSuper(this, LocalCache.deleteEntry, key, options)) as boolean;
  },

  /** @internal */
  async writeCacheValue(
    this: Host,
    name: unknown,
    value: unknown,
    options: StoreOptions = {},
  ): Promise<void> {
    name = await this.normalizeKey(name, options);
    const cache = LocalCache.localCache.call(this)!;
    if (value != null && value !== false) {
      cache.writeEntry(name, this.serializeEntry(this.newEntry(value, options), options));
    } else {
      cache.deleteEntry(name);
    }
  },

  /** @internal */
  localCacheKey(this: Host): string {
    return (this._localCacheKey ??=
      `${underscore(this.constructor.name)}_local_cache_${rbObjId(this)}`.replace(/[/-]/g, "_"));
  },

  /** @internal */
  localCache(this: Host): LocalStore | null | undefined {
    return LocalCacheRegistry.cacheFor(LocalCache.localCacheKey.call(this));
  },

  /** @internal */
  bypassLocalCache<T>(this: Host, block: () => T | Promise<T>): Promise<T> {
    return LocalCache.useTemporaryLocalCache.call(this, null, block) as Promise<T>;
  },

  /** @internal */
  useTemporaryLocalCache<T>(
    this: Host,
    temporaryCache: LocalStore | null,
    block: () => T | Promise<T>,
  ): Promise<T> {
    return IsolatedExecutionState.fork("active_support_local_cache_registry", async () => {
      const localCacheKey = LocalCache.localCacheKey.call(this);
      const saveCache = LocalCacheRegistry.cacheFor(localCacheKey);
      try {
        LocalCacheRegistry.setCacheFor(localCacheKey, temporaryCache);
        return await block();
      } finally {
        LocalCacheRegistry.setCacheFor(localCacheKey, saveCache);
      }
    });
  },
};
