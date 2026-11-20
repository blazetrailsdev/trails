import { createPool, type Pool } from "generic-pool";
import { Redis, ReplyError, type ChainableCommander, type RedisOptions } from "ioredis";
import { MaxRetriesPerRequestError } from "ioredis/built/errors/index.js";
import {
  ArgumentError,
  rbCmpint,
  b,
  byteslice,
  Gem,
  Hash,
  NotImplementedError,
  prepend,
  rbInspect,
  rbModName,
  type Included,
} from "@blazetrails/ruby-compat";
import { ActiveSupport } from "../namespaces.js";
import { wrap } from "../core-ext/array/wrap.js";
import { pluck } from "../enumerable-utils.js";
import { extractOptionsBang } from "../hash-utils.js";
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
  lazyConnect: true,
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
function _parseInfo(info: string): Record<string, string> {
  return Object.fromEntries(
    info
      .split("\r\n")
      .filter((line) => line.includes(":") && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1)]),
  );
}

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
    return url == null
      ? new Redis({ ...DEFAULT_REDIS_OPTIONS, ...redisOptions })
      : new Redis(url, { ...DEFAULT_REDIS_OPTIONS, ...redisOptions });
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
    if (names.length === 0) return new Map();

    let options = extractOptionsBang(names) as StoreOptions;
    options = this.mergedOptions(options);
    const keys = await Promise.all(names.map((name) => this.normalizeKey(name, options)));

    return await this.instrumentMulti("read_multi", keys, options, async (payload) => {
      const results = await this.readMultiEntries(names, options);
      const hits: Buffer[] = [];
      for (const name of results.keys()) hits.push(await this.normalizeKey(name, options));
      payload.hits = hits;
      return results;
    });
  }

  override async deleteMatched(matcher: unknown, options?: StoreOptions): Promise<void> {
    if (typeof matcher !== "string") {
      throw new ArgumentError(`Only Redis glob strings are supported: ${rbInspect(matcher)}`);
    }
    const pattern = this.namespaceKey(matcher, options);

    await this.instrument("delete_matched", pattern, undefined, async () => {
      await _then(this.redis, async (c) => {
        let cursor = "0";
        const nodes =
          typeof (c as { nodes?: unknown }).nodes === "function"
            ? (c as unknown as { nodes(): Redis[] }).nodes()
            : [c];
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
      return await this.failsafe("increment", () => this.changeCounter(key, amount, options));
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
      return await this.failsafe("decrement", () => this.changeCounter(key, -amount, options));
    });
  }

  override async cleanup(options?: StoreOptions): Promise<void> {
    await super.cleanup(options);
  }

  override async clear(options?: StoreOptions): Promise<void> {
    await this.failsafe("clear", async () => {
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
    entries: [Buffer, T][],
    block: (pipe: ChainableCommander, entries: [Buffer, T][]) => void | Promise<void>,
  ): Promise<void> {
    await _then(this.redis, async (c) => {
      const pipe = c.pipeline();
      await block(pipe, entries);
      await pipe.exec();
    });
  }

  /** @internal */
  protected async readEntry(key: Buffer, options: StoreOptions): Promise<Entry | null> {
    return this.deserializeEntry(await this.readSerializedEntry(key, options), options);
  }

  /** @internal */
  protected async readSerializedEntry(key: Buffer, _options?: StoreOptions): Promise<unknown> {
    return await this.failsafe("read_entry", () => _then(this.redis, (c) => c.getBuffer(key)));
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
    const keys: Buffer[] = [];
    for (const name of names) keys.push(await this.normalizeKey(name, options));

    const values = await this.failsafe(
      "read_multi_entries",
      { returning: {} as Record<number, Buffer | null> },
      () => _then(this.redis, (c) => c.mgetBuffer(...keys)),
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
  protected async writeEntry(key: Buffer, entry: Entry, options: StoreOptions): Promise<boolean> {
    const raw = options.raw ?? false;
    return await this.writeSerializedEntry(key, this.serializeEntry(entry, { ...options, raw }), {
      ...options,
      raw,
    });
  }

  /** @internal */
  protected async writeSerializedEntry(
    key: Buffer,
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
    if (raceConditionTtl != null && ttl != null && ttl > 0 && !raw) {
      ttl += 5 * 60;
    }

    const modifiers: (string | number)[] = [];
    if (unlessExist || ttl != null) {
      if (ttl != null) modifiers.push("PX", Math.ceil(1000 * Number(ttl)));
      if (unlessExist) modifiers.push("NX");
    }

    const value = payload instanceof Uint8Array ? Buffer.from(payload) : (payload as string);
    if (pipeline) {
      (pipeline as ChainableCommander).set(key, value, ...(modifiers as ["PX", number]));
      return true;
    } else {
      return (await this.failsafe("write_entry", { returning: null }, () =>
        _then(
          this.redis,
          async (c) => (await c.set(key, value, ...(modifiers as ["PX", number]))) != null,
        ),
      )) as boolean;
    }
  }

  /** @internal */
  protected async deleteEntry(key: Buffer, _options: StoreOptions): Promise<boolean> {
    return await this.failsafe("delete_entry", { returning: false }, () =>
      _then(this.redis, async (c) => (await c.del(key)) === 1),
    );
  }

  /** @internal */
  protected override async deleteMultiEntries(
    entries: Buffer[],
    _options: StoreOptions,
  ): Promise<number> {
    return await this.failsafe("delete_multi_entries", { returning: 0 }, () =>
      _then(this.redis, (c) => c.del(...entries)),
    );
  }

  /** @internal */
  protected override async writeMultiEntries(
    entries: Hash<string | Uint8Array, Entry>,
    options: StoreOptions,
  ): Promise<Hash<string | Uint8Array, Entry>> {
    if (entries.size === 0) return entries;

    await this.failsafe("write_multi_entries", () =>
      this.pipelineEntries([...entries] as [Buffer, Entry][], async (pipeline, shardedEntries) => {
        options = { ...options };
        options.pipeline = pipeline;
        for (const [key, entry] of shardedEntries) {
          await this.writeEntry(key, entry, options);
        }
      }),
    );
    return entries;
  }

  /**
   * @internal
   * @missingRailsArgs b — PERMANENT
   */
  protected override async normalizeKey(key: unknown, options?: StoreOptions): Promise<Buffer> {
    return this.truncateKey(b(await super.normalizeKey(key, options)));
  }

  /**
   * @internal
   * @inventedArm from — PERMANENT
   */
  private truncateKey(key: Uint8Array): Buffer {
    if (key && key.length > this.maxKeyBytesize) {
      const suffix = `:hash:${Digest.hexdigest(key)}`;
      const truncateAt = this.maxKeyBytesize - b(suffix).length;
      return Buffer.concat([byteslice(key, 0, truncateAt)!, b(suffix)]);
    } else {
      return Buffer.from(key);
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
  private serializeEntries(
    entries: Hash<string | Uint8Array, Entry>,
    options: StoreOptions = {},
  ): Map<string | Uint8Array, unknown> {
    return new Map([...entries].map(([key, entry]) => [key, this.serializeEntry(entry, options)]));
  }

  /** @internal */
  private async changeCounter(key: Buffer, amount: number, options: StoreOptions): Promise<number> {
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

  /**
   * @internal
   * @missingRailsArgs pluck — PERMANENT
   */
  private async isSupportsExpireNx(): Promise<boolean> {
    if (this._supportsExpireNx !== undefined) return this._supportsExpireNx;
    const redisVersions = await _then(
      this.redis,
      async (c) =>
        pluck(
          wrap<Record<string, string>>(_parseInfo(await c.info("server"))),
          "redis_version",
        ) as string[],
    );
    return (this._supportsExpireNx = redisVersions.every((v) => {
      const version = new Gem.Version(v);
      const minimum = new Gem.Version("7.0.0");
      return rbCmpint(version.compare(minimum), version, minimum) >= 0;
    }));
  }

  /** @internal */
  private async failsafe<T, R = null>(
    method: string,
    ...args: [{ returning?: R }, () => T | Promise<T>] | [() => T | Promise<T>]
  ): Promise<T | R> {
    const block = args.pop() as () => T | Promise<T>;
    const { returning = null as R } = (args[0] ?? {}) as { returning?: R };
    try {
      return await block();
    } catch (error) {
      if (
        error instanceof ReplyError ||
        error instanceof MaxRetriesPerRequestError ||
        (error instanceof Error &&
          (error.name === "TimeoutError" ||
            typeof (error as { code?: unknown }).code === "string" ||
            error.message === "Connection is closed."))
      ) {
        this._errorHandler?.({ method, exception: error, returning });
        return returning;
      }
      throw error;
    }
  }
}

ActiveSupport.Cache.RedisCacheStore = RedisCacheStore;
