import { Entry } from "./entry.js";
import { DeserializationError } from "./deserialization-error.js";

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

  fetch(name: string, options?: StoreOptions, block?: (key: string) => unknown): unknown;
  fetch(name: string, block: (key: string) => unknown): unknown;
  fetch(
    name: string,
    optionsOrBlock?: StoreOptions | ((key: string) => unknown),
    maybeBlock?: (key: string) => unknown,
  ): unknown {
    let opts: StoreOptions | undefined;
    let block: ((key: string) => unknown) | undefined;
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
    const entry = this.readEntry(key, merged);
    if (!entry) return null;
    if (entry.isExpired()) {
      this.deleteEntry(key, merged);
      return null;
    }
    if (entry.isMismatched(version ?? null)) return null;
    try {
      return entry.value;
    } catch (e) {
      if (e instanceof DeserializationError) return null;
      throw e;
    }
  }

  readMulti(...names: string[]): Record<string, unknown> {
    if (names.length === 0) return {};
    return this.readMultiEntries(names, this.mergedOptions(undefined));
  }

  writeMulti(hash: Record<string, unknown>, options?: StoreOptions): Record<string, unknown> {
    if (Object.keys(hash).length === 0) return hash;
    const merged = this.mergedOptions(options);
    const entries: Record<string, Entry> = {};
    for (const [name, value] of Object.entries(hash)) {
      entries[this.normalizeKey(name, merged)] = new Entry(value, {
        expiresIn: typeof merged.expiresIn === "number" ? merged.expiresIn : null,
        version: this.normalizeVersion(name, merged) ?? undefined,
      });
    }
    this.writeMultiEntries(entries, merged);
    return hash;
  }

  fetchMulti(...namesAndBlock: [...string[], (key: string) => unknown]): Record<string, unknown> {
    const block = namesAndBlock.pop() as (key: string) => unknown;
    const names = namesAndBlock as string[];
    if (names.length === 0) return {};
    const merged = this.mergedOptions(undefined);
    const reads = merged.force ? {} : this.readMultiEntries(names, merged);
    const writes: Record<string, unknown> = {};
    const ordered: Record<string, unknown> = {};
    for (const name of names) {
      ordered[name] = Object.prototype.hasOwnProperty.call(reads, name)
        ? reads[name]
        : (writes[name] = block(name));
    }
    if (merged.skipNil) {
      for (const k of Object.keys(writes)) {
        if (writes[k] == null) delete writes[k];
      }
    }
    this.writeMulti(writes, merged);
    return ordered;
  }

  write(name: string, value: unknown, options?: StoreOptions): boolean {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    return this.writeEntry(
      key,
      new Entry(value, {
        expiresIn: typeof merged.expiresIn === "number" ? merged.expiresIn : null,
        version: this.normalizeVersion(name, merged) ?? undefined,
      }),
      merged,
    );
  }

  delete(name: string, options?: StoreOptions): boolean {
    const merged = this.mergedOptions(options);
    return this.deleteEntry(this.normalizeKey(name, merged), merged);
  }

  deleteMulti(names: string[], options?: StoreOptions): number {
    if (names.length === 0) return 0;
    const merged = this.mergedOptions(options);
    return this.deleteMultiEntries(
      names.map((n) => this.normalizeKey(n, merged)),
      merged,
    );
  }

  exist(name: string, options?: StoreOptions): boolean {
    const merged = this.mergedOptions(options);
    const key = this.normalizeKey(name, merged);
    const entry = this.readEntry(key, merged);
    return !!(
      entry &&
      !entry.isExpired() &&
      !entry.isMismatched(this.normalizeVersion(name, merged) ?? null)
    );
  }

  newEntry(value: unknown, options?: StoreOptions): Entry {
    return new Entry(value, {
      expiresIn: typeof options?.expiresIn === "number" ? options.expiresIn : null,
    });
  }

  deleteMatched(_matcher: unknown, _options?: StoreOptions): void {
    // @nie disposition=TODO
    throw new NotImplementedError(`${this.constructor.name} does not support delete_matched`);
  }

  increment(_name: string, _amount = 1, _options?: StoreOptions): number | null {
    // @nie disposition=TODO
    throw new NotImplementedError(`${this.constructor.name} does not support increment`);
  }

  decrement(_name: string, _amount = 1, _options?: StoreOptions): number | null {
    // @nie disposition=TODO
    throw new NotImplementedError(`${this.constructor.name} does not support decrement`);
  }

  cleanup(_options?: StoreOptions): void {
    // @nie disposition=TODO
    throw new NotImplementedError(`${this.constructor.name} does not support cleanup`);
  }

  clear(_options?: StoreOptions): void {
    // @nie disposition=TODO
    throw new NotImplementedError(`${this.constructor.name} does not support clear`);
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

  protected writeMultiEntries(hash: Record<string, Entry>, options: StoreOptions): void {
    for (const [key, entry] of Object.entries(hash)) this.writeEntry(key, entry, options);
  }

  protected deleteMultiEntries(keys: string[], options: StoreOptions): number {
    return keys.filter((k) => this.deleteEntry(k, options)).length;
  }

  protected mergedOptions(callOptions?: StoreOptions): StoreOptions {
    return callOptions ? { ...this.options, ...callOptions } : this.options;
  }

  protected normalizeKey(key: string, options?: StoreOptions): string {
    return this.namespaceKey(String(key), options);
  }

  protected namespaceKey(key: string, options?: StoreOptions): string {
    const ns = options?.namespace ?? this.options.namespace;
    const namespace =
      typeof ns === "function" ? (ns as () => string)() : (ns as string | undefined);
    return namespace ? `${namespace}:${key}` : key;
  }

  protected expandedKey(key: unknown): string {
    if (key && typeof key === "object" && "cacheKey" in key) {
      return String((key as { cacheKey: () => string }).cacheKey());
    }
    return Array.isArray(key) ? key.map((k) => this.expandedKey(k)).join("/") : String(key);
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

  protected getEntryValue(entry: Entry, _name: string, _options: StoreOptions): unknown {
    return entry.value;
  }

  protected saveBlockResultToCache(
    name: string,
    _key: string,
    options: StoreOptions,
    block: (key: string) => unknown,
  ): unknown {
    const result = block(name);
    if (result != null || !options.skipNil) this.write(name, result, options);
    return result;
  }
}
