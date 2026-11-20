import { createPool, type Pool } from "generic-pool";
import { Redis, ReplyError, type ChainableCommander, type RedisOptions } from "ioredis";
import {
  ArgumentError,
  Hash,
  NotImplementedError,
  prepend,
  rbInspect,
  rbModName,
  type Included,
} from "@blazetrails/ruby-compat";
import { ActiveSupport } from "../namespaces.js";
import { Digest } from "../digest.js";
import { currentErrorReporter } from "../error-reporter.js";
import { Entry } from "./entry.js";
import type { CacheStore } from "./index.js";
import { DeserializationError } from "./deserialization-error.js";
import { LocalCache } from "./strategy/local-cache.js";
import { Store, UNIVERSAL_OPTIONS, inspectOptions, type StoreOptions } from "./store.js";

type RedisClient = Redis | Pool<Redis>;

type ErrorHandler = (args: { method: string; returning: unknown; exception: unknown }) => void;

export const MAX_KEY_BYTESIZE = 1024;

export const DEFAULT_REDIS_OPTIONS: RedisOptions = {
  connectTimeout: 1000,
  commandTimeout: 1000,
};

export const DEFAULT_ERROR_HANDLER: ErrorHandler = ({ method, returning, exception }) => {
  const logger = Store.logger;
  if (logger) {
    const error = exception as Error;
    logger.error?.(
      `RedisCacheStore: ${method} failed, returned ${rbInspect(returning)}: ${rbModName(error.constructor)}: ${error.message}`,
    );
  }
  currentErrorReporter.report(exception as Error, {
    severity: "warning",
    source: "redis_cache_store.active_support",
  });
};

const SCAN_BATCH_SIZE = 1000;

