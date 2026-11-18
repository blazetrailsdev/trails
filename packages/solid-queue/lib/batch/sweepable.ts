import { Concern, extend, minutes, type Duration } from "@blazetrails/activesupport";
import { Range, classModule } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Batch } from "../batch.js";

export class ClassMethods {
  static async sweepStalled(
    this: typeof Batch,
    {
      stalledFor = minutes(5),
      batchSize = 500,
    }: { stalledFor?: Duration; batchSize?: number } = {},
  ): Promise<unknown> {
    return await SolidQueue.instrument(
      "sweep_stalled_batches",
      { stalled_for: stalledFor, stale_executions: 0, finished_batches: 0, started_batches: 0 },
      async (payload) => {
        payload.stale_executions = await ClassMethods.sweepStaleExecutions.call(this, {
          batchSize,
        });
        payload.finished_batches = await ClassMethods.finishStalledBatches.call(this, {
          batchSize,
        });
        payload.started_batches = await ClassMethods.startStalledBatches.call(this, {
          stalledFor,
          batchSize,
        });
        return payload.started_batches;
      },
    );
  }

  /** @internal */
  private static async sweepStaleExecutions(
    this: typeof Batch,
    { batchSize }: { batchSize: number },
  ): Promise<number> {
    let swept = 0;

    for (const stale of [
      SolidQueue.BatchExecution!.withFinishedJobs(),
      SolidQueue.BatchExecution!.withFailedJobs(),
    ]) {
      await stale.findEach({ batchSize }, async (batchExecution) => {
        swept += 1;
        await batchExecution.destroy();
      });
    }

    return swept;
  }

  /** @internal */
  private static async finishStalledBatches(
    this: typeof Batch,
    { batchSize }: { batchSize: number },
  ): Promise<number> {
    let finished = 0;

    await this.unfinished()
      .enqueued()
      .withoutExecutions()
      .findEach({ batchSize }, async (batch) => {
        finished += 1;
        await batch.finish();
      });

    return finished;
  }

  /** @internal */
  private static async startStalledBatches(
    this: typeof Batch,
    { stalledFor, batchSize }: { stalledFor: Duration; batchSize: number },
  ): Promise<number> {
    let started = 0;

    await this.unfinished()
      .where({ enqueued_at: null })
      .where({ created_at: new Range(null, stalledFor.ago(), true) })
      .findEach({ batchSize }, async (batch) => {
        started += 1;
        await batch.start();
      });

    return started;
  }
}

export class Sweepable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
}
extend(Sweepable, Concern);
Object.defineProperty(Sweepable, "ClassMethods", { value: ClassMethods });
