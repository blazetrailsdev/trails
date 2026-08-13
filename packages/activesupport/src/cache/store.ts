import { Entry } from "./entry.js";
import { Coder, type CoderCompressor, type CoderSerializer } from "./coder.js";
import { SerializerWithFallback, type Serializer } from "./serializer-with-fallback.js";
import { getFormatVersion } from "./format-version-slot.js";
import { deflate, inflate } from "../gzip.js";
import { DeserializationError } from "./deserialization-error.js";
import { Notifications } from "../notifications.js";
import { toParam } from "../hash-utils.js";
import type { EventPayload } from "../notifications/instrumenter.js";

/** Mirrors Rails `Cache::DEFAULT_COMPRESS_LIMIT` (cache.rb:45). */
const DEFAULT_COMPRESS_LIMIT = 1024;

/** Mirrors Rails `Cache::Store::DEFAULT_POOL_OPTIONS` (cache.rb:197). */
const DEFAULT_POOL_OPTIONS: StoreOptions = { size: 5, timeout: 5 };

/** Mirrors Ruby `Object#inspect` for the values `retrieve_pool_options` reports. */
function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  return String(value);
}

/** The class name Ruby's conversion errors name the offending value by. */
function rubyClassName(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (value === true) return "true";
  if (value === false) return "false";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "string") return "String";
  if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "Float";
  return (value as object)?.constructor?.name ?? "Object";
}

/**
 * Mirrors Ruby's `Kernel#Integer` — the conversion `retrieve_pool_options`
 * applies to `pool_options[:size]` (cache.rb:213). Numerics truncate, Strings
 * are parsed with Ruby's literal grammar (leading/trailing whitespace and
 * underscore separators allowed, `0x`/`0b`/`0o`/`0` radix prefixes honoured, a
 * fractional or empty String rejected), and anything else is a TypeError.
 */
function Integer(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FloatDomainError(String(value));
    return Math.trunc(value);
  }
  if (typeof value !== "string") {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError(`can't convert ${rubyClassName(value)} into Integer`);
  }
  const digits = value.trim().replace(/(?<=[0-9a-fA-F])_(?=[0-9a-fA-F])/g, "");
  const body = digits.replace(/^[+-]/, "");
  let magnitude: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(body)) {
    magnitude = parseInt(body.slice(2), 16);
  } else if (/^0[bB][01]+$/.test(body)) {
    magnitude = parseInt(body.slice(2), 2);
  } else if (/^0[oO][0-7]+$/.test(body)) {
    magnitude = parseInt(body.slice(2), 8);
  } else if (/^0[dD][0-9]+$/.test(body)) {
    magnitude = parseInt(body.slice(2), 10);
  } else if (/^0[0-7]*$/.test(body)) {
    magnitude = parseInt(body, 8);
  } else if (/^[1-9][0-9]*$/.test(body)) {
    magnitude = parseInt(body, 10);
  } else {
    throw new ArgumentError(`invalid value for Integer(): ${inspect(value)}`);
  }
  return digits.startsWith("-") ? -magnitude : magnitude;
}

/**
 * Mirrors Ruby's `Kernel#Float` — the conversion `retrieve_pool_options`
 * applies to `pool_options[:timeout]` (cache.rb:214). Same String grammar as
 * {@link Integer} plus a fraction and exponent; an empty or whitespace-only
 * String is an ArgumentError, not `0`.
 */
function Float(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new TypeError(`can't convert ${rubyClassName(value)} into Float`);
  }
  const digits = value.trim().replace(/(?<=[0-9a-fA-F])_(?=[0-9a-fA-F])/g, "");
  const decimal = /^[+-]?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
  const hexadecimal = /^[+-]?0[xX][0-9a-fA-F]+(\.[0-9a-fA-F]+)?([pP][+-]?[0-9]+)?$/;
  if (!decimal.test(digits) && !hexadecimal.test(digits)) {
    throw new ArgumentError(`invalid value for Float(): ${inspect(value)}`);
  }
  return Number(digits);
}

