import { ArgumentError, hashDelete, rbInspect, rtest } from "@blazetrails/ruby-compat";

import { Entry } from "./entry.js";
import { Store, UNIVERSAL_OPTIONS, inspectOptions, type StoreOptions } from "./store.js";
import { registerStoreClass } from "./store-registry.js";
import { DeserializationError } from "./deserialization-error.js";
import { TopLevel } from "../namespaces.js";
import { Digest } from "../digest.js";
import { currentErrorReporter } from "../error-reporter.js";
import { extractOptionsBang } from "../hash-utils.js";

type MemCache = ReturnType<NonNullable<typeof TopLevel.Dalli>["Client"]["new"]>;

const UTF8 = new TextEncoder();

const NilClass = null;

export class MemCacheStore extends Store {
  static readonly OVERRIDDEN_OPTIONS = UNIVERSAL_OPTIONS;

  static supportsCacheVersioning(): boolean {
    return true;
  }

  static readonly KEY_MAX_SIZE = 250;
  // eslint-disable-next-line no-control-regex
  static readonly ESCAPE_KEY_CHARS = /[\x00-\x20%\x7F-\xFF]/g;

  /** @missingRailsCall new — CONVERGEABLE call-gate-credits-ruby-new-only-as-constructor */
  static buildMemCache(...addresses: unknown[]): MemCache {
    addresses = addresses.flat(Infinity);
    const options = extractOptionsBang(addresses) as StoreOptions;
    if (addresses.filter((a) => a != null).length === 0) addresses = null as never;
    const poolOptions = this.retrievePoolOptions(options);

    if (poolOptions) {
      return TopLevel.ConnectionPool!.new(poolOptions, () =>
        TopLevel.Dalli!.Client.new(addresses as string[] | null, { ...options, threadsafe: false }),
      ) as unknown as MemCache;
    } else {
      return TopLevel.Dalli!.Client.new(addresses as string[] | null, options);
    }
  }

  private data: MemCache;
  private memCacheOptions: StoreOptions;

  constructor(...addresses: unknown[]) {
    addresses = addresses.flat(Infinity);
    const options = extractOptionsBang(addresses) as StoreOptions;
    if ("cacheNils" in options) {
      options.skipNil = !rtest(hashDelete(options, "cacheNils"));
    }
    super(options);

    const first = addresses[0] as object | null | undefined;
    const klass = typeof first === "string" ? String : first == null ? NilClass : first.constructor;
    if (![String, TopLevel.Dalli!.Client, NilClass].includes(klass as never)) {
      throw new ArgumentError(
        "First argument must be an empty array, address, or array of addresses.",
      );
    }

    this.memCacheOptions = { ...options };
    this.memCacheOptions.compress = false;
    for (const name of MemCacheStore.OVERRIDDEN_OPTIONS.filter((n) => n !== "compress")) {
      hashDelete(this.memCacheOptions, name);
    }
    this.data = MemCacheStore.buildMemCache(...[...addresses, this.memCacheOptions]);
  }

  inspect(): string {
    const instance = this.data || this.memCacheOptions;
    return `#<${this.constructor.name} options=${inspectOptions(this.options)} mem_cache=${rbInspect(instance)}>`;
  }

  override increment(name: string, amount = 1, options?: StoreOptions): number | null {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);

