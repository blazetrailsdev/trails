import { Kernel } from "@blazetrails/ruby-compat";
import { Entry } from "../entry.js";
import { ExpiryJob } from "../expiry-job.js";
import type { StoreHost } from "../store.js";

const EXPIRY_MULTIPLIER = 2;

export const Expiry = {
  EXPIRY_MULTIPLIER,

  async trackWrites(this: StoreHost, count: number): Promise<void> {
    const batches = this.expiryBatches(count);
    for (let i = 0; i < batches; i++) await this.expireLater();
  },

  /** @internal */
  expiryBatches(this: StoreHost, count: number): number {
    let batches = Math.floor(count * this.expiresPerWrite);
    const overflowBatchChance = count * this.expiresPerWrite - batches;
    if ((Kernel.rand() as number) < overflowBatchChance) batches += 1;
    return batches;
  },

  /** @internal */
  async expireLater(this: StoreHost): Promise<void> {
    const maxOptions = {
      maxAge: this.maxAge,
      maxEntries: this.maxEntries,
      maxSize: this.maxSize,
    };
    if (this.expiryMethod === "job") {
      await ExpiryJob.set({ queue: this.expiryQueue }).performLater(this.expiryBatchSize, {
        shard: Entry.currentShard(),
        ...maxOptions,
      });
    } else {
      this.async(() => Entry.expire(this.expiryBatchSize, maxOptions));
    }
  },
};
