import { Time } from "@blazetrails/date";
import { Entry } from "./entry.js";
import type { Duration } from "../duration.js";
import {
  ArgumentError,
  NotImplementedError,
  TypeError,
  kernelFloat,
  kernelInteger,
  rbInspect,
  regexpEscape,
} from "@blazetrails/ruby-compat";
import { Coder, type CoderCompressor, type CoderSerializer } from "./coder.js";
import { SerializerWithFallback, type Serializer } from "./serializer-with-fallback.js";
import { deflate, inflate } from "../gzip.js";
import { DeserializationError } from "./deserialization-error.js";
import { Notifications } from "../notifications.js";
import { toParam } from "../hash-utils.js";
import { currentErrorReporter } from "../error-reporter.js";
import { cattrAccessor } from "../module-ext.js";
import type { EventPayload } from "../notifications/instrumenter.js";
import { isEmpty } from "@blazetrails/ruby-compat";

let _formatVersion = 7.0;

export function formatVersion(): number {
  return _formatVersion;
}

export function setFormatVersion(value: number): void {
  _formatVersion = value;
}

const DEFAULT_COMPRESS_LIMIT = 1024;

const DEFAULT_POOL_OPTIONS: StoreOptions = { size: 5, timeout: 5 };

const Zlib: CoderCompressor = { deflate, inflate };

export { ArgumentError };

export { NotImplementedError };

/** @internal */
export interface CacheLogger {
  warn(message: string): void;
  error?(message: string): void;
  debug?(message: string): void;
  isDebug?(): boolean;
}

export type StoreOptions = Record<string, unknown>;

/** @noRailsEquivalent PERMANENT */
export interface CacheCoder {
  dump(entry: Entry): unknown;
  load(payload: unknown): unknown;
  dumpCompressed?(entry: Entry, threshold: number): unknown;
}

function extractOptions(args: unknown[]): StoreOptions | undefined {
  const last = args[args.length - 1];
  if (last != null && typeof last === "object" && !Array.isArray(last)) {
    return args.pop() as StoreOptions;
  }
  return undefined;
}

/** @internal */
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

/** @internal */
export abstract class Store {
  declare static logger: CacheLogger | null | undefined;
  declare logger: CacheLogger | null | undefined;
  declare static raiseOnInvalidCacheExpirationTime: boolean;

  static {
    cattrAccessor.call(this, "logger", { instanceWriter: true });
    cattrAccessor.call(this, "raiseOnInvalidCacheExpirationTime", { default: false });
  }

  static with<T>(options: { logger: CacheLogger }, fn: () => T): T {
    const prev = Store.logger;
    Store.logger = options.logger;
    try {
      return fn();
    } finally {
      Store.logger = prev;
    }
  }

  static retrievePoolOptions(options: StoreOptions): StoreOptions | false | undefined {
    let poolOptions: StoreOptions | boolean | null | undefined;
    if ("pool" in options) {
      poolOptions = options["pool"] as StoreOptions | boolean | null | undefined;
      delete options["pool"];
    } else {
      poolOptions = true;
    }

    if (poolOptions === false || poolOptions == null) {
      return false;
    } else if (poolOptions === true) {
      poolOptions = DEFAULT_POOL_OPTIONS;
    } else if (typeof poolOptions === "object" && !Array.isArray(poolOptions)) {
      if ("size" in poolOptions) poolOptions["size"] = kernelInteger(poolOptions["size"]);
      if ("timeout" in poolOptions) poolOptions["timeout"] = kernelFloat(poolOptions["timeout"]);
      poolOptions = { ...DEFAULT_POOL_OPTIONS, ...poolOptions };
    } else {
      throw new TypeError(`Invalid :pool argument, expected Hash, got: ${rbInspect(poolOptions)}`);
    }

    return Object.keys(poolOptions).length > 0 ? poolOptions : undefined;
  }

  silence = false;
  options: StoreOptions;

  protected coder: CacheCoder;
  protected coderSupportsCompression: boolean;