/** Mirrors Ruby's `Zlib`, the default `:compressor` (cache.rb:305). */
const Zlib: CoderCompressor = { deflate, inflate };

/**
 * Mirror of Ruby's `TypeError` — what `retrieve_pool_options` raises for a
 * non-Hash `:pool` (cache.rb:217), and what `Integer()`/`Float()` raise for a
 * value they cannot convert (cache.rb:213-214). Its throw sites carry an
 * eslint-disable because `rails-error-parity` matches on the native name.
 * @internal
 */
class TypeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

/** Mirror of Ruby's `FloatDomainError` — `Integer(Float::INFINITY)`. @internal */
class FloatDomainError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "FloatDomainError";
  }
}

/** Mirrors Ruby ArgumentError. @internal */
export class ArgumentError extends Error {
  override name = "ArgumentError";
}
/** Mirrors Ruby NotImplementedError. @internal */
export class NotImplementedError extends Error {
  override name = "NotImplementedError";
}

/** @internal */
export interface CacheLogger {
  warn(message: string): void;
  error?(message: string): void;
  debug?(message: string): void;
  isDebug?(): boolean;
}

export type StoreOptions = Record<string, unknown>;

/**
 * The coder surface `Store` holds in `@coder` (cache.rb:301-312): `dump`/`load`,
 * plus `dump_compressed` when the coder answers it.
 *
 * @noRailsEquivalent PERMANENT — Ruby duck-types `@coder` (cache.rb:301-312);
 * TS has to name the shape a structural type checks against.
 */
export interface CacheCoder {
  dump(entry: Entry): unknown;
  load(payload: unknown): unknown;
  dumpCompressed?(entry: Entry, threshold: number): unknown;
}

/** Mirrors Ruby `Regexp.escape`: escapes regex metacharacters in a literal. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mirrors Ruby `Array#extract_options!`: mutably pops a trailing plain-object
 * options hash off the args array, returning it (or undefined). @internal
 */
function extractOptions(args: unknown[]): StoreOptions | undefined {
  const last = args[args.length - 1];
  if (last != null && typeof last === "object" && !Array.isArray(last)) {
    return args.pop() as StoreOptions;
  }
  return undefined;
}

/** Mirrors Rails Cache::Store::WriteOptions (cache.rb:1064). @internal */
export class WriteOptions {
  constructor(private _opts: StoreOptions) {}
  get expiresIn() {
    return this._opts.expiresIn as number | undefined;
  }
  set expiresIn(v: number | undefined) {
    delete this._opts.expiresAt;
    this._opts.expiresIn = v;
  }
  get expiresAt() {
    return this._opts.expiresAt as number | undefined;
  }
  set expiresAt(v: number | undefined) {
    delete this._opts.expiresIn;
    this._opts.expiresAt = v;
  }
  get version() {
    return this._opts.version as string | undefined;
  }
  set version(v: string | undefined) {
    this._opts.version = v;
  }
}

/** Mirrors Rails `ActiveSupport::Cache::Store` (cache.rb). @internal */
export abstract class Store {
  static logger: CacheLogger | null = null;
  static raiseOnInvalidCacheExpirationTime = false;

  static with<T>(options: { logger: CacheLogger }, fn: () => T): T {
    const prev = Store.logger;
    Store.logger = options.logger;
    try {
      return fn();
    } finally {
      Store.logger = prev;
    }
  }

