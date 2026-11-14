import { Entry } from "../entry.js";
import type { StoreHost } from "../store.js";

type Payload = { key: string; value: unknown };

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
    key: string,
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
  async entryRead(this: StoreHost, key: string): Promise<unknown> {
    return await this.readingKey(key, { failsafe: "read_entry" }, () => Entry.read(key));
  },

  /** @internal */
  async entryReadMulti(this: StoreHost, keys: string[]): Promise<Map<string, unknown>[]> {
    return (await this.readingKeys(
      keys,
      { failsafe: "read_multi_mget", failsafeReturning: new Map() },
      (keys) => Entry.readMulti(keys as string[]),
    )) as Map<string, unknown>[];
  },

  /** @internal */
  async entryWrite(this: StoreHost, key: string, payload: unknown): Promise<boolean> {
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
  async entryDelete(this: StoreHost, key: string): Promise<boolean> {
    return (await this.writingKey(
      key,
      { failsafe: "delete_entry", failsafeReturning: false },
      async () => (await Entry.deleteByKey(key)) > 0,
    )) as boolean;
  },

  /** @internal */
  async entryDeleteMulti(this: StoreHost, entries: string[]): Promise<number[]> {
    return (await this.writingKeys(
      entries,
      { failsafe: "delete_multi_entries", failsafeReturning: 0 },
      (entries) => Entry.deleteByKey(...(entries as string[])),
    )) as number[];
  },
};
