import { RecordNotFound } from "@blazetrails/activerecord";
import { ActiveStorage } from "./active-storage.js";
import { BaseJob } from "./base-job.js";
import type { Blob } from "./blob.js";
import { IntegrityError } from "./errors.js";

export class AnalyzeJob extends BaseJob {
  static {
    this.queueAs(null, () => ActiveStorage.queues.analysis);

    this.discardOn(RecordNotFound);
    this.retryOn(IntegrityError, { attempts: 10, wait: ":polynomially_longer" });
  }

  async perform(blob: Blob): Promise<void> {
    await blob.analyze();
  }
}
