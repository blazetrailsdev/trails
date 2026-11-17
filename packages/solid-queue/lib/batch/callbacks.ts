import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { Time } from "@blazetrails/date";
import { classModule } from "@blazetrails/ruby-compat";
import type { Batch } from "../batch.js";
import { SolidQueue } from "../solid-queue.js";

type CallbackName = "on_finish" | "on_success" | "on_failure";
type BatchedActiveJob = ActiveJobBase & {
  batchId?: unknown;
  callbackBatchId?: unknown;
  concurrencyKey(): string | null;
};

export class Callbacks {
  static readonly [classModule] = true;
  declare id: number;
  declare isFailed: () => boolean;
  declare on_finish: { [key: string]: unknown } | null;
  declare on_success: { [key: string]: unknown } | null;
  declare on_failure: { [key: string]: unknown } | null;

  /** @internal */
  serializeCallback(value: unknown): unknown {
    if (isPresent(value)) {
      const activeJob = (
        value instanceof ActiveJobBase ? value : new (value as new () => ActiveJobBase)()
      ) as BatchedActiveJob;
      activeJob.batchId = null;
      return activeJob.serialize();
    }
    return null;
  }

  /** @internal */
  async enqueueCallbackJobs(): Promise<void> {
    if (this.isFailed()) await this.enqueueCallbackJob("on_failure");
    else {
      await this.enqueueCallbackJob("on_success");
    }

    await this.enqueueCallbackJob("on_finish");
  }

  /** @internal */
  async enqueueCallbackJob(callbackName: CallbackName): Promise<void> {
    const callback = this[callbackName];
    if (callback != null) {
      const activeJob = ActiveJobBase.deserialize<BatchedActiveJob>(callback as never);
      activeJob.callbackBatchId = this.id;
      await activeJob.runCallbacks("enqueue", async () => {
        await SolidQueue.Job!.enqueue(
          activeJob as Parameters<typeof import("../job.js").Job.enqueue>[0],
          {
            scheduledAt: activeJob.scheduledAt ?? Time.current(),
          },
        );
      });
    }
  }
}
extend(Callbacks, Concern);
(
  Callbacks as unknown as {
    included(base: null, block: (this: typeof Batch) => void): void;
  }
).included(null, function (this: typeof Batch) {
  for (const callbackType of ["finish", "success", "failure"]) {
    this.serialize(`on_${callbackType}`, { coder: JSON });

    Object.defineProperty(this.prototype, `on_${callbackType}`, {
      get(this: Batch) {
        return this.readAttribute(`on_${callbackType}`);
      },
      set(this: Batch, callback: unknown) {
        this.writeAttribute(`on_${callbackType}`, this.serializeCallback(callback));
      },
      configurable: true,
    });
  }
});
