import { RecordNotFound } from "@blazetrails/activerecord";
import { ActiveStorage } from "./active-storage.js";
import { BaseJob } from "./base-job.js";
import type { Blob } from "./blob.js";
import { IntegrityError, UnrepresentableError } from "./errors.js";

export class PreviewImageJob extends BaseJob {
  static {
    this.queueAs(null, () => ActiveStorage.queues.previewImage);

    this.discardOn(RecordNotFound, UnrepresentableError);
    this.retryOn(IntegrityError, { attempts: 10, wait: ":polynomially_longer" });
  }

  async perform(blob: Blob, variations: Parameters<Blob["preprocessed"]>[0][]): Promise<void> {
    await blob.preview({}).processed();

    for (const transformations of variations) {
      await blob.preprocessed(transformations);
    }
  }
}
