import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";
import { Notifications } from "../notifications.js";
import type { EventPayload } from "../notifications/instrumenter.js";

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

  silence = false;
  options: StoreOptions;

  constructor(options: StoreOptions = {}) {
    this.options = { ...options };
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
    let opts: StoreOptions | undefined;
    let block: ((key: string, opts: WriteOptions) => unknown) | undefined;
    if (typeof optionsOrBlock === "function") {
      block = optionsOrBlock;
    } else {
      opts = optionsOrBlock;
      block = maybeBlock;
    }

    if (block) {
      const merged = this.mergedOptions(opts);
      const key = this.normalizeKey(name, merged);
      let entry: Entry | null = null;
      if (!merged.force) {
        this.instrument("read", key, merged, (payload) => {
          const cached = this.readEntry(key, merged);
          entry = this.handleExpiredEntry(cached, key, merged);
          if (entry) {
            if (entry.isMismatched(this.normalizeVersion(name, merged) ?? null)) {
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
      if (entry) return this.getEntryValue(entry, name, merged);
      return this.saveBlockResultToCache(name, key, merged, block);
    } else if (opts?.force) {
      throw new ArgumentError(
        "Missing block: Calling `Cache#fetch` with `force: true` requires a block.",
      );
    } else {
      return this.read(name, opts);
    }
  }

  read(name: string, options?: StoreOptions): unknown {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    const version = this.normalizeVersion(name, merged);
    return this.instrument("read", key, merged, (payload) => {
      const entry = this.readEntry(key, merged);
      if (!entry) {
        payload.hit = false;
        return null;
      }
      if (entry.isExpired()) {
        this.deleteEntry(key, merged);
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
    const options = extractOptions(names as unknown[]);
    const nameList = names as string[];
    const merged = this.mergedOptions(options);
    const keys = nameList.map((n) => this.normalizeKey(n, merged));
    return this.instrumentMulti("read_multi", keys, merged, (payload) => {
      const results = this.readMultiEntries(nameList, merged);
      payload.hits = Object.keys(results).map((n) => this.normalizeKey(n, merged));
      return results;
    });
  }

  writeMulti(hash: Record<string, unknown>, options?: StoreOptions): Record<string, unknown> {
    if (Object.keys(hash).length === 0) return hash;
    const merged = this.mergedOptions(options);
    const normalizedHash: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(hash)) {
      normalizedHash[this.normalizeKey(name, merged)] = value;
    }
    return this.instrumentMulti("write_multi", normalizedHash, merged, () => {
      const entries: Record<string, Entry> = {};
      for (const [name, value] of Object.entries(hash)) {
        entries[this.normalizeKey(name, merged)] = new Entry(value, {
          expiresIn: typeof merged.expiresIn === "number" ? merged.expiresIn : null,
          version: this.normalizeVersion(name, merged) ?? undefined,
        });
      }
      return this.writeMultiEntries(entries, merged);
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
    const options = extractOptions(namesAndBlock as unknown[]);
    const names = namesAndBlock as string[];
    if (names.length === 0) return {};
    const merged = this.mergedOptions(options);
    const keys = names.map((n) => this.normalizeKey(n, merged));
    const writes: Record<string, unknown> = {};
    const ordered = this.instrumentMulti("read_multi", keys, merged, (payload) => {
      const reads = merged.force ? {} : this.readMultiEntries(names, merged);
      const result: Record<string, unknown> = {};
      for (const name of names) {
        result[name] = Object.prototype.hasOwnProperty.call(reads, name)
          ? reads[name]
          : (writes[name] = block(name));
      }
      if (merged.skipNil) {
        for (const k of Object.keys(writes)) {
          if (writes[k] == null) delete writes[k];
        }
      }
      payload.hits = Object.keys(reads).map((n) => this.normalizeKey(n, merged));
      payload.super_operation = "fetch_multi";
      return result;
    });
    this.writeMulti(writes, merged);
    return ordered;
  }

  write(name: string, value: unknown, options?: StoreOptions): boolean {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    return this.instrument("write", key, merged, () =>
      this.writeEntry(
        key,
        new Entry(value, {
          expiresIn: typeof merged.expiresIn === "number" ? merged.expiresIn : null,
          version: this.normalizeVersion(name, merged) ?? undefined,
        }),
        merged,
      ),
    );
  }

  delete(name: string, options?: StoreOptions): boolean {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    return this.instrument("delete", key, merged, () => this.deleteEntry(key, merged));
  }

  deleteMulti(names: string[], options?: StoreOptions): number {
    if (names.length === 0) return 0;
    const merged = this.mergedOptions(options);
    const keys = names.map((n) => this.normalizeKey(n, merged));
    return this.instrumentMulti("delete_multi", keys, merged, () =>
      this.deleteMultiEntries(keys, merged),
    );
  }

  exist(name: string, options?: StoreOptions): boolean {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    return this.instrument("exist?", key, undefined, () => {
      const entry = this.readEntry(key, merged);
      return !!(
        entry &&
        !entry.isExpired() &&
        !entry.isMismatched(this.normalizeVersion(name, merged) ?? null)
      );
    });
  }

  newEntry(value: unknown, options?: StoreOptions): Entry {
    const merged = this.mergedOptions(options);
    return new Entry(value, {
      expiresIn: typeof merged.expiresIn === "number" ? merged.expiresIn : null,
      version: merged.version != null ? String(merged.version) : undefined,
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

  protected abstract readEntry(key: string, options: StoreOptions): Entry | null;
  protected abstract writeEntry(key: string, entry: Entry, options: StoreOptions): boolean;
  protected abstract deleteEntry(key: string, options: StoreOptions): boolean;

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
      call.expiresIn = expiresAt - Date.now();
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

  /** Mirrors Rails `Cache::Store#handle_invalid_expires_in` (cache.rb:892–898). */
  static handleInvalidExpiresIn(message: string): void {
    const error = new ArgumentError(message);
    if (Store.raiseOnInvalidCacheExpirationTime) {
      throw error;
    }
    Store.logger?.error?.(`${error.name}: ${error.message}`);
  }

  protected normalizeKey(key: unknown, options?: StoreOptions): string {
    const str = this.expandedKey(key);
    if (!str) throw new ArgumentError("key cannot be blank");
    return this.namespaceKey(str, options);
  }

  protected namespaceKey(key: string, options?: StoreOptions): string {
    const ns = options?.namespace ?? this.options.namespace;
    const namespace =
      typeof ns === "function" ? (ns as () => string)() : (ns as string | undefined);
    return namespace ? `${namespace}:${key}` : key;
  }

  protected expandedKey(key: unknown): string {
    if (key != null && typeof key === "object") {
      if ("cacheKey" in key) return String((key as { cacheKey(): string }).cacheKey());
      if (Array.isArray(key)) return key.map((k) => this.expandedKey(k)).join("/");
      return Object.entries(key as Record<string, unknown>)
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join("/");
    }
    return String(key ?? "");
  }

  protected normalizeVersion(_key: string, options?: StoreOptions): string | undefined {
    return options?.version != null ? String(options.version) : undefined;
  }

  protected handleExpiredEntry(
    entry: Entry | null,
    key: string,
    options: StoreOptions,
  ): Entry | null {
    if (entry && entry.isExpired()) {
      this.deleteEntry(key, options);
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
    const mutableOptions = { ...options };
    const result = this.instrument("generate", key, mutableOptions, () =>
      block(name, new WriteOptions(mutableOptions)),
    );
    if (result != null || !options.skipNil) this.write(name, result, mutableOptions);
    return result;
  }
}
