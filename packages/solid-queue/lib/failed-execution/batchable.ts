import { Concern, extend } from "@blazetrails/activesupport";
import { ActiveRecordError } from "@blazetrails/activerecord";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { FailedExecution } from "../failed-execution.js";
import type { Job } from "../job.js";

export class Batchable {
  static readonly [classModule] = true;
  declare job: Promise<Job>;

  /** @internal */
  async destroyJobBatchExecution(): Promise<void> {
    const job = await this.job;
    try {
      await (await job.batchExecution)?.destroyBang();
    } catch (e) {
      if (!(e instanceof ActiveRecordError)) throw e;
      await SolidQueue.instrument("batch_progress_error", {
        batch_id: job.batch_id,
        job_id: job.id,
        error: e,
      });
    }
  }
}
extend(Batchable, Concern);
(
  Batchable as unknown as {
    included(base: null, block: (this: typeof FailedExecution) => void): void;
  }
).included(null, function (this: typeof FailedExecution) {
  this.afterCreate(":destroyJobBatchExecution", {
    if: async function (this: Batchable) {
      return (await SolidQueue.Batch!.isMigrated()) && (await this.job).queryAttribute("batch_id");
    },
  });
});