    return this.instrument("increment", key, { amount }, () =>
      this.rescueErrorWith(null, () =>
        this.data.with((c) => c.incr(key, amount, options.expiresIn, amount)),
      ),
    );
  }

  override decrement(name: string, amount = 1, options?: StoreOptions): number | null {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);

    return this.instrument("decrement", key, { amount }, () =>
      this.rescueErrorWith(null, () =>
        this.data.with((c) => c.decr(key, amount, options.expiresIn, 0)),
      ),
    );
  }

  override clear(_options?: StoreOptions): void {
    this.rescueErrorWith(null, () => this.data.with((c) => c.flushAll()));
  }

  stats(): unknown {
    return this.data.with((c) => c.stats());
  }

  /** @internal */
  protected readEntry(key: string, options: StoreOptions): Entry | null {
    return this.deserializeEntry(this.readSerializedEntry(key, options), options);
  }

  /** @internal */
  private readSerializedEntry(key: string, options: StoreOptions): unknown {
    return this.rescueErrorWith(null, () => this.data.with((c) => c.get(key, options)));
  }

  /** @internal */
  protected writeEntry(key: string, entry: Entry, options: StoreOptions): boolean {
    return this.writeSerializedEntry(key, this.serializeEntry(entry, options), options);
  }

  /** @internal */
  private writeSerializedEntry(key: string, payload: unknown, options: StoreOptions): boolean {
    const method = options.unlessExist ? "add" : "set";
    let expiresIn = Math.trunc(Number(options.expiresIn ?? 0));
    if (options.raceConditionTtl && expiresIn > 0 && !options.raw) {
      expiresIn += 5 * 60;
    }
    return this.rescueErrorWith(null, () => {
      delete options.compress;
      return this.data.with((c) => !!c[method](key, payload, expiresIn, options));
    }) as boolean;
  }

  /** @internal */
  protected override readMultiEntries(
    names: string[],
    options: StoreOptions,
  ): Record<string, unknown> {
    const keysToNames: Record<string, string> = {};
    for (const name of names) keysToNames[this.normalizeKey(name, options)] = name;

    let rawValues: Record<string, unknown>;
    try {
      rawValues = this.data.with((c) => c.getMulti(Object.keys(keysToNames)));
    } catch (e) {
      if (!(e instanceof TopLevel.Dalli!.UnmarshalError)) throw e;
      rawValues = {};
    }

    const values: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawValues)) {
      const entry = this.deserializeEntry(value, { raw: options.raw });

      if (
        !(
          entry == null ||
          entry.isExpired() ||
          entry.isMismatched(this.normalizeVersion(keysToNames[key], options) ?? null)
        )
      ) {
        try {
          values[keysToNames[key]] = entry.value;
        } catch (e) {
          if (!(e instanceof DeserializationError)) throw e;
        }
      }
    }

    return values;
  }

  /** @internal */
  protected deleteEntry(key: string, _options: StoreOptions): boolean {
    return this.rescueErrorWith(false, () => this.data.with((c) => c.delete(key)));
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

  /** @internal */
  protected override normalizeKey(key: unknown, options?: StoreOptions): string {
    key = super.normalizeKey(key, options);
    if (key) {
      key = String.fromCharCode(...UTF8.encode(key as string));
      key = (key as string).replace(
        MemCacheStore.ESCAPE_KEY_CHARS,
        (match) => `%${match.charCodeAt(0).toString(16).toUpperCase()}`,
      );

      if ((key as string).length > MemCacheStore.KEY_MAX_SIZE) {
        const keySeparator = ":hash:";
        const keyHash = Digest.hexdigest(key as string);
        const keyTrimSize = MemCacheStore.KEY_MAX_SIZE - keySeparator.length - keyHash.length;
        key = `${(key as string).slice(0, keyTrimSize)}${keySeparator}${keyHash}`;
      }
    }
    return key as string;
  }

  /** @internal */
  protected override deserializeEntry(payload: unknown, options: StoreOptions = {}): Entry | null {
    if (payload && options.raw) {
      return new Entry(payload);
    } else {
      return super.deserializeEntry(payload);
    }
  }

  /** @internal */
  private rescueErrorWith<T, F>(fallback: F, block: () => T): T | F {
    try {
      return block();
    } catch (error) {
      if (
        error instanceof TopLevel.Dalli!.DalliError ||
        error instanceof TopLevel.ConnectionPool!.Error ||
        error instanceof TopLevel.ConnectionPool!.TimeoutError
      ) {
        Store.logger?.error?.(`DalliError (${error.message}): ${error.message}`);
        currentErrorReporter.report(error, {
          severity: "warning",
          source: "mem_cache_store.active_support",
        });
        return fallback;
      }
      throw error;
    }
  }
}

registerStoreClass(":mem_cache_store", MemCacheStore);
