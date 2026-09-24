import { rbInspect } from "@blazetrails/ruby-compat";

import { Entry } from "./entry.js";
import { Store, UNIVERSAL_OPTIONS, inspectOptions, type StoreOptions } from "./store.js";
import { registerStoreClass } from "./store-registry.js";
import { TopLevel } from "../namespaces.js";
import { currentErrorReporter } from "../error-reporter.js";
import { extractBang } from "../core-ext/hash/slice.js";

type Redis = ReturnType<NonNullable<typeof TopLevel.Redis>["new"]>;

type ErrorHandler = (args: { method: string; returning: unknown; exception: Error }) => void;

export class RedisCacheStore extends Store {
  static readonly MAX_KEY_BYTESIZE = 1024;

  static readonly DEFAULT_REDIS_OPTIONS = {
    connectTimeout: 1,
    readTimeout: 1,
    writeTimeout: 1,
  };

  static readonly DEFAULT_ERROR_HANDLER: ErrorHandler = ({ method, returning, exception }) => {
    if (Store.logger) {
      Store.logger.error?.(
        `RedisCacheStore: ${method} failed, returned ${rbInspect(returning)}: ${exception.constructor.name}: ${exception.message}`,
      );
    }
    currentErrorReporter.report(exception, {
      severity: "warning",
      source: "redis_cache_store.active_support",
    });
  };

  static supportsCacheVersioning(): boolean {
    return true;
  }

  static buildRedis({
    redis = null,
    url = null,
    ...redisOptions
  }: StoreOptions & { redis?: unknown; url?: unknown } = {}): Redis {
    const urls = url == null ? [] : Array.isArray(url) ? url : [url];

    if (typeof redis === "function") {
      return (redis as () => Redis)();
    } else if (redis) {
      return redis as Redis;
    } else if (urls.length > 1) {
      return this.buildRedisDistributedClient({ urls, ...redisOptions });
    } else if (urls.length === 0) {
      return this.buildRedisClient(redisOptions);
    } else {
      return this.buildRedisClient({ url: urls[0], ...redisOptions });
    }
  }

  /**
   * @internal
   * @missingRailsCall new — CONVERGEABLE call-gate-credits-ruby-new-only-as-constructor
   */
  private static buildRedisDistributedClient({
    urls,
    ...redisOptions
  }: StoreOptions & { urls: unknown[] }): Redis {
    const dist = TopLevel.Redis!.Distributed.new([], {
      ...RedisCacheStore.DEFAULT_REDIS_OPTIONS,
      ...redisOptions,
    });
    for (const u of urls) dist.addNode({ url: u });
    return dist;
  }

  /**
   * @internal
   * @missingRailsCall new — CONVERGEABLE call-gate-credits-ruby-new-only-as-constructor
   */
  private static buildRedisClient(redisOptions: StoreOptions): Redis {
    return TopLevel.Redis!.new({ ...RedisCacheStore.DEFAULT_REDIS_OPTIONS, ...redisOptions });
  }

  readonly maxKeyBytesize: number;
  readonly redis: Redis;
  private errorHandler: ErrorHandler | null;

  /** @missingRailsCall new — CONVERGEABLE call-gate-credits-ruby-new-only-as-constructor */
  constructor({
    errorHandler = RedisCacheStore.DEFAULT_ERROR_HANDLER,
    ...redisOptions
  }: StoreOptions & { errorHandler?: ErrorHandler | null } = {}) {
    const universalOptions = extractBang(redisOptions, ...UNIVERSAL_OPTIONS);

    let redis: Redis;
    const poolOptions = RedisCacheStore.retrievePoolOptions(redisOptions);
    if (poolOptions) {
      redis = TopLevel.ConnectionPool!.new(poolOptions, () =>
        RedisCacheStore.buildRedis(redisOptions),
      ) as unknown as Redis;
    } else {
      redis = RedisCacheStore.buildRedis(redisOptions);
    }

    super(universalOptions);
    this.redis = redis;
    this.maxKeyBytesize = RedisCacheStore.MAX_KEY_BYTESIZE;
    this.errorHandler = errorHandler;
  }

  inspect(): string {
    return `#<${this.constructor.name} options=${inspectOptions(this.options)} redis=${rbInspect(this.redis)}>`;
  }

  /** @internal */
  protected readEntry(key: string, options: StoreOptions): Entry | null {
    return this.deserializeEntry(this.readSerializedEntry(key, options), options);
  }

  /** @internal */
  private readSerializedEntry(key: string, _options: StoreOptions): unknown {
    return this.failsafe("read_entry", {}, () => this.redis.then((c) => c.get(key)));
  }

  /** @internal */
  protected writeEntry(key: string, entry: Entry, options: StoreOptions): boolean {
    const { raw = false } = options;
    return this.writeSerializedEntry(key, this.serializeEntry(entry, { ...options, raw }), {
      ...options,
      raw,
    });
  }

  /** @internal */
  private writeSerializedEntry(
    key: string,
    payload: unknown,
    {
      raw = false,
      unlessExist = false,
      expiresIn = null,
      raceConditionTtl = null,
      pipeline = null,
    }: StoreOptions & {
      raw?: unknown;
      unlessExist?: unknown;
      expiresIn?: number | null;
      raceConditionTtl?: unknown;
      pipeline?: { set(key: string, value: unknown, modifiers: StoreOptions): unknown } | null;
    },
  ): boolean {
    if (raceConditionTtl && expiresIn && expiresIn > 0 && !raw) {
      expiresIn += 5 * 60;
    }

    const modifiers: StoreOptions = {};
    if (unlessExist || expiresIn) {
      modifiers.nx = unlessExist;
      if (expiresIn) modifiers.px = Math.ceil(1000 * expiresIn);
    }

    if (pipeline) {
      return pipeline.set(key, payload, modifiers) as boolean;
    } else {
      return this.failsafe("write_entry", { returning: null }, () =>
        this.redis.then((c) => !!c.set(key, payload, modifiers)),
      ) as boolean;
    }
  }

  /** @internal */
  protected deleteEntry(key: string, _options: StoreOptions): boolean {
    return this.failsafe("delete_entry", { returning: false }, () =>
      this.redis.then((c) => c.del(key) === 1),
    );
  }

  /** @internal */
  protected override deserializeEntry(payload: unknown, options: StoreOptions = {}): Entry | null {
    if (options.raw && payload != null) {
      return new Entry(payload);
    } else {
      return super.deserializeEntry(payload);
    }
  }

  /** @internal */
  protected override serializeEntry(entry: Entry, options: StoreOptions = {}): unknown {
    const { raw = false } = options;
    if (raw) {
      return String(entry.value);
    } else {
      return super.serializeEntry(entry, { ...options, raw });
    }
  }

  /**
   * @internal
   * @missingRailsCall call — PERMANENT
   */
  private failsafe<T, R = null>(
    method: string,
    { returning = null as R }: { returning?: R },
    block: () => T,
  ): T | R {
    try {
      return block();
    } catch (error) {
      if (
        error instanceof TopLevel.Redis!.BaseError ||
        error instanceof TopLevel.ConnectionPool!.Error ||
        error instanceof TopLevel.ConnectionPool!.TimeoutError
      ) {
        this.errorHandler?.({ method, exception: error, returning });
        return returning;
      }
      throw error;
    }
  }
}

registerStoreClass(":redis_cache_store", RedisCacheStore);
