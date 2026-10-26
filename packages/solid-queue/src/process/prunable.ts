import { Concern, extend } from "@blazetrails/activesupport";
import { Range, classModule } from "@blazetrails/ruby-compat";
import type { Relation } from "@blazetrails/activerecord";
import { ProcessPrunedError } from "../processes/process-pruned-error.js";
import { SolidQueue } from "../solid-queue.js";
import type { Process } from "../process.js";

export class ClassMethods {
  static async prune(
    this: typeof Process,
    { excluding = null }: { excluding?: Process | null } = {},
  ): Promise<void> {
    await SolidQueue.instrument("prune_processes", { size: 0 }, async (payload) => {
      for await (const batch of (this.prunable().excluding(excluding) as unknown as typeof Process)
        .nonBlockingLock()
        .findInBatches({ batchSize: 50 })) {
        (payload.size as number) += batch.length;

        for (const process of batch) await process.prune();
      }
    });
  }
}

export class Prunable {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;

  async prune(this: Process): Promise<void> {
    const error = new ProcessPrunedError(this.last_heartbeat_at);
    await this.failAllClaimedExecutionsWith(error);

    await this.deregister({ pruned: true });
  }
}
extend(Prunable, Concern);
Object.defineProperty(Prunable, "ClassMethods", { value: ClassMethods });
(
  Prunable as unknown as {
    included(base: null, block: (this: typeof Process) => void): void;
  }
).included(null, function (this: typeof Process) {
  this.scope("prunable", function (this: Relation<Process>) {
    return this.where({
      last_heartbeat_at: new Range(null, SolidQueue.processAliveThreshold.ago()),
    });
  });
});