/** @noRailsEquivalent PERMANENT */
async function _then<T>(redis: RedisClient, block: (c: Redis) => T | Promise<T>): Promise<T> {
  if (redis instanceof Redis) return await block(redis);
  return await redis.use(block);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `prepend Strategy::LocalCache` (redis_cache_store.rb:63).
export interface RedisCacheStore extends Pick<Included<typeof LocalCache>, "withLocalCache"> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class RedisCacheStore extends Store implements CacheStore {
  static supportsCacheVersioning(): boolean {
    return true;
  }

  static {
    prepend(this, LocalCache);
  }

  static buildRedis({
    redis = null,
    url = null,
    ...redisOptions
  }: {
    redis?: Redis | (() => Redis) | null;
    url?: string | string[] | null;
  } & RedisOptions = {}): Redis {
    const urls = url == null ? [] : Array.isArray(url) ? url : [url];

    if (typeof redis === "function") {
      return redis();
    } else if (redis) {
      return redis;
    } else if (urls.length > 1) {
      return this.buildRedisDistributedClient({ urls, ...redisOptions });
    } else if (urls.length === 0) {
      return this.buildRedisClient(redisOptions);
    } else {
      return this.buildRedisClient({ url: urls[0], ...redisOptions });
    }
  }

  /** @internal */
  private static buildRedisDistributedClient(_: { urls: string[] } & RedisOptions): Redis {
    // @nie disposition=port-real rails=activesupport/lib/active_support/cache/redis_cache_store.rb:117
    throw new NotImplementedError("Redis::Distributed has no npm client counterpart");
  }

  /** @internal */
  private static buildRedisClient({
    url,
    ...redisOptions
  }: { url?: string } & RedisOptions): Redis {
    const options = { ...DEFAULT_REDIS_OPTIONS, ...redisOptions, lazyConnect: true };
    return url == null ? new Redis(options) : new Redis(url, options);
  }

  readonly maxKeyBytesize: number;
  readonly redis: RedisClient;
  private _errorHandler: ErrorHandler | null;
  private _supportsExpireNx?: boolean;

  constructor({
    errorHandler = DEFAULT_ERROR_HANDLER,
    ...redisOptions
  }: { errorHandler?: ErrorHandler | null } & StoreOptions = {}) {
    const universalOptions: StoreOptions = {};
    for (const key of UNIVERSAL_OPTIONS) {
      if (Object.hasOwn(redisOptions, key)) {
        universalOptions[key] = redisOptions[key];
        delete redisOptions[key];
      }
    }
    super(universalOptions);
    const poolOptions = (this.constructor as typeof RedisCacheStore).retrievePoolOptions(
      redisOptions,
    );
    if (poolOptions) {
      this.redis = createPool(
        {
          create: async () => RedisCacheStore.buildRedis(redisOptions),
          destroy: async (c) => void (await c.quit()),
        },
        {
          max: poolOptions.size as number,
          acquireTimeoutMillis: (poolOptions.timeout as number) * 1000,
        },
      );
    } else {
      this.redis = RedisCacheStore.buildRedis(redisOptions);
    }
    this.maxKeyBytesize = MAX_KEY_BYTESIZE;
    this._errorHandler = errorHandler;
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)} options=${inspectOptions(this.options)} redis=${rbInspect(this.redis)}>`;
  }

  override async readMulti(...names: unknown[]): Promise<Map<unknown, unknown>> {
    return await super.readMulti(...names);
  }

  override async deleteMatched(matcher: unknown, options?: StoreOptions): Promise<void> {
    if (typeof matcher !== "string") {
      throw new ArgumentError(`Only Redis glob strings are supported: ${rbInspect(matcher)}`);
    }
    const pattern = this.namespaceKey(matcher, options);

    await this.instrument("delete_matched", pattern, undefined, async () => {
      await _then(this.redis, async (c) => {
        let cursor = "0";
        const nodes = [c];
        for (const node of nodes) {
          do {
            let keys: string[];
            [cursor, keys] = await node.scan(cursor, "MATCH", pattern, "COUNT", SCAN_BATCH_SIZE);
            if (keys.length > 0) await node.del(...keys);
          } while (cursor !== "0");
        }
      });
    });
  }

  override async increment(
    name: string,
    amount = 1,
    options?: StoreOptions,
  ): Promise<number | null> {
    options = this.mergedOptions(options);
    const key = await this.normalizeKey(name, options);
    return await this.instrument("increment", key, { amount }, async () => {
      return await this.failsafe("increment", null, () => this.changeCounter(key, amount, options));
    });
  }

  override async decrement(
    name: string,
    amount = 1,
    options?: StoreOptions,
  ): Promise<number | null> {
    options = this.mergedOptions(options);
    const key = await this.normalizeKey(name, options);
    return await this.instrument("decrement", key, { amount }, async () => {
      return await this.failsafe("decrement", null, () =>
        this.changeCounter(key, -amount, options),
      );
    });
  }

  override async cleanup(options?: StoreOptions): Promise<void> {
    await super.cleanup(options);
  }

  override async clear(options?: StoreOptions): Promise<void> {
    await this.failsafe("clear", null, async () => {
      const namespace = this.mergedOptions(options).namespace;
      if (namespace != null && namespace !== false) {
        await this.deleteMatched("*", { namespace });
      } else {
        await _then(this.redis, (c) => c.flushdb());
      }
    });
  }

  async stats(): Promise<string> {
    return await _then(this.redis, (c) => c.info());
  }

  /** @internal */
  private async pipelineEntries<T>(
    entries: [string, T][],
    block: (pipe: ChainableCommander, entries: [string, T][]) => void | Promise<void>,
  ): Promise<void> {
    await _then(this.redis, async (c) => {
      const pipe = c.pipeline();
      await block(pipe, entries);
      await pipe.exec();
    });
  }

  /** @internal */
  protected async readEntry(key: string, options: StoreOptions): Promise<Entry | null> {
    return this.deserializeEntry(await this.readSerializedEntry(key, options), options);
  }

  /** @internal */
  protected async readSerializedEntry(key: string, _options?: StoreOptions): Promise<unknown> {
    return await this.failsafe("read_entry", null, () =>
      _then(this.redis, (c) => c.getBuffer(key)),
    );
  }

  /** @internal */
  protected override async readMultiEntries(
    names: unknown[],
    options: StoreOptions,
  ): Promise<Map<unknown, unknown>> {
    options = this.mergedOptions(options);
    const results = new Map<unknown, unknown>();
    if (names.length === 0) return results;

    const raw = Object.hasOwn(options, "raw") ? options.raw : false;
    const keys: string[] = [];
    for (const name of names) keys.push(await this.normalizeKey(name, options));

    const values = await this.failsafe("read_multi_entries", [] as (Buffer | null)[], () =>
      _then(this.redis, (c) => c.mgetBuffer(...keys)),
    );

    for (const [i, name] of names.entries()) {
      const value = values[i];
      if (value != null) {
        const entry = this.deserializeEntry(value, { raw });
        if (
          !(
            entry == null ||
            entry.isExpired() ||
            entry.isMismatched((await this.normalizeVersion(name, options)) ?? null)
          )
        ) {
          try {
            results.set(name, entry.value);
          } catch (error) {
            if (!(error instanceof DeserializationError)) throw error;
          }
        }
      }
    }
    return results;
  }

  /** @internal */
  protected async writeEntry(key: string, entry: Entry, options: StoreOptions): Promise<boolean> {
    const raw = options.raw ?? false;
    return await this.writeSerializedEntry(key, this.serializeEntry(entry, { ...options, raw }), {
      ...options,
      raw,
    });
  }

  /** @internal */
  protected async writeSerializedEntry(
    key: string,
    payload: unknown,
    {
      raw = false,
      unlessExist = false,
      expiresIn = null,
      raceConditionTtl = null,
      pipeline = null,
    }: StoreOptions = {},
  ): Promise<boolean> {
    let ttl = expiresIn as number | null;
    if (raceConditionTtl && ttl && ttl > 0 && !raw) {
      ttl += 5 * 60;
    }

    const modifiers: (string | number)[] = [];
    if (unlessExist || ttl) {
      if (unlessExist) modifiers.push("NX");
      if (ttl) modifiers.push("PX", Math.ceil(1000 * Number(ttl)));
    }

    const value = payload as string | Buffer;
    if (pipeline) {
      (pipeline as ChainableCommander).set(key, value, ...(modifiers as ["PX", number]));
      return true;
    } else {
      return (await this.failsafe("write_entry", null, () =>
        _then(
          this.redis,
          async (c) => (await c.set(key, value, ...(modifiers as ["PX", number]))) != null,
        ),
      )) as boolean;
    }
  }

  /** @internal */
  protected async deleteEntry(key: string, _options: StoreOptions): Promise<boolean> {
    return await this.failsafe("delete_entry", false, () =>
      _then(this.redis, async (c) => (await c.del(key)) === 1),
    );
  }

  /** @internal */
  protected override async deleteMultiEntries(
    entries: string[],
    _options: StoreOptions,
  ): Promise<number> {
    return await this.failsafe("delete_multi_entries", 0, () =>
      _then(this.redis, (c) => c.del(...entries)),
    );
  }

  /** @internal */
  protected override async writeMultiEntries(
    entries: Hash<string | Uint8Array, Entry>,
    options: StoreOptions,
  ): Promise<Hash<string | Uint8Array, Entry>> {
    if (entries.size === 0) return entries;

    await this.failsafe("write_multi_entries", null, () =>
      this.pipelineEntries([...entries] as [string, Entry][], async (pipeline, shardedEntries) => {
        options = { ...options };
        options.pipeline = pipeline;
        for (const [key, entry] of shardedEntries) {
          await this.writeEntry(key, entry, options);
        }
      }),
    );
    return entries;
  }

  /** @internal */
  protected override async normalizeKey(key: unknown, options?: StoreOptions): Promise<string> {
    return this.truncateKey((await super.normalizeKey(key, options)) as string);
  }

  /** @internal */
  private truncateKey(key: string): string {
    if (key && Buffer.byteLength(key) > this.maxKeyBytesize) {
      const suffix = `:hash:${Digest.hexdigest(key)}`;
      const truncateAt = this.maxKeyBytesize - Buffer.byteLength(suffix);
      return `${Buffer.from(key).subarray(0, truncateAt).toString("latin1")}${suffix}`;
    } else {
      return key;
    }
  }

  /** @internal */
  protected override deserializeEntry(
    payload: unknown,
    { raw = false }: StoreOptions = {},
  ): Entry | null {
    if (raw && payload != null) {
      return new Entry(payload instanceof Uint8Array ? Buffer.from(payload).toString() : payload);
    } else {
      return super.deserializeEntry(payload);
    }
  }

  /** @internal */
  protected override serializeEntry(entry: Entry, options: StoreOptions = {}): unknown {
    if (options.raw) {
      return String(entry.value);
    } else {
      return super.serializeEntry(entry, options);
    }
  }

  /** @internal */
  private async changeCounter(key: string, amount: number, options: StoreOptions): Promise<number> {
    return await _then(this.redis, async (c) => {
      const expiresIn = options.expiresIn as number | null | undefined;
      let count: number;
      if (expiresIn) {
        if (await this.isSupportsExpireNx()) {
          const results = await c
            .pipeline()
            .incrby(key, amount)
            .call("expire", key, Math.trunc(expiresIn), "NX")
            .exec();
          count = results![0][1] as number;
        } else {
          const results = await c.pipeline().incrby(key, amount).ttl(key).exec();
          count = results![0][1] as number;
          const ttl = results![1][1] as number;
          if (ttl < 0) await c.expire(key, Math.trunc(expiresIn));
        }
      } else {
        count = await c.incrby(key, amount);
      }
      return count;
    });
  }

  /** @internal */
  private async isSupportsExpireNx(): Promise<boolean> {
    if (this._supportsExpireNx !== undefined) return this._supportsExpireNx;
    const redisVersions = await _then(this.redis, async (c) =>
      [await c.info("server")].map((info) => /redis_version:(\S+)/.exec(info)?.[1] ?? "0"),
    );
    return (this._supportsExpireNx = redisVersions.every((v) => Number(v.split(".")[0]) >= 7));
  }

  /** @internal */
  private async failsafe<T, R>(
    method: string,
    returning: R,
    block: () => T | Promise<T>,
  ): Promise<T | R> {
    try {
      return await block();
    } catch (error) {
      if (
        error instanceof ReplyError ||
        (error instanceof Error &&
          ["MaxRetriesPerRequestError", "TimeoutError"].includes(error.name))
      ) {
        this._errorHandler?.({ method, exception: error, returning });
        return returning;
      }
      throw error;
    }
  }
}

ActiveSupport.Cache.RedisCacheStore = RedisCacheStore;
