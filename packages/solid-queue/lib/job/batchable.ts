import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import { ActiveRecordError, type Base } from "@blazetrails/activerecord";
import type { Time } from "@blazetrails/date";
import { classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import { Batch } from "../batch.js";
import { BatchExecution } from "../batch-execution.js";
import type { Job } from "../job.js";

export class ClassMethods {
  static async batchAll(this: typeof Job, jobs: Job[]): Promise<unknown> {
    if (await Batch.isMigrated()) return await BatchExecution.createAllFromJobs(jobs);
    return null;
  }
}

export class Batchable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare id: number;
  declare batch_id: number | null;
  declare finished_at: Time | null;
  declare batchExecution: Promise<BatchExecution | null>;
  declare queryAttribute: (name: string) => boolean;
  declare isSavedChangeToAttribute: (name: string) => boolean;

  async isBatched(): Promise<boolean> {
    return (await Batch.isMigrated()) && this.queryAttribute("batch_id");
  }

  /** @internal */
  async createBatchExecution(): Promise<void> {
    await BatchExecution.createAllFromJobs([this as unknown as Base]);
  }

  /** @internal */
  async updateBatchProgress(): Promise<void> {
    try {
      if (!(this.isSavedChangeToAttribute("finished_at") && isPresent(this.finished_at))) return;

      await (await this.batchExecution)?.destroyBang();
    } catch (e) {
      if (!(e instanceof ActiveRecordError)) throw e;
      await SolidQueue.instrument("batch_progress_error", {
        batch_id: this.batch_id,
        job_id: this.id,
        error: e,
      });
    }
  }

  /** @internal */
  async destroyBatchExecution(): Promise<void> {
    await (await this.batchExecution)?.destroyBang();
  }
}
extend(Batchable, Concern);
Object.defineProperty(Batchable, "ClassMethods", { value: ClassMethods });
(
  Batchable as unknown as {
    included(base: null, block: (this: typeof Job) => void): void;
  }
).included(null, function (this: typeof Job) {
  this.belongsTo("batch", { optional: true });
  this.hasOne("batchExecution");

  /** @inventedArm if — CONVERGEABLE solid-queue-batchable-callback-guards-async-migrated */
  this.afterCreate(async function (this: Batchable) {
    if (await this.isBatched()) await this.createBatchExecution();
  });
  /** @inventedArm if — CONVERGEABLE solid-queue-batchable-callback-guards-async-migrated */
  this.afterUpdate(async function (this: Batchable) {
    if (await this.isBatched()) await this.updateBatchProgress();
  });
  /** @inventedArm if — CONVERGEABLE solid-queue-batchable-callback-guards-async-migrated */
  this.beforeDestroy(async function (this: Batchable) {
    if (await this.isBatched()) await this.destroyBatchExecution();
  });
});
