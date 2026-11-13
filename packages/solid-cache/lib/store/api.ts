import { Digest as ActiveSupportDigest } from "@blazetrails/activesupport/digest";
import { DeserializationError, Entry as CacheEntry } from "@blazetrails/activesupport/cache";
import { NotImplementedError, rbCallSuper, toI } from "@blazetrails/ruby-compat";
import type { StoreHost } from "../store.js";

type Options = Record<string, unknown>;

const encoder = new TextEncoder();

export const Api = {
  DEFAULT_MAX_KEY_BYTESIZE: 1024,
  SQL_WILDCARD_CHARS: ["_", "%"],

  async increment(this: StoreHost, name: string, amount = 1, options?: Options): Promise<unknown> {
    options = this.mergedOptions(options);
    const key = await this.normalizeKey(name, options);

    return await this.instrument("increment", key, { amount: amount }, () =>
      this.adjust(name, amount, options),
    );
  },

  async decrement(this: StoreHost, name: string, amount = 1, options?: Options): Promise<unknown> {
    options = this.mergedOptions(options);
    const key = await this.normalizeKey(name, options);

    return await this.instrument("decrement", key, { amount: amount }, () =>
      this.adjust(name, -amount, options),
    );
  },

  async cleanup(this: StoreHost, _options?: Options): Promise<void> {
    throw new NotImplementedError(`${this.constructor.name} does not support cleanup`);
  },

  async clear(this: StoreHost, _options?: Options): Promise<void> {
    await this.entryClear();
  },

  /** @internal */
  async readEntry(this: StoreHost, key: string, options: Options): Promise<CacheEntry | null> {
    return this.deserializeEntry(await this.readSerializedEntry(key, options), options);
  },

  /** @internal */
  async readSerializedEntry(this: StoreHost, key: string, _options: Options): Promise<unknown> {
    return await this.entryRead(key);
  },

  /** @internal */
  async writeEntry(
    this: StoreHost,
    key: string,
    entry: CacheEntry,
    options: Options,
  ): Promise<boolean> {
    const { raw = false, unlessExist = false, ...rest } = options;
    const payload = this.serializeEntry(entry, { raw: raw, ...rest });

    let written: boolean;
    if (unlessExist) {
      written = false;
      await this.entryLockAndWrite(key, (value) => {
        if (value == null || this.deserializeEntry(value, rest)!.isExpired()) {
          written = true;
          return payload;
        }
        return null;
      });
    } else {
      written = await this.entryWrite(key, payload);
    }

    this.writeSerializedEntry(key, payload, { raw: raw, returning: written, ...rest });
    return written;
  },

  /** @internal */
  writeSerializedEntry(
    this: StoreHost,
    _key: string,
    _payload: unknown,
    { returning = true }: Options = {},
  ): unknown {
    return returning;
  },

  /** @internal */
  async readSerializedEntries(this: StoreHost, keys: string[]): Promise<Map<string, unknown>> {
    const merged = new Map<string, unknown>();
    for (const results of await this.entryReadMulti(keys)) {
      for (const [key, value] of results) merged.set(key, value);
    }
    return merged;
  },

  /** @internal */
  async readMultiEntries(
    this: StoreHost,
    names: unknown[],
    options: Options,
  ): Promise<Map<unknown, unknown>> {
    const keysAndNames = new Map<string, unknown>();
    for (const name of names) keysAndNames.set(await this.normalizeKey(name, options), name);
    const serializedEntries = await this.readSerializedEntries([...keysAndNames.keys()]);

    const results = new Map<unknown, unknown>();
    for (const [key, name] of keysAndNames) {
      const serializedEntry = serializedEntries.get(key);
      const entry = this.deserializeEntry(serializedEntry, options);

      if (!entry) continue;

      const version = (await this.normalizeVersion(name, options)) ?? null;

      if (entry.isExpired()) {
        await this.deleteEntry(key, options);
      } else if (!entry.isMismatched(version)) {
        try {
          results.set(name, entry.value);
        } catch (error) {
          if (!(error instanceof DeserializationError)) throw error;
        }
      }
    }
    return results;
  },

  /** @internal */
  async writeMultiEntries(
    this: StoreHost,
    entries: Record<string, CacheEntry>,
    options: Options,
  ): Promise<boolean | undefined> {
    const { expiresIn: _expiresIn, ...rest } = options;
    if (Object.keys(entries).length > 0) {
      const serializedEntries = this.serializeEntries(entries, rest);
      for (const entries of serializedEntries) {
        this.writeSerializedEntry(entries.key, entries.value);
      }

      return (await this.entryWriteMulti(serializedEntries)).every((result) => result);
    }
    return undefined;
  },

  /** @internal */
  async deleteEntry(this: StoreHost, key: string, _options: Options): Promise<boolean> {
    return await this.entryDelete(key);
  },

  /** @internal */
  async deleteMultiEntries(this: StoreHost, entries: string[], _options: Options): Promise<number> {
    return (await this.entryDeleteMulti(entries))
      .filter((x) => x != null)
      .reduce((sum, count) => sum + count, 0);
  },

  /** @internal */
  serializeEntry(this: StoreHost, entry: CacheEntry, options: Options = {}): unknown {
    const { raw = false, ...rest } = options;
    return rbCallSuper(this, Api.serializeEntry, entry, { raw: raw, ...rest });
  },

  /** @internal */
  serializeEntries(
    this: StoreHost,
    entries: Record<string, CacheEntry>,
    options: Options,
  ): { key: string; value: unknown }[] {
    return Object.entries(entries).map(([key, entry]) => ({
      key: key,
      value: this.serializeEntry(entry, options),
    }));
  },

  /** @internal */
  deserializeEntry(this: StoreHost, payload: unknown, _options?: Options): CacheEntry | null {
    return rbCallSuper(this, Api.deserializeEntry, payload) as CacheEntry | null;
  },

  /** @internal */
  async normalizeKey(this: StoreHost, key: unknown, options?: Options): Promise<string> {
    return this.truncateKey(
      (await (rbCallSuper(this, Api.normalizeKey, key, options) as Promise<string>)) ?? null,
    )!;
  },

  /** @internal */
  truncateKey(this: StoreHost, key: string | null): string | null {
    if (key != null && encoder.encode(key).length > this.maxKeyBytesize) {
      const suffix = `:hash:${ActiveSupportDigest.hexdigest(key)}`;
      const truncateAt = this.maxKeyBytesize - encoder.encode(suffix).length;
      return `${new TextDecoder().decode(encoder.encode(key).subarray(0, truncateAt))}${suffix}`;
    } else {
      return key;
    }
  },

  /** @internal */
  async adjust(this: StoreHost, name: string, amount: number, options?: Options): Promise<unknown> {
    options = this.mergedOptions(options);
    const key = await this.normalizeKey(name, options);

    const newValue = await this.entryLockAndWrite(key, (value) =>
      this.serializeEntry(this.adjustedEntry(value, amount, options)),
    );
    if (newValue != null && newValue !== false) {
      return this.deserializeEntry(newValue, options)!.value;
    }
    return null;
  },

  /** @internal */
  adjustedEntry(this: StoreHost, value: unknown, amount: number, options: Options): CacheEntry {
    const entry = this.deserializeEntry(value, options);

    if (entry && !entry.isExpired()) {
      return new CacheEntry(amount + Number(toI(entry.value)), {
        ...options,
        expiresIn: null,
        expiresAt: entry.expiresAt,
      });
    } else if (typeof value === "string" && /^\d+$/.test(value)) {
      return new CacheEntry(amount + Number(toI(value)), options);
    } else {
      return new CacheEntry(amount, options);
    }
  },
};
