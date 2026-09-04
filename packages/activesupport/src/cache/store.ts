import { Entry } from "./entry.js";
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
import { getFormatVersion } from "./format-version-slot.js";
import { deflate, inflate } from "../gzip.js";
import { DeserializationError } from "./deserialization-error.js";
import { Notifications } from "../notifications.js";
import { toParam } from "../hash-utils.js";
import { currentErrorReporter } from "../error-reporter.js";
import type { EventPayload } from "../notifications/instrumenter.js";
import { isEmpty } from "@blazetrails/ruby-compat";

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
      if ("size" in hash) hash["size"] = kernelInteger(hash["size"]);
      if ("timeout" in hash) hash["timeout"] = kernelFloat(hash["timeout"]);
      poolOptions = { ...DEFAULT_POOL_OPTIONS, ...hash };
    } else {
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError(`Invalid :pool argument, expected Hash, got: ${rbInspect(poolOptions)}`);
    }

    const result = poolOptions as StoreOptions;
    return Object.keys(result).length > 0 ? result : undefined;
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
      const legacySerializer = getFormatVersion() < 7.1 && !this.options.serializer;
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

  mute<T>(block: () => T): T {
    const prev = this.silence;
    this.silence = true;
    try {
      return block();
    } finally {
      this.silence = prev;
    }
  }

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
    ...names:
      | [...string[], StoreOptions, (key: string) => unknown]
      | [...string[], (key: string) => unknown]
  ): Record<string, unknown> {
    const block = (names as unknown[]).pop() as ((key: string) => unknown) | undefined;
    if (typeof block !== "function")
      throw new ArgumentError("Missing block: `Cache#fetch_multi` requires a block.");
    if (names.length === 0) return {};
    let options = extractOptions(names as unknown[]);
    options = this.mergedOptions(options);
    const keys = (names as string[]).map((name) => this.normalizeKey(name, options));
    const writes: Record<string, unknown> = {};
    const ordered = this.instrumentMulti("read_multi", keys, options, (payload) => {
      const reads = options.force ? {} : this.readMultiEntries(names as string[], options);
      const result: Record<string, unknown> = {};
      for (const name of names as string[]) {
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
    if (Store.logger?.isDebug?.() && !this.silence) {
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
      Store.logger.debug?.(`Cache ${operation}${debugKey}${debugOptions}`);
    }
    payload.store = this.constructor.name;
    if (options) Object.assign(payload, options);
    return Notifications.instrument<T>(`cache_${operation}.active_support`, payload, () =>
      block ? block(payload) : (undefined as T),
    ) as T;
  }

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

  protected readMultiEntries(names: string[], options: StoreOptions): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    for (const name of names) {
      const key = this.normalizeKey(name, options);
      const entry = this.readEntry(key, options);
      if (!entry) continue;

      const version = this.normalizeVersion(name, options) ?? null;

      if (entry.isExpired()) {
        this.deleteEntry(key, options);
      } else if (!entry.isMismatched(version)) {
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

  protected deleteMultiEntries(entries: string[], options: StoreOptions): number {
    return entries.filter((key) => this.deleteEntry(key, options)).length;
  }

  /** @missingRailsCall merge — PERMANENT */
  protected mergedOptions(callOptions?: StoreOptions): StoreOptions {
    if (!callOptions) return this.options;

    const call = Store.normalizeOptions({ ...callOptions });

    if (call.expiresIn != null && call.expiresAt != null) {
      throw new ArgumentError("Either :expires_in or :expires_at can be supplied, but not both");
    }

    const expiresAt = call.expiresAt as number | undefined;
    if (expiresAt != null) {
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

    if (isEmpty(this.options)) {
      return call;
    } else {
      return { ...this.options, ...call };
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

    if (getFormatVersion() < 7.1 && !options.serializer && options.compressor) {
      throw new ArgumentError(
        "Cannot specify :compressor option when using" +
          " default serializer and cache format version is < 7.1",
      );
    }

    return options;
  }

  static handleInvalidExpiresIn(message: string): void {
    const error = new ArgumentError(message);
    if (Store.raiseOnInvalidCacheExpirationTime) {
      throw error;
    } else {
      currentErrorReporter.report(error, { handled: true, severity: "warning" });
      Store.logger?.error?.(`${error.name}: ${error.message}`);
    }
  }

  protected normalizeKey(key: unknown, options?: StoreOptions): string {
    const strKey = this.expandedKey(key);
    if (!strKey) throw new ArgumentError("key cannot be blank");
    return this.namespaceKey(strKey, options);
  }

  /** @missingRailsCall call — PERMANENT */
  protected keyMatcher(pattern: RegExp, options?: StoreOptions): RegExp {
    const ns = options && "namespace" in options ? options.namespace : this.options.namespace;
    const prefix = typeof ns === "function" ? (ns as () => string)() : (ns as string | undefined);
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