  /**
   * Mirrors Rails `Cache::Store.retrieve_pool_options` (cache.rb:200-220), a
   * private class method the pooled stores call on their own options hash.
   * `options.key?(:pool)` distinguishes an explicit `pool: nil` from an absent
   * key, so the read is `"pool" in options`, not `?? true`. Ruby's
   * `Integer()`/`Float()` (cache.rb:213-214) raise on a value they cannot
   * convert rather than yielding NaN the way `Number()` does.
   *
   * @missingRailsCall merge — `DEFAULT_POOL_OPTIONS.merge(pool_options)`
   * (cache.rb:215) is the object spread here; a plain Hash#merge has no named
   * counterpart in the package.
   */
  static retrievePoolOptions(options: StoreOptions): StoreOptions | false | undefined {
    let poolOptions: unknown;
    if ("pool" in options) {
      poolOptions = options["pool"];
      delete options["pool"];
    } else {
      poolOptions = true;
    }

    if (poolOptions === false || poolOptions == null) {
      return false;
    } else if (poolOptions === true) {
      poolOptions = DEFAULT_POOL_OPTIONS;
    } else if (typeof poolOptions === "object" && !Array.isArray(poolOptions)) {
      const hash = poolOptions as StoreOptions;
      if ("size" in hash) hash["size"] = Integer(hash["size"]);
      if ("timeout" in hash) hash["timeout"] = Float(hash["timeout"]);
      poolOptions = { ...DEFAULT_POOL_OPTIONS, ...hash };
    } else {
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError(`Invalid :pool argument, expected Hash, got: ${inspect(poolOptions)}`);
    }

    const result = poolOptions as StoreOptions;
    return Object.keys(result).length > 0 ? result : undefined;
  }

  silence = false;
  options: StoreOptions;

  /**
   * The coder `Store#initialize` installs (cache.rb:301-312): `options[:coder]`
   * when the store names one — MemoryStore names `DupCoder`
   * (memory_store.rb:73-75) — else `Cache::Coder` over the default serializer
   * and Zlib. Rails also remembers whether it answers `dump_compressed`.
   */
  protected coder: CacheCoder;
  protected coderSupportsCompression: boolean;

  constructor(options?: StoreOptions) {
    this.options = options ? this.validateOptions(Store.normalizeOptions({ ...options })) : {};

    if (!("compress" in this.options)) this.options.compress = true;
    // Ruby `||=` replaces only nil/false, so an explicit `compress_threshold: 0`
    // — compress everything — survives where JS `||=` would take the default.
    if (this.options.compressThreshold == null || this.options.compressThreshold === false) {
      this.options.compressThreshold = DEFAULT_COMPRESS_LIMIT;
    }

    // Ruby `@options.delete(:coder) { ... }` runs the block only when the key is
    // absent, so an explicit `coder: nil` stays nil and falls through the `||=`
    // below to the passthrough serializer — Rails' direct-entry path.
    const hadCoder = "coder" in this.options;
    let coder = this.options.coder as CacheCoder | null | undefined;
    delete this.options.coder;
    if (!hadCoder) {
      const legacySerializer = getFormatVersion() < 7.1 && !this.options.serializer;
      let serializer = this.options.serializer as Serializer | string | undefined;
      delete this.options.serializer;
      serializer ||= this.defaultSerializer();
      // A Ruby Symbol is a colon-prefixed string in trails, which is what
      // `serializer.is_a?(Symbol)` discriminates on (cache.rb:303).
      if (typeof serializer === "string") {
        serializer = SerializerWithFallback.get(serializer.slice(1));
      }
      const compressor =
        "compressor" in this.options ? (this.options.compressor as CoderCompressor) : Zlib;
      delete this.options.compressor;

      coder = new Coder(serializer as unknown as CoderSerializer, compressor, {
        legacySerializer,
      });
    }
    this.coder =
      coder == null || (coder as unknown) === false
        ? (SerializerWithFallback.get("passthrough") as CacheCoder)
        : coder;
    this.coderSupportsCompression = typeof this.coder.dumpCompressed === "function";
  }

  silenceBang(): this {
    this.silence = true;
    return this;
  }

  mute<T>(block: () => T): T {
    const prev = this.silence;
    this.silence = true;
    try {
      return block();
    } finally {
      this.silence = prev;
    }
  }

