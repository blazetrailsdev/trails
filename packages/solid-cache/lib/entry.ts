import { type Result } from "@blazetrails/activerecord";
import { include, runLoadHooks } from "@blazetrails/activesupport";
import { Encryption } from "./entry/encryption.js";
import { Expiration, type ClassMethods as ExpirationClassMethods } from "./entry/expiration.js";
import { Size, type ClassMethods as SizeClassMethods } from "./entry/size.js";
import { type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import { constSet, Range, Digest, eachSlice, toS, unpack } from "@blazetrails/ruby-compat";
import { Record } from "./record.js";
import { SolidCache } from "./solid-cache.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Payload = { key: unknown; value: unknown; keyHash?: number | bigint; byteSize?: number };

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

  static async write(key: unknown, value: unknown): Promise<void> {
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

  static async read(key: string): Promise<unknown> {
    return (await this.readMulti([key])).get(key);
  }

  static async readMulti(keys: string[]): Promise<Map<string, unknown>> {
    return await this.withoutQueryCache(async () => {
      const results = new Map<string, unknown>();
      for (const keysBatch of eachSlice(keys, Entry.MULTI_BATCH_SIZE)) {
        const query = sql(this.selectSql(keysBatch), ...this.keyHashesFor(keysBatch));

        const connection = await this.leaseConnection();
        const rows = (await connection.selectAll(query, "SolidCache::Entry Load")).castValues(
          this.attributeTypes() as unknown as Parameters<Result["castValues"]>[0],
        ) as [unknown, unknown][];
        for (const [key, value] of rows) results.set(decoder.decode(key as Uint8Array), value);
      }
      return results;
    });
  }

  static async deleteByKey(...keys: string[]): Promise<number> {
    return await this.withoutQueryCache(() =>
      this.where({ key_hash: this.keyHashesFor(keys) }).deleteAll(),
    );
  }

  static async clearTruncate(): Promise<unknown> {
    return await (await this.leaseConnection()).truncate(this.tableName!);
  }

  static async clearDelete(): Promise<unknown> {
    return await this.withoutQueryCache(() => this.inBatches().deleteAll());
  }

  static async lockAndWrite(
    key: string,
    block: (value: unknown) => unknown | Promise<unknown>,
  ): Promise<unknown> {
    return await this.transaction(async () => {
      return await this.withoutQueryCache(async () => {
        const result = (await this.lock()
          .where({ key_hash: this.keyHashFor(key) })
          .pick("key", "value")) as [unknown, unknown] | null;
        const newValue = await block(
          result != null && decoder.decode(result[0] as Uint8Array) === key ? result[1] : null,
        );
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
    return (await (await this.leaseConnection()).supportsInsertConflictTarget())
      ? "key_hash"
      : null;
  }

  /** @internal */
  private static selectSql(keys: unknown[]): string {
    if (!Object.hasOwn(this, "_selectSql")) this._selectSql = new Map();
    let selectSql = this._selectSql!.get(keys.length);
    if (selectSql == null) {
      selectSql = this.where({ key_hash: [1111, 2222] })
        .select("key", "value")
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
    return (
      encoder.encode(toS(payload.key)).length +
      encoder.encode(toS(payload.value)).length +
      this.estimatedRowOverhead()
    );
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
