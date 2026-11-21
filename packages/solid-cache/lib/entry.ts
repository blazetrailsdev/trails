import { include, runLoadHooks } from "@blazetrails/activesupport";
import { Encryption } from "./entry/encryption.js";
import { Expiration, type ClassMethods as ExpirationClassMethods } from "./entry/expiration.js";
import { Size, type ClassMethods as SizeClassMethods } from "./entry/size.js";
import { type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import {
  constSet,
  Range,
  Digest,
  eachSlice,
  Hash,
  b,
  rbEqual,
  toS,
  unpack,
} from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import { SolidCache } from "./solid-cache.js";

type Payload = {
  key: string | Uint8Array;
  value: unknown;
  keyHash?: number | bigint;
  byteSize?: number;
};

export class Entry extends Record {
  static readonly ESTIMATED_ROW_OVERHEAD = 140;

  static readonly ESTIMATED_ENCRYPTION_OVERHEAD = 170;

  static readonly KEY_HASH_ID_RANGE = new Range(-(2n ** 63n), 2n ** 63n - 1n);

  static readonly MULTI_BATCH_SIZE = 1000;

  /** @internal */
  declare static _selectSql: Map<number, string> | undefined;

  declare static expire: typeof ExpirationClassMethods.expire;
  /** @internal */
  declare static isCacheFull: typeof ExpirationClassMethods.isCacheFull;
  /** @internal */
  declare static expiryCandidateIds: typeof ExpirationClassMethods.expiryCandidateIds;
  declare static estimatedSize: typeof SizeClassMethods.estimatedSize;
  declare static largestByteSizes: (limit: number) => Relation<Entry>;
  declare static inKeyHashRange: (range: unknown) => Relation<Entry>;
  declare static upToByteSize: (cutoff: unknown) => Relation<Entry>;

  static {
    constSet(SolidCache, "Entry", this);
    constSet(this, "Encryption", Encryption);
    constSet(this, "Expiration", Expiration);
    constSet(this, "Size", Size);
    include(this, Encryption);
    include(this, Expiration);
    include(this, Size);
  }

  static async write(key: string | Uint8Array, value: unknown): Promise<void> {
    await this.writeMulti([{ key: key, value: value }]);
  }

  static async writeMulti(payloads: Payload[]): Promise<void> {
    await this.withoutQueryCache(async () => {
      for (const payloadBatch of eachSlice(payloads, Entry.MULTI_BATCH_SIZE)) {
        await this.upsertAll(this.addKeyHashAndByteSize(payloadBatch), {
          uniqueBy: (await this.upsertUniqueBy()) ?? undefined,
          onDuplicate: ":update",
          updateOnly: ["key", "value", "byte_size"],
        });
      }
    });
  }

  static async read(key: string | Uint8Array): Promise<unknown> {
    return (await this.readMulti([key])).get(key) ?? null;
  }

  static async readMulti(
    keys: (string | Uint8Array)[],
  ): Promise<Hash<string | Uint8Array, unknown>> {
    return await this.withoutQueryCache(async () => {
      const results = new Hash<string | Uint8Array, unknown>();
      for (const keysBatch of eachSlice(keys, Entry.MULTI_BATCH_SIZE)) {
        const query = sql(this.selectSql(keysBatch), ...this.keyHashesFor(keysBatch));

        await this.withConnection(async (connection) => {
          const rows = (await connection.selectAll(query, "SolidCache::Entry Load")).castValues(
            this.attributeTypes(),
          ) as [unknown, unknown][];
          for (const [key, value] of rows) results.set(key as Uint8Array, value);
        });
      }
      return results;
    });
  }

  static async deleteByKey(...keys: (string | Uint8Array)[]): Promise<number> {
    return await this.withoutQueryCache(() =>
      this.where({ key_hash: this.keyHashesFor(keys) }).deleteAll(),
    );
  }

  static async clearTruncate(): Promise<unknown> {
    return await this.withConnection(async (connection) => {
      return await connection.truncate(this.tableName!);
    });
  }

  static async clearDelete(): Promise<unknown> {
    return await this.withoutQueryCache(() => this.inBatches().deleteAll());
  }

  static async lockAndWrite(
    key: string | Uint8Array,
    block: (value: unknown) => unknown | Promise<unknown>,
  ): Promise<unknown> {
    return await this.transaction(async () => {
      return await this.withoutQueryCache(async () => {
        const result = (await this.lock()
          .where({ key_hash: this.keyHashFor(key) })
          .pick("key", "value")) as [unknown, unknown] | null;
        const newValue = await block(result != null && rbEqual(result[0], key) ? result[1] : null);
        if (newValue != null && newValue !== false) await this.write(key, newValue);
        return newValue;
      });
    });
  }

  static async idRange(): Promise<unknown> {
    return await this.withoutQueryCache(
      async () => (await this.pick(sql("max(id) - min(id) + 1"))) ?? 0,
    );
  }

  /** @internal */
  private static addKeyHashAndByteSize(payloads: Payload[]): globalThis.Record<string, unknown>[] {
    return payloads.map((payload) => {
      const dup: globalThis.Record<string, unknown> = { ...payload };
      dup.key_hash = this.keyHashFor(payload.key);
      dup.byte_size = this.byteSizeFor(payload);
      return dup;
    });
  }

  /** @internal */
  private static async upsertUniqueBy(): Promise<string | null> {
    return await this.withConnection(async (connection) => {
      return (await connection.supportsInsertConflictTarget()) ? "key_hash" : null;
    });
  }

  /** @internal */
  private static selectSql(keys: unknown[]): string {
    if (!Object.hasOwn(this, "_selectSql")) this._selectSql = new Map();
    let selectSql = this._selectSql!.get(keys.length);
    if (selectSql == null) {
      selectSql = this.where({ key_hash: [1111, 2222] })
        .select(":key", ":value")
        .toSql()
        .replaceAll("1111, 2222", Array.from({ length: keys.length }, () => "?").join(", "));
      this._selectSql!.set(keys.length, selectSql);
    }
    return selectSql;
  }

  /** @internal */
  private static keyHashFor(key: unknown): number | bigint {
    return unpack(Digest.SHA256.digest(toS(key)), "q>")[0] as number | bigint;
  }

  /** @internal */
  private static keyHashesFor(keys: unknown[]): (number | bigint)[] {
    return keys.map((key) => this.keyHashFor(key));
  }

  /** @internal */
  private static byteSizeFor(payload: Payload): number {
    return b(toS(payload.key)).length + b(toS(payload.value)).length + this.estimatedRowOverhead();
  }

  /** @internal */
  private static estimatedRowOverhead(): number {
    if (SolidCache.configuration.isEncrypt()) {
      return Entry.ESTIMATED_ROW_OVERHEAD + Entry.ESTIMATED_ENCRYPTION_OVERHEAD;
    } else {
      return Entry.ESTIMATED_ROW_OVERHEAD;
    }
  }

  /** @internal */
  private static withoutQueryCache<T>(block: () => T | Promise<T>): Promise<T> {
    return Promise.resolve(this.uncached(block, { dirties: false }));
  }
}

runLoadHooks("solid_cache_entry", Entry);
