import { RecordNotFound } from "@blazetrails/activerecord";
import { ActiveStorage } from "./active-storage.js";
import { BaseJob } from "./base-job.js";
import type { Blob } from "./blob.js";
import { IntegrityError, UnrepresentableError } from "./errors.js";

export class TransformJob extends BaseJob {
  static {
    this.queueAs(null, () => ActiveStorage.queues.transform);

    this.discardOn(RecordNotFound, UnrepresentableError);
    this.retryOn(IntegrityError, { attempts: 10, wait: ":polynomially_longer" });
  }

  async perform(blob: Blob, transformations: Parameters<Blob["representation"]>[0]): Promise<void> {
    await blob.representation(transformations).processed();
  }
}
