import { Deadlocked, RecordNotFound } from "@blazetrails/activerecord";
import { ActiveStorage } from "./active-storage.js";
import { BaseJob } from "./base-job.js";
import type { Blob } from "./blob.js";

export class PurgeJob extends BaseJob {
  static {
    this.queueAs(null, () => ActiveStorage.queues.purge);

    this.discardOn(RecordNotFound);
    this.retryOn(Deadlocked, { attempts: 10, wait: ":polynomially_longer" });
  }

  async perform(blob: Blob): Promise<void> {
    await blob.purge();
  }
}
