import { Tryable } from "@blazetrails/activesupport";
import { ActiveStorage } from "./active-storage.js";
import { BaseJob } from "./base-job.js";
import { Blob } from "./blob.js";
import { FileNotFoundError, IntegrityError } from "./errors.js";

export class MirrorJob extends BaseJob {
  static {
    this.queueAs(null, () => ActiveStorage.queues.mirror);

    this.discardOn(FileNotFoundError);
    this.retryOn(IntegrityError, { attempts: 10, wait: ":polynomially_longer" });
  }

  /** @missingRailsArgs try — PERMANENT */
  async perform(key: string, { checksum }: { checksum: string | null }): Promise<void> {
    await Tryable.try(Blob.service, "mirror", key, { checksum: checksum });
  }
}
