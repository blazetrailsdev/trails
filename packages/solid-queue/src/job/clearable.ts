import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import { Range, classModule, rbFSleep } from "@blazetrails/ruby-compat";
import type { Relation } from "@blazetrails/activerecord";
import { SolidQueue } from "../solid-queue.js";
import type { Job } from "../job.js";

interface ClearableOptions {
  finishedBefore?: unknown;
  className?: string | null;
}

export class ClassMethods {
  static async clearFinishedInBatches(
    this: typeof Job,
    {
      batchSize = 500,
      finishedBefore = SolidQueue.clearFinishedJobsAfter.ago(),
      className = null,
      sleepBetweenBatches = 0,
    }: ClearableOptions & { batchSize?: number; sleepBetweenBatches?: number } = {},
  ): Promise<void> {
    while (true) {
      const recordsDeleted = await this.clearable({ finishedBefore, className })
        .limit(batchSize)
        .deleteAll();
      if (sleepBetweenBatches > 0) await rbFSleep(sleepBetweenBatches);
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
    included(base: null, block: (this: typeof Job) => void): void;
  }
).included(null, function (this: typeof Job) {
  this.scope(
    "clearable",
    function (
      this: Relation<Job>,
      {
        finishedBefore = SolidQueue.clearFinishedJobsAfter.ago(),
        className = null,
      }: ClearableOptions = {},
    ) {
      return this.where()
        .not({ finished_at: null })
        .where({ finished_at: new Range(null, finishedBefore, true) })
        .where(isPresent(className) ? { class_name: className } : {});
    },
  );
});
