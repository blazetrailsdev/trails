import { registerModel, type Relation } from "@blazetrails/activerecord";
import { include } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import {
  Dispatching,
  type ClassMethods as DispatchingClassMethods,
} from "./execution/dispatching.js";
import { SolidQueue } from "./solid-queue.js";

export class ScheduledExecution extends Execution {
  declare static dispatchJobs: typeof DispatchingClassMethods.dispatchJobs;
  declare static due: () => Relation<ScheduledExecution>;
  declare static nextBatch: (batchSize: number) => Relation<ScheduledExecution>;
  declare scheduled_at: Time | null;

  static {
    registerModel(this);
    include(this, Dispatching);

    this.scope("due", function () {
      return this.where({ scheduled_at: new Range(null, Time.current()) });
    });
    this.scope("ordered", function () {
      return this.order({ scheduled_at: "asc", priority: "asc", job_id: "asc" });
    });
    this.scope("nextBatch", function (batchSize: number) {
      return (
        (this as unknown as typeof ScheduledExecution).due() as unknown as typeof ScheduledExecution
      )
        .ordered()
        .limit(batchSize);
    });

    this.assumesAttributesFromJob("scheduled_at");
  }

  static async dispatchNextBatch(batchSize: number): Promise<number> {
    return (await this.transaction(async () => {
      const jobIds = await (this.nextBatch(batchSize) as unknown as typeof ScheduledExecution)
        .nonBlockingLock()
        .pluck("job_id");
      if (jobIds.length === 0) return 0;
      else {
        return await SolidQueue.instrument(
          "dispatch_scheduled",
          { batch_size: batchSize },
          async (payload) => {
            return (payload["size"] = await this.dispatchJobs(jobIds));
          },
        );
      }
    }))!;
  }
}
