import { RecordNotUnique, registerModel, type Relation } from "@blazetrails/activerecord";
import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import { StandardError } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";

export class AlreadyRecorded extends StandardError {}

export class RecurringExecution extends Execution {
  declare static clearable: () => Relation<RecurringExecution>;
  declare task_key: string;
  declare run_at: unknown;

  static {
    registerModel(this);
    Object.defineProperty(this, "AlreadyRecorded", { value: AlreadyRecorded });

    this.scope("clearable", function () {
      return this.where().missing("job");
    });
  }

  static async createOrInsertBang(attributes: { [key: string]: unknown }): Promise<unknown> {
    try {
      if (await (await this.connection)!.supportsInsertConflictTarget()) {
        if ((await this.insert(attributes, { uniqueBy: ["task_key", "run_at"] })).isEmpty()) {
          throw new AlreadyRecorded();
        }
        return null;
      } else {
        return await this.createBang({ ...attributes });
      }
    } catch (e) {
      if (e instanceof RecordNotUnique) throw new AlreadyRecorded();
      throw e;
    }
  }

  static async record(
    taskKey: string,
    runAt: unknown,
    block: () => Promise<ActiveJobBase | null> | ActiveJobBase | null,
  ): Promise<ActiveJobBase | null> {
    return (await this.transaction(async () => {
      const activeJob = await block();
      const successfullyEnqueued = activeJob?.isSuccessfullyEnqueued();
      if (successfullyEnqueued != null && successfullyEnqueued !== false) {
        await this.createOrInsertBang({
          job_id: activeJob!.providerJobId,
          task_key: taskKey,
          run_at: runAt,
        });
      }
      return activeJob;
    }))!;
  }

  static async clearInBatches({ batchSize = 500 }: { batchSize?: number } = {}): Promise<void> {
    while (true) {
      const recordsDeleted = await this.clearable().limit(batchSize).deleteAll();
      if (recordsDeleted === 0) break;
    }
  }
}