  /** Mirrors Rails `Cache::Store#fetch` (cache.rb:443). */
  fetch(
    name: string,
    options?: StoreOptions,
    block?: (key: string, opts: WriteOptions) => unknown,
  ): unknown;
  fetch(name: string, block: (key: string, opts: WriteOptions) => unknown): unknown;
  fetch(
    name: string,
    optionsOrBlock?: StoreOptions | ((key: string, opts: WriteOptions) => unknown),
    maybeBlock?: (key: string, opts: WriteOptions) => unknown,
  ): unknown {
    let options: StoreOptions | undefined;
    let block: ((key: string, opts: WriteOptions) => unknown) | undefined;
    if (typeof optionsOrBlock === "function") {
      block = optionsOrBlock;
    } else {
      options = optionsOrBlock;
      block = maybeBlock;
    }

    if (block) {
      options = this.mergedOptions(options);
      const key = this.normalizeKey(name, options);
      let entry: Entry | null = null;
      if (!options.force) {
        this.instrument("read", key, options, (payload) => {
          const cachedEntry = this.readEntry(key, options!);
          entry = this.handleExpiredEntry(cachedEntry, key, options!);
          if (entry) {
            if (entry.isMismatched(this.normalizeVersion(name, options) ?? null)) {
              entry = null;
            } else {
              try {
                void entry.value;
              } catch (e) {
                if (e instanceof DeserializationError) entry = null;
                else throw e;
              }
            }
          }
          payload.super_operation = "fetch";
          payload.hit = !!entry;
        });
      }
      if (entry) return this.getEntryValue(entry, name, options);
      return this.saveBlockResultToCache(name, key, options, block);
    } else if (options?.force) {
      throw new ArgumentError(
        "Missing block: Calling `Cache#fetch` with `force: true` requires a block.",
      );
    } else {
      return this.read(name, options);
    }
  }

