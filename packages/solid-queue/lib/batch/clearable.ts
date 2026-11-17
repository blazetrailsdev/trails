import { Concern, extend } from "@blazetrails/activesupport";
import { Range, classModule } from "@blazetrails/ruby-compat";
import type { Relation } from "@blazetrails/activerecord";
import { SolidQueue } from "../solid-queue.js";
import type { Batch } from "../batch.js";

export class ClassMethods {
  static async clearFinishedInBatches(
    this: typeof Batch,
    {
      batchSize = 500,
      finishedBefore = SolidQueue.clearFinishedJobsAfter.ago(),
      sleepBetweenBatches = 0,
    }: { batchSize?: number; finishedBefore?: unknown; sleepBetweenBatches?: number } = {},
  ): Promise<void> {
    while (true) {
      const recordsDeleted = await this.clearable({ finishedBefore: finishedBefore })
        .limit(batchSize)
        .deleteAll();
      if (sleepBetweenBatches > 0)
        await new Promise((resolve) => setTimeout(resolve, sleepBetweenBatches * 1000));
      if (recordsDeleted === 0) break;
    }
  }
}

export class Clearable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
}
extend(Clearable, Concern);
Object.defineProperty(Clearable, "ClassMethods", { value: ClassMethods });
(
  Clearable as unknown as {
    included(base: null, block: (this: typeof Batch) => void): void;
  }
).included(null, function (this: typeof Batch) {
  this.scope(
    "clearable",
    function (
      this: Relation<Batch>,
      {
        finishedBefore = SolidQueue.clearFinishedJobsAfter.ago(),
      }: { finishedBefore?: unknown } = {},
    ) {
      return this.succeeded().where({ finished_at: new Range(null, finishedBefore, true) });
    },
  );
});
