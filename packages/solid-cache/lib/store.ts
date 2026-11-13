import { isPresent, deprecator } from "@blazetrails/activesupport";
import {
  Store as CacheStore,
  type Entry as CacheEntry,
  type StoreOptions,
} from "@blazetrails/activesupport/cache";
import type { EventPayload } from "@blazetrails/activesupport/notifications/instrumenter";
import {
  ArgumentError,
  constSet,
  fetch,
  include,
  rbModName,
  TopLevel,
  type Included,
} from "@blazetrails/ruby-compat";
import type { Connections as SolidCacheConnections } from "./connections.js";
import { SolidCache } from "./solid-cache.js";
import { Api } from "./store/api.js";
import { Connections } from "./store/connections.js";
import { Entries } from "./store/entries.js";
import { Failsafe, type ErrorHandler } from "./store/failsafe.js";

type Overridden =
  | "increment"
  | "decrement"
  | "cleanup"
  | "clear"
  | "readEntry"
  | "writeEntry"
  | "readMultiEntries"
  | "writeMultiEntries"
  | "deleteEntry"
  | "deleteMultiEntries"
  | "serializeEntry"
  | "deserializeEntry"
  | "normalizeKey";

/** @internal */
export interface StoreInternals {
  readEntry(key: string, options: StoreOptions): Promise<CacheEntry | null>;
  writeEntry(key: string, entry: CacheEntry, options: StoreOptions): Promise<boolean>;
  readMultiEntries(names: unknown[], options: StoreOptions): Promise<Map<unknown, unknown>>;
  deleteEntry(key: string, options: StoreOptions): Promise<boolean>;
  serializeEntry(entry: CacheEntry, options?: StoreOptions): unknown;
  deserializeEntry(payload: unknown, options?: StoreOptions): CacheEntry | null;
  normalizeKey(key: unknown, options?: StoreOptions): Promise<string>;
  mergedOptions(callOptions?: StoreOptions): StoreOptions;
  normalizeVersion(key: unknown, options?: StoreOptions): Promise<string | undefined>;
  instrument<T>(
    operation: string,
    key: unknown,
    options?: StoreOptions,
    block?: (payload: EventPayload) => T,
  ): T;
}

/** @internal */
export type StoreHost = Store & StoreInternals;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Api, Connections, Entries, Failsafe` (store.rb:5).
export interface Store
  extends
    Omit<Included<typeof Api>, Overridden>,
    Included<typeof Connections>,
    Included<typeof Entries>,
    Included<typeof Failsafe> {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above. */
export class Store extends CacheStore {
  static {
    include(this, Api);
    include(this, Connections);
    include(this, Entries);
    include(this, Failsafe);
    constSet(SolidCache, "Store", this);
  }

  declare protected readEntry: (key: string, options: StoreOptions) => Promise<CacheEntry | null>;
  declare protected writeEntry: (
    key: string,
    entry: CacheEntry,
    options: StoreOptions,
  ) => Promise<boolean>;
  declare protected deleteEntry: (key: string, options: StoreOptions) => Promise<boolean>;

  readonly maxKeyBytesize: number;
  readonly shardOptions: string[] | null;
  readonly clearWith: string | null;
  /** @internal */
  readonly errorHandler: ErrorHandler | null;
  /** @internal */
  _connections?: ReturnType<typeof SolidCacheConnections.fromConfig>;

  /**
   * @inlinedFrom SolidCache::Store::Api#initialize solid_cache/v1.0.7/lib/solid_cache/store/api.rb:11-15
   * @inlinedFrom SolidCache::Store::Connections#initialize solid_cache/v1.0.7/lib/solid_cache/store/connections.rb:8-27
   * @inlinedFrom SolidCache::Store::Entries#initialize solid_cache/v1.0.7/lib/solid_cache/store/entries.rb:8-17
   * @inlinedFrom SolidCache::Store::Failsafe#initialize solid_cache/v1.0.7/lib/solid_cache/store/failsafe.rb:21-25
   */
  constructor(options: StoreOptions = {}) {
    options = { ...SolidCache.configuration.storeOptions, ...options };
    super(options);

    this.maxKeyBytesize = Object.hasOwn(options, "maxKeyBytesize")
      ? (options.maxKeyBytesize as number)
      : Api.DEFAULT_MAX_KEY_BYTESIZE;

    if (isPresent(options.clusters)) {
      const clusters = options.clusters as { shards?: string[] }[];
      if (clusters.length > 1) {
        throw new ArgumentError("Multiple clusters are no longer supported");
      } else {
        deprecator().warn(":clusters is deprecated, use :shards instead.");
      }
      this.shardOptions = fetch<{ shards?: string[] }[]>(options, "clusters")[0].shards ?? null;
    } else if (isPresent(options.cluster)) {
      deprecator().warn(":cluster is deprecated, use :shards instead.");
      this.shardOptions =
        ((Object.hasOwn(options, "cluster") ? options.cluster : {}) as { shards?: string[] })
          .shards ?? null;
    } else {
      this.shardOptions = Object.hasOwn(options, "shards") ? (options.shards as string[]) : null;
    }

    if (!(Array.isArray(this.shardOptions) || this.shardOptions == null)) {
      throw new ArgumentError(
        `\`shards\` is a \`${rbModName((this.shardOptions as object).constructor)}\`, it should be Array or nil`,
      );
    }

    const clearWith = Object.hasOwn(options, "clearWith")
      ? options.clearWith
      : TopLevel.Trails!.env["test?"]()
        ? "delete"
        : "truncate";
    this.clearWith = clearWith == null ? null : String(clearWith);

    if (!(["truncate", "delete"] as (string | null)[]).includes(this.clearWith)) {
      throw new ArgumentError("`clear_with` must be either ``:truncate`` or ``:delete`");
    }

    this.errorHandler = Object.hasOwn(options, "errorHandler")
      ? (options.errorHandler as ErrorHandler | null)
      : Failsafe.DEFAULT_ERROR_HANDLER;
  }

  static isSupportsCacheVersioning(): boolean {
    return true;
  }

  /** @inlinedFrom SolidCache::Store::Connections#setup! solid_cache/v1.0.7/lib/solid_cache/store/connections.rb:42-44 */
  setupBang(): void {
    this.connections();
  }
}
