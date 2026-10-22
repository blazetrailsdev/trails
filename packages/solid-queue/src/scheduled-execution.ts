import { registerModel, type Relation } from "@blazetrails/activerecord";
import { Time } from "@blazetrails/date";
import { Range, rbModConstSet } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import { SolidQueue } from "./solid-queue.js";

export class ScheduledExecution extends Execution {
  declare static due: () => Relation<ScheduledExecution>;
  declare static nextBatch: (batchSize: number) => Relation<ScheduledExecution>;
  declare scheduled_at: Time | null;

  static {
    registerModel(rbModConstSet(SolidQueue, "ScheduledExecution", this));

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
}
