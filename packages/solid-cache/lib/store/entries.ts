import { Hash } from "@blazetrails/ruby-compat";
import { Entry } from "../entry.js";
import type { StoreHost } from "../store.js";

type Payload = { key: Uint8Array; value: unknown };

export const Entries = {
  /** @internal */
  async entryClear(this: StoreHost): Promise<unknown> {
    return await this.writingAll({ failsafe: "clear", failsafeReturning: null }, async () => {
      if (this.clearWith === "truncate") {
        return await Entry.clearTruncate();
      } else {
        return await Entry.clearDelete();
      }
    });
  },

  /** @internal */
  async entryLockAndWrite(
    this: StoreHost,
    key: Uint8Array,
    block: (value: unknown) => unknown,
  ): Promise<unknown> {
    return await this.writingKey(key, { failsafe: "increment" }, () =>
      Entry.lockAndWrite(key, async (value) => {
        const result = await block(value);
        if (result != null && result !== false) await this.trackWrites(1);
        return result;
      }),
    );
  },

  /** @internal */
  async entryRead(this: StoreHost, key: Uint8Array): Promise<unknown> {
    return await this.readingKey(key, { failsafe: "read_entry" }, () => Entry.read(key));
  },

  /** @internal */
  async entryReadMulti(this: StoreHost, keys: Uint8Array[]): Promise<Hash<Uint8Array, unknown>[]> {
    return (await this.readingKeys(
      keys,
      { failsafe: "read_multi_mget", failsafeReturning: new Hash() },
      (keys) => Entry.readMulti(keys as Uint8Array[]),
    )) as Hash<Uint8Array, unknown>[];
  },

  /** @internal */
  async entryWrite(this: StoreHost, key: Uint8Array, payload: unknown): Promise<boolean> {
    return (await this.writingKey(
      key,
      { failsafe: "write_entry", failsafeReturning: null },
      async () => {
        await Entry.write(key, payload);
        await this.trackWrites(1);
        return true;
      },
    )) as boolean;
  },

  /** @internal */
  async entryWriteMulti(this: StoreHost, entries: Payload[]): Promise<boolean[]> {
    return (await this.writingKeys(
      entries,
      { failsafe: "write_multi_entries", failsafeReturning: false },
      async (entries) => {
        await Entry.writeMulti(entries as Payload[]);
        await this.trackWrites(entries.length);
        return true;
      },
    )) as boolean[];
  },

  /** @internal */
  async entryDelete(this: StoreHost, key: Uint8Array): Promise<boolean> {
    return (await this.writingKey(
      key,
      { failsafe: "delete_entry", failsafeReturning: false },
      async () => (await Entry.deleteByKey(key)) > 0,
    )) as boolean;
  },

  /** @internal */
  async entryDeleteMulti(this: StoreHost, entries: Uint8Array[]): Promise<number[]> {
    return (await this.writingKeys(
      entries,
      { failsafe: "delete_multi_entries", failsafeReturning: 0 },
      (entries) => Entry.deleteByKey(...(entries as Uint8Array[])),
    )) as number[];
  },
};