  /** @missingRailsCall delete — PERMANENT */
  constructor(options?: StoreOptions) {
    this.options = options ? this.validateOptions(Store.normalizeOptions({ ...options })) : {};

    if (!("compress" in this.options)) this.options.compress = true;
    if (this.options.compressThreshold == null || this.options.compressThreshold === false) {
      this.options.compressThreshold = DEFAULT_COMPRESS_LIMIT;
    }

    const hadCoder = "coder" in this.options;
    let coder = this.options.coder as CacheCoder | null | undefined;
    delete this.options.coder;
    if (!hadCoder) {
      const legacySerializer = formatVersion() < 7.1 && !this.options.serializer;
      let serializer = this.options.serializer as Serializer | string | undefined;
      delete this.options.serializer;
      serializer ||= this.defaultSerializer();
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

  async mute<T>(block: () => T | Promise<T>): Promise<T> {
    const prev = this.silence;
    this.silence = true;
    try {
      return await block();
    } finally {
      this.silence = prev;
    }
  }

  fetch(
    name: string,
    options?: StoreOptions,
    block?: (key: string, opts: WriteOptions) => unknown,
  ): Promise<unknown>;
  fetch(name: string, block: (key: string, opts: WriteOptions) => unknown): Promise<unknown>;
  async fetch(
    name: string,
    optionsOrBlock?: StoreOptions | ((key: string, opts: WriteOptions) => unknown),
    maybeBlock?: (key: string, opts: WriteOptions) => unknown,
  ): Promise<unknown> {
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
        await this.instrument("read", key, options, async (payload) => {
          const cachedEntry = await this.readEntry(key, options!);
          entry = await this.handleExpiredEntry(cachedEntry, key, options!);
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
      return await this.saveBlockResultToCache(name, key, options, block);
    } else if (options?.force) {
      throw new ArgumentError(
        "Missing block: Calling `Cache#fetch` with `force: true` requires a block.",
      );
    } else {
      return await this.read(name, options);
    }
  }

  async read(name: unknown, options?: StoreOptions): Promise<unknown> {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = this.normalizeVersion(name, options);
    return await this.instrument("read", key, options, async (payload) => {
      const entry = await this.readEntry(key, options);
      if (!entry) {
        payload.hit = false;
        return null;
      }
      if (entry.isExpired()) {
        await this.deleteEntry(key, options);
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

  async readMulti(...names: unknown[]): Promise<Map<unknown, unknown>> {
    if (names.length === 0) return new Map();
    let options = extractOptions(names);
    options = this.mergedOptions(options);
    const keys = names.map((name) => this.normalizeKey(name, options));
    return await this.instrumentMulti("read_multi", keys, options, async (payload) => {
      const results = await this.readMultiEntries(names, options);
      payload.hits = [...results.keys()].map((name) => this.normalizeKey(name, options));
      return results;
    });
  }

  async writeMulti(
    hash: Map<unknown, unknown> | Record<string, unknown>,
    options?: StoreOptions,
  ): Promise<Map<unknown, unknown> | Record<string, unknown>> {
    const pairs = hash instanceof Map ? [...hash] : Object.entries(hash);
    if (pairs.length === 0) return hash;
    options = this.mergedOptions(options);
    const normalizedHash: Record<string, unknown> = {};
    for (const [key, value] of pairs) {
      normalizedHash[this.normalizeKey(key, options)] = value;
    }
    return await this.instrumentMulti("write_multi", normalizedHash, options, () => {
      const entries: Record<string, Entry> = {};
      for (const [name, value] of pairs) {
        entries[this.normalizeKey(name, options)] = new Entry(value, {
          expiresIn: (options.expiresIn as number | Duration | undefined) ?? null,
          version: this.normalizeVersion(name, options) ?? undefined,
        });
      }
      return this.writeMultiEntries(entries, options);
    });
  }

  async fetchMulti(
    ...names:
      | [...NonNullable<unknown>[], StoreOptions, (key: unknown) => unknown]
      | [...NonNullable<unknown>[], (key: unknown) => unknown]
  ): Promise<Map<unknown, unknown>> {
    const block = (names as unknown[]).pop() as ((key: unknown) => unknown) | undefined;
    if (typeof block !== "function")
      throw new ArgumentError("Missing block: `Cache#fetch_multi` requires a block.");
    if (names.length === 0) return new Map();
    let options = extractOptions(names as unknown[]);
    options = this.mergedOptions(options);
    const keys = (names as unknown[]).map((name) => this.normalizeKey(name, options));
    const writes = new Map<unknown, unknown>();
    const ordered = await this.instrumentMulti("read_multi", keys, options, async (payload) => {
      const reads = options.force
        ? new Map<unknown, unknown>()
        : await this.readMultiEntries(names, options);
      const result = new Map<unknown, unknown>();
      for (const name of names) {
        if (!reads.has(name)) writes.set(name, await block(name));
        result.set(name, reads.has(name) ? reads.get(name) : writes.get(name));
      }
      if (options.skipNil) {
        for (const [k, v] of writes) {
          if (v == null) writes.delete(k);
        }
      }
      payload.hits = [...reads.keys()].map((name) => this.normalizeKey(name, options));
      payload.super_operation = "fetch_multi";
      return result;
    });
    await this.writeMulti(writes, options);
    return ordered;
  }

  async write(name: unknown, value: unknown, options?: StoreOptions): Promise<boolean> {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return await this.instrument("write", key, options, () =>
      this.writeEntry(
        key,
        new Entry(value, {
          expiresIn: (options.expiresIn as number | Duration | undefined) ?? null,
          version: this.normalizeVersion(name, options) ?? undefined,
        }),
        options,
      ),
    );
  }

  async delete(name: unknown, options?: StoreOptions): Promise<boolean> {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return await this.instrument("delete", key, options, () => this.deleteEntry(key, options));
  }

  async deleteMulti(names: string[], options?: StoreOptions): Promise<number> {
    if (names.length === 0) return 0;
    options = this.mergedOptions(options);
    names = names.map((key) => this.normalizeKey(key, options));
    return await this.instrumentMulti("delete_multi", names, options, () =>
      this.deleteMultiEntries(names, options),
    );
  }

  async exist(name: unknown, options?: StoreOptions): Promise<boolean> {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return await this.instrument("exist?", key, undefined, async () => {
      const entry = await this.readEntry(key, options);
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
      expiresIn: (options.expiresIn as number | Duration | undefined) ?? null,
      version: options.version != null ? String(options.version) : undefined,
    });
  }

  async deleteMatched(_matcher: unknown, _options?: StoreOptions): Promise<void> {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support delete_matched`);
  }

  async increment(_name: string, _amount = 1, _options?: StoreOptions): Promise<number | null> {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support increment`);
  }

  async decrement(_name: string, _amount = 1, _options?: StoreOptions): Promise<number | null> {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support decrement`);
  }

  async cleanup(_options?: StoreOptions): Promise<void> {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support cleanup`);
  }

  async clear(_options?: StoreOptions): Promise<void> {
    // @nie disposition=keep-as-strategy-hook
    throw new NotImplementedError(`${this.constructor.name} does not support clear`);
  }

  protected instrument<T>(
    operation: string,
    key: unknown,
    options?: StoreOptions,
    block?: (payload: EventPayload) => T,
  ): T {
    return this._instrument(operation, false, options, { key }, block);
  }

  protected instrumentMulti<T>(
    operation: string,
    keys: unknown,
    options?: StoreOptions,
    block?: (payload: EventPayload) => T,
  ): T {
    return this._instrument(operation, true, options, { key: keys }, block);
  }

  private _instrument<T>(
    operation: string,
    multi: boolean,
    options: StoreOptions | undefined,
    payload: EventPayload,
    block?: (payload: EventPayload) => T,
  ): T {
    if (this.logger?.isDebug?.() && !this.silence) {
      const key = payload.key;
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
      this.logger.debug?.(`Cache ${operation}${debugKey}${debugOptions}`);
    }
    payload.store = this.constructor.name;
    if (options) Object.assign(payload, options);
    return Notifications.instrument<T>(`cache_${operation}.active_support`, payload, () =>
      block ? block(payload) : (undefined as T),
    ) as T;
  }

  private defaultSerializer(): Serializer {
    switch (formatVersion()) {
      case 7.0:
        return SerializerWithFallback.get("marshal_7_0");
      case 7.1:
        return SerializerWithFallback.get("marshal_7_1");
      default:
        throw new ArgumentError(
          `Unrecognized ActiveSupport::Cache.format_version: ${rbInspect(formatVersion())}`,
        );
    }
  }

  protected abstract readEntry(key: string, options: StoreOptions): Promise<Entry | null>;
  protected abstract writeEntry(key: string, entry: Entry, options: StoreOptions): Promise<boolean>;
  protected abstract deleteEntry(key: string, options: StoreOptions): Promise<boolean>;

  protected serializeEntry(entry: Entry, options?: StoreOptions): unknown {
    options = this.mergedOptions(options);
    if (this.coderSupportsCompression && options.compress) {
      return this.coder.dumpCompressed!(entry, options.compressThreshold as number);
    } else {
      return this.coder.dump(entry);
    }
  }

  protected deserializeEntry(payload: unknown): Entry | null {
    if (payload == null) return null;
    try {
      return this.coder.load(payload) as Entry;
    } catch (error) {
      if (error instanceof DeserializationError) return null;
      throw error;
    }
  }

  protected async readMultiEntries(
    names: unknown[],
    options: StoreOptions,
  ): Promise<Map<unknown, unknown>> {
    const results = new Map<unknown, unknown>();
    for (const name of names) {
      const key = this.normalizeKey(name, options);
      const entry = await this.readEntry(key, options);
      if (!entry) continue;

      const version = this.normalizeVersion(name, options) ?? null;

      if (entry.isExpired()) {
        await this.deleteEntry(key, options);
      } else if (!entry.isMismatched(version)) {
        results.set(name, entry.value);
      }
    }
    return results;
  }

  protected async writeMultiEntries(
    hash: Record<string, Entry>,
    options: StoreOptions,
  ): Promise<Record<string, Entry>> {
    for (const [key, entry] of Object.entries(hash)) await this.writeEntry(key, entry, options);
    return hash;
  }

  protected async deleteMultiEntries(entries: string[], options: StoreOptions): Promise<number> {
    let count = 0;
    for (const key of entries) if (await this.deleteEntry(key, options)) count++;
    return count;
  }

  protected mergedOptions(callOptions?: StoreOptions): StoreOptions {
    if (!callOptions) return this.options;

    callOptions = Store.normalizeOptions({ ...callOptions });

    if (callOptions.expiresIn != null && callOptions.expiresAt != null) {
      throw new ArgumentError("Either :expires_in or :expires_at can be supplied, but not both");
    }

    const expiresAt = callOptions.expiresAt as number | undefined;
    if (expiresAt != null) {
      callOptions.expiresIn = (expiresAt - Time.now().toF() * 1000) / 1000;
      delete callOptions.expiresAt;
    }

    // boundary: mirrors cache.rb:871–874 — raises when expires_in is accidentally a Time/Date object.
    if (callOptions.expiresIn instanceof Date) {
      throw new ArgumentError(
        `expires_in parameter should not be a Date. Did you mean to use expiresAt? Got: ${callOptions.expiresIn}`,
      );
    }

    if (callOptions.expiresIn != null && (callOptions.expiresIn as number) < 0) {
      const expiresIn = callOptions.expiresIn;
      delete callOptions.expiresIn;
      this.handleInvalidExpiresIn(
        `Cache expiration time is invalid, cannot be negative: ${expiresIn}`,
      );
    }

    if (isEmpty(this.options)) {
      return callOptions;
    } else {
      return { ...this.options, ...callOptions };
    }
  }

  static normalizeOptions(options: StoreOptions): StoreOptions {
    const opts = { ...options };
    const aliasKey =
      opts.expire_in != null ? "expire_in" : opts.expired_in != null ? "expired_in" : null;
    if (aliasKey != null) {
      if (opts.expiresIn == null) opts.expiresIn = opts[aliasKey];
      delete opts.expire_in;
      delete opts.expired_in;
    }
    return opts;
  }

  private validateOptions(options: StoreOptions): StoreOptions {
    if ("coder" in options && options.serializer) {
      throw new ArgumentError("Cannot specify :serializer and :coder options together");
    }

    if ("coder" in options && options.compressor) {
      throw new ArgumentError("Cannot specify :compressor and :coder options together");
    }

    if (formatVersion() < 7.1 && !options.serializer && options.compressor) {
      throw new ArgumentError(
        "Cannot specify :compressor option when using" +
          " default serializer and cache format version is < 7.1",
      );
    }

    return options;
  }

  /** @internal */
  private handleInvalidExpiresIn(message: string): void {
    const error = new ArgumentError(message);
    if (Store.raiseOnInvalidCacheExpirationTime) {
      throw error;
    } else {
      currentErrorReporter.report(error, { handled: true, severity: "warning" });
      this.logger?.error?.(`${error.name}: ${error.message}`);
    }
  }

  protected normalizeKey(key: unknown, options?: StoreOptions): string {
    const strKey = this.expandedKey(key);
    if (!strKey) throw new ArgumentError("key cannot be blank");
    return this.namespaceKey(strKey, options);
  }

  protected keyMatcher(pattern: RegExp, options?: StoreOptions): RegExp {
    const namespace =
      options && "namespace" in options ? options.namespace : this.options.namespace;
    const prefix =
      typeof namespace === "function"
        ? (namespace as () => string)()
        : (namespace as string | undefined);
    if (prefix) {
      let source = pattern.source;
      source = source.startsWith("^") ? source.slice(1) : `.*${source}`;
      return new RegExp(`^${regexpEscape(prefix)}:${source}`, pattern.flags);
    }
    return pattern;
  }

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
    if (key != null && typeof key === "object" && "cacheKey" in key)
      return String((key as { cacheKey(): string }).cacheKey());

    let expanded: unknown;
    if (Array.isArray(key)) {
      expanded =
        key.length > 1 ? key.map((element) => this.expandedKey(element)) : this.expandedKey(key[0]);
    } else if (key != null && typeof key === "object") {
      expanded = Object.entries(key as Record<string, unknown>)
        .map(([k, v]) => `${k}=${v}`)
        .sort();
    } else {
      expanded = key;
    }
    return String(toParam(expanded) ?? "");
  }

  /** @missingRailsCall try — PERMANENT */
  protected normalizeVersion(key: unknown, options?: StoreOptions): string | undefined {
    const version = options?.version != null ? toParam(options.version) : null;
    if (version != null && version !== false) return String(version);
    return this.expandedVersion(key);
  }

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

  protected async handleExpiredEntry(
    entry: Entry | null,
    key: string,
    options: StoreOptions,
  ): Promise<Entry | null> {
    if (entry && entry.isExpired()) {
      const raceTtl = typeof options.raceConditionTtl === "number" ? options.raceConditionTtl : 0;
      if (raceTtl > 0 && Time.now().toF() * 1000 - (entry.expiresAt ?? 0) <= raceTtl * 1000) {
        entry.expiresAt = Time.now().toF() * 1000 + raceTtl * 1000;
        await this.writeEntry(key, entry, { ...options, expiresIn: raceTtl * 2 });
      } else {
        await this.deleteEntry(key, options);
      }
      return null;
    }
    return entry;
  }

  protected getEntryValue(entry: Entry, name: string, options: StoreOptions): unknown {
    this.instrument("fetch_hit", name, options);
    return entry.value;
  }

  protected async saveBlockResultToCache(
    name: string,
    key: string,
    options: StoreOptions,
    block: (key: string, opts: WriteOptions) => unknown,
  ): Promise<unknown> {
    options = { ...options };
    const result = await this.instrument("generate", key, options, () =>
      block(name, new WriteOptions(options)),
    );
    if (result != null || !options.skipNil) await this.write(name, result, options);
    return result;
  }
}

/** @noRailsEquivalent PERMANENT */
export function inspectOptions(options: Record<string, unknown>): string {
  const pairs = Object.entries(options).map(([k, v]) => `:${k}=>${inspectValue(v)}`);
  return `{${pairs.join(", ")}}`;
}

function inspectValue(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inspectValue).join(", ")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto !== Object.prototype && proto !== null) {
      return `#<${(value.constructor as { name?: string } | undefined)?.name ?? "Object"}>`;
    }
    return inspectOptions(value as Record<string, unknown>);
  }
  return String(value);
}