  read(name: string, options?: StoreOptions): unknown {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options);
    return this.instrument("read", key, options, (payload) => {
      const entry = this.readEntry(key, options);
      if (!entry) {
        payload.hit = false;
        return null;
      }
      if (entry.isExpired()) {
        this.deleteEntry(key, options);
        payload.hit = false;
        return null;
      }
      if (entry.isMismatched(version ?? null)) {
        payload.hit = false;
        return null;
      }
      payload.hit = true;
      try {
        return entry.value;
      } catch (e) {
        if (e instanceof DeserializationError) {
          payload.hit = false;
          return null;
        }
        throw e;
      }
    });
  }

  readMulti(...names: [...string[], StoreOptions] | string[]): Record<string, unknown> {
    if (names.length === 0) return {};
    let options = extractOptions(names as unknown[]);
    const nameList = names as string[];
    options = this.mergedOptions(options);
    const keys = nameList.map((name) => this.normalizeKey(name, options));
    return this.instrumentMulti("read_multi", keys, options, (payload) => {
      const results = this.readMultiEntries(nameList, options);
      payload.hits = Object.keys(results).map((name) => this.normalizeKey(name, options));
      return results;
    });
  }

  writeMulti(hash: Record<string, unknown>, options?: StoreOptions): Record<string, unknown> {
    if (Object.keys(hash).length === 0) return hash;
    options = this.mergedOptions(options);
    const normalizedHash: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(hash)) {
      normalizedHash[this.normalizeKey(key, options)] = value;
    }
    return this.instrumentMulti("write_multi", normalizedHash, options, () => {
      const entries: Record<string, Entry> = {};
      for (const [name, value] of Object.entries(hash)) {
        entries[this.normalizeKey(name, options)] = new Entry(value, {
          expiresIn: typeof options.expiresIn === "number" ? options.expiresIn : null,
          version: this.normalizeVersion(name, options) ?? undefined,
        });
      }
      return this.writeMultiEntries(entries, options);
    });
  }

  fetchMulti(
    ...namesAndBlock:
      | [...string[], StoreOptions, (key: string) => unknown]
      | [...string[], (key: string) => unknown]
  ): Record<string, unknown> {
    const block = namesAndBlock.pop() as ((key: string) => unknown) | undefined;
    if (typeof block !== "function")
      throw new ArgumentError("Missing block: `Cache#fetch_multi` requires a block.");
    if (namesAndBlock.length === 0) return {};
    let options = extractOptions(namesAndBlock as unknown[]);
    const names = namesAndBlock as string[];
    options = this.mergedOptions(options);
    const keys = names.map((name) => this.normalizeKey(name, options));
    const writes: Record<string, unknown> = {};
    const ordered = this.instrumentMulti("read_multi", keys, options, (payload) => {
      const reads = options.force ? {} : this.readMultiEntries(names, options);
      const result: Record<string, unknown> = {};
      for (const name of names) {
        result[name] = Object.prototype.hasOwnProperty.call(reads, name)
          ? reads[name]
          : (writes[name] = block(name));
      }
      if (options.skipNil) {
        for (const k of Object.keys(writes)) {
          if (writes[k] == null) delete writes[k];
        }
      }
      payload.hits = Object.keys(reads).map((name) => this.normalizeKey(name, options));
      payload.super_operation = "fetch_multi";
      return result;
    });
    this.writeMulti(writes, options);
    return ordered;
  }

  write(name: string, value: unknown, options?: StoreOptions): boolean {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("write", key, options, () =>
      this.writeEntry(
        key,
        new Entry(value, {
          expiresIn: typeof options.expiresIn === "number" ? options.expiresIn : null,
          version: this.normalizeVersion(name, options) ?? undefined,
        }),
        options,
      ),
    );
  }

  delete(name: string, options?: StoreOptions): boolean {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("delete", key, options, () => this.deleteEntry(key, options));
  }

  deleteMulti(names: string[], options?: StoreOptions): number {
    if (names.length === 0) return 0;
    options = this.mergedOptions(options);
    names = names.map((key) => this.normalizeKey(key, options));
    return this.instrumentMulti("delete_multi", names, options, () =>
      this.deleteMultiEntries(names, options),
    );
  }

  exist(name: string, options?: StoreOptions): boolean {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("exist?", key, undefined, () => {
      const entry = this.readEntry(key, options);
      return !!(
        entry &&
        !entry.isExpired() &&
        !entry.isMismatched(this.normalizeVersion(name, options) ?? null)
      );
    });
  }

  newEntry(value: unknown, options?: StoreOptions): Entry {
    options = this.mergedOptions(options);
    return new Entry(value, {
      expiresIn: typeof options.expiresIn === "number" ? options.expiresIn : null,
      version: options.version != null ? String(options.version) : undefined,
    });
  }

  deleteMatched(_matcher: unknown, _options?: StoreOptions): void {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support delete_matched`);
  }

  increment(_name: string, _amount = 1, _options?: StoreOptions): number | null {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support increment`);
  }

  decrement(_name: string, _amount = 1, _options?: StoreOptions): number | null {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support decrement`);
  }

  cleanup(_options?: StoreOptions): void {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support cleanup`);
  }

  clear(_options?: StoreOptions): void {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support clear`);
  }

  protected instrument<T>(
    operation: string,
    key: unknown,
    options?: StoreOptions,
    block?: (payload: EventPayload) => T,
  ): T {
    return this._instrument(operation, false, key, options, block);
  }

  protected instrumentMulti<T>(
    operation: string,
    keys: unknown,
    options?: StoreOptions,
    block?: (payload: EventPayload) => T,
  ): T {
    return this._instrument(operation, true, keys, options, block);
  }

  private _instrument<T>(
    operation: string,
    multi: boolean,
    key: unknown,
    options: StoreOptions | undefined,
    block?: (payload: EventPayload) => T,
  ): T {
    if (Store.logger?.isDebug?.() && !this.silence) {
      const multiSize = Array.isArray(key)
        ? key.length
        : key && typeof key === "object"
          ? Object.keys(key).length
          : 0;
      const debugKey = multi
        ? `: ${multiSize} key(s) specified`
        : key != null
          ? `: ${String(key)}`
          : "";
      const debugOptions =
        options && Object.keys(options).length > 0 ? ` (${JSON.stringify(options)})` : "";
      Store.logger.debug?.(`Cache ${operation}${debugKey}${debugOptions}`);
    }
    const payload: EventPayload = { key, store: this.constructor.name };
    if (options) Object.assign(payload, options);
    return Notifications.instrument<T>(`cache_${operation}.active_support`, payload, () =>
      block ? block(payload) : (undefined as T),
    ) as T;
  }

  /** Mirrors Rails `Cache::Store#default_serializer` (cache.rb:764-773). */
  private defaultSerializer(): Serializer {
    switch (getFormatVersion()) {
      case 7.0:
        return SerializerWithFallback.get("marshal_7_0");
      case 7.1:
        return SerializerWithFallback.get("marshal_7_1");
      default:
        throw new ArgumentError(
          `Unrecognized ActiveSupport::Cache.format_version: ${getFormatVersion()}`,
        );
    }
  }

  protected abstract readEntry(key: string, options: StoreOptions): Entry | null;
  protected abstract writeEntry(key: string, entry: Entry, options: StoreOptions): boolean;
  protected abstract deleteEntry(key: string, options: StoreOptions): boolean;

  /** Mirrors Rails `Cache::Store#serialize_entry` (cache.rb:806-813). */
  protected serializeEntry(entry: Entry, options?: StoreOptions): unknown {
    options = this.mergedOptions(options);
    if (this.coderSupportsCompression && options.compress) {
      return this.coder.dumpCompressed!(entry, options.compressThreshold as number);
    } else {
      return this.coder.dump(entry);
    }
  }

  /** Mirrors Rails `Cache::Store#deserialize_entry` (cache.rb:815-819). */
  protected deserializeEntry(payload: unknown): Entry | null {
    if (payload == null) return null;
    try {
      return this.coder.load(payload) as Entry;
    } catch (error) {
      if (error instanceof DeserializationError) return null;
      throw error;
    }
  }

  protected readMultiEntries(names: string[], options: StoreOptions): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    for (const name of names) {
      const key = this.normalizeKey(name, options);
      const entry = this.readEntry(key, options);
      if (!entry) continue;
      if (entry.isExpired()) {
        this.deleteEntry(key, options);
        continue;
      }
      if (!entry.isMismatched(this.normalizeVersion(name, options) ?? null)) {
        results[name] = entry.value;
      }
    }
    return results;
  }

  protected writeMultiEntries(
    hash: Record<string, Entry>,
    options: StoreOptions,
  ): Record<string, Entry> {
    for (const [key, entry] of Object.entries(hash)) this.writeEntry(key, entry, options);
    return hash;
  }

  protected deleteMultiEntries(keys: string[], options: StoreOptions): number {
    return keys.filter((k) => this.deleteEntry(k, options)).length;
  }

  /** Mirrors Rails `Cache::Store#merged_options` (cache.rb:861–888). */
  protected mergedOptions(callOptions?: StoreOptions): StoreOptions {
    if (!callOptions) return this.options;

    const call = Store.normalizeOptions({ ...callOptions });

    if (call.expiresIn != null && call.expiresAt != null) {
      throw new ArgumentError("Either :expires_in or :expires_at can be supplied, but not both");
    }

    const expiresAt = call.expiresAt as number | undefined;
    if (expiresAt != null) {
      // expiresAt is epoch-ms; expiresIn is in seconds (mirrors Rails' Time
      // arithmetic, where `expires_at - Time.now` yields seconds).
      call.expiresIn = (expiresAt - Date.now()) / 1000;
      delete call.expiresAt;
    }

    // boundary: mirrors cache.rb:871–874 — raises when expires_in is accidentally a Time/Date object.
    if (call.expiresIn instanceof Date) {
      throw new ArgumentError(
        `expires_in parameter should not be a Date. Did you mean to use expiresAt? Got: ${call.expiresIn}`,
      );
    }

    if (call.expiresIn != null && (call.expiresIn as number) < 0) {
      const expiresIn = call.expiresIn;
      delete call.expiresIn;
      Store.handleInvalidExpiresIn(
        `Cache expiration time is invalid, cannot be negative: ${expiresIn}`,
      );
    }

    return { ...this.options, ...call };
  }

  /** Mirrors Rails `Cache::Store#normalize_options` (cache.rb:905–911). */
  static normalizeOptions(options: StoreOptions): StoreOptions {
    const opts = { ...options };
    // OPTION_ALIASES = { expires_in: [:expire_in, :expired_in] }
    // Alias is only applied if the canonical key is not already present (mirrors ||=).
    const aliasKey =
      opts.expire_in != null ? "expire_in" : opts.expired_in != null ? "expired_in" : null;
    if (aliasKey != null) {
      if (opts.expiresIn == null) opts.expiresIn = opts[aliasKey];
      delete opts.expire_in;
      delete opts.expired_in;
    }
    return opts;
  }

  /** Mirrors Rails `Cache::Store#validate_options` (cache.rb:912-925). */
  private validateOptions(options: StoreOptions): StoreOptions {
    if ("coder" in options && options.serializer) {
      throw new ArgumentError("Cannot specify :serializer and :coder options together");
    }

    if ("coder" in options && options.compressor) {
      throw new ArgumentError("Cannot specify :compressor and :coder options together");
    }

    if (getFormatVersion() < 7.1 && !options.serializer && options.compressor) {
      throw new ArgumentError(
        "Cannot specify :compressor option when using" +
          " default serializer and cache format version is < 7.1",
      );
    }

    return options;
  }

  /** Mirrors Rails `Cache::Store#handle_invalid_expires_in` (cache.rb:892–898). */
  static handleInvalidExpiresIn(message: string): void {
    const error = new ArgumentError(message);
    if (Store.raiseOnInvalidCacheExpirationTime) {
      throw error;
    }
    Store.logger?.error?.(`${error.name}: ${error.message}`);
  }

  protected normalizeKey(key: unknown, options?: StoreOptions): string {
    const strKey = this.expandedKey(key);
    if (!strKey) throw new ArgumentError("key cannot be blank");
    return this.namespaceKey(strKey, options);
  }

  /**
   * Mirrors Rails `Cache::Store#key_matcher` (cache.rb): when a namespace is
   * configured, prefixes it into the regex source so a namespaced store scopes
   * `delete_matched` to its own keys. A `^`-anchored source has the anchor moved
   * in front of the prefix; an unanchored source is matched anywhere after the
   * prefix (`.*`).
   */
  protected keyMatcher(pattern: RegExp, options?: StoreOptions): RegExp {
    // Same per-call override semantics as namespaceKey below: Rails'
    // key_matcher reads options[:namespace] from the merged options with no
    // store-level fallback (cache.rb:779-790), so an explicit nil wins.
    const ns = options && "namespace" in options ? options.namespace : this.options.namespace;
    const prefix = typeof ns === "function" ? (ns as () => string)() : (ns as string | undefined);
    if (prefix) {
      let source = pattern.source;
      source = source.startsWith("^") ? source.slice(1) : `.*${source}`;
      return new RegExp(`^${escapeRegExp(prefix)}:${source}`, pattern.flags);
    }
    return pattern;
  }

  /** Mirrors Rails `Cache::Store#namespace_key` (cache.rb:948-968): a per-call
   * `:namespace` key wins even when its value is nil (`call_options&.key?`,
   * not a nil-coalescing fallback), and callable namespaces are invoked.
   * Rails' UTF-8 re-encoding of the key has no JS analogue. */
  protected namespaceKey(key: string, callOptions?: StoreOptions): string {
    let ns =
      callOptions && "namespace" in callOptions ? callOptions.namespace : this.options.namespace;
    if (typeof ns === "function") {
      ns = (ns as () => string)();
    }
    const namespace = ns as string | null | undefined;
    return namespace ? `${namespace}:${key}` : key;
  }

  protected expandedKey(key: unknown): string {
    if (key != null && typeof key === "object") {
      if ("cacheKey" in key) return String((key as { cacheKey(): string }).cacheKey());
      if (Array.isArray(key)) return key.map((element) => this.expandedKey(element)).join("/");
      return Object.entries(key as Record<string, unknown>)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join("/");
    }
    return String(key ?? "");
  }

  /** Mirrors Rails `Cache::Store#normalize_version` (cache.rb:989-991). */
  protected normalizeVersion(key: unknown, options?: StoreOptions): string | undefined {
    // Ruby's `||` falls through on nil AND false, so a `to_param` that answers
    // false takes `expanded_version`, where `??` alone would keep "false".
    const version = options?.version != null ? toParam(options.version) : null;
    if (version != null && version !== false) return String(version);
    return this.expandedVersion(key);
  }

  /**
   * Mirrors Rails `Cache::Store#expanded_version` (cache.rb:994-1000): the
   * version an object carries with it, so a stale entry is detected without the
   * caller passing `:version`. Ruby's `case` with no matching `when` returns
   * nil, so a key that answers neither `cache_version` nor `to_a` is versionless.
   */
  protected expandedVersion(key: unknown): string | undefined {
    if (key != null && typeof key === "object") {
      if (typeof (key as { cacheVersion?: () => unknown }).cacheVersion === "function") {
        const version = toParam((key as { cacheVersion(): unknown }).cacheVersion());
        return version == null ? undefined : String(version);
      }
      if (Array.isArray(key)) {
        const versions = key
          .map((element) => this.expandedVersion(element))
          .filter((version) => version != null);
        const param = toParam(versions);
        return param == null ? undefined : String(param);
      }
      if (Symbol.iterator in key) {
        return this.expandedVersion([...(key as Iterable<unknown>)]);
      }
    }
    return undefined;
  }

  /**
   * Mirrors Rails `Cache::Store#handle_expired_entry` (cache.rb). When a
   * positive `race_condition_ttl` is set, a stale entry is bumped back into the
   * cache for a brief window (so concurrent readers get the stale value) while
   * the caller recalculates; otherwise the expired entry is deleted. Rails
   * `race_condition_ttl` is in seconds, our `expiresAt` is in epoch-ms.
   */
  protected handleExpiredEntry(
    entry: Entry | null,
    key: string,
    options: StoreOptions,
  ): Entry | null {
    if (entry && entry.isExpired()) {
      const raceTtl = typeof options.raceConditionTtl === "number" ? options.raceConditionTtl : 0;
      if (raceTtl > 0 && Date.now() - (entry.expiresAt ?? 0) <= raceTtl * 1000) {
        entry.expiresAt = Date.now() + raceTtl * 1000;
        this.writeEntry(key, entry, { ...options, expiresIn: raceTtl * 2 });
      } else {
        this.deleteEntry(key, options);
      }
      return null;
    }
    return entry;
  }

  protected getEntryValue(entry: Entry, name: string, options: StoreOptions): unknown {
    this.instrument("fetch_hit", name, options);
    return entry.value;
  }

  protected saveBlockResultToCache(
    name: string,
    key: string,
    options: StoreOptions,
    block: (key: string, opts: WriteOptions) => unknown,
  ): unknown {
    options = { ...options };
    const result = this.instrument("generate", key, options, () =>
      block(name, new WriteOptions(options)),
    );
    if (result != null || !options.skipNil) this.write(name, result, options);
    return result;
  }
}
