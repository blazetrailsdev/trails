import { registerModel, type Base, type Relation } from "@blazetrails/activerecord";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { rbFArray } from "@blazetrails/ruby-compat";
import { Execution, UndiscardableError } from "./execution.js";
import { SolidQueue } from "./solid-queue.js";

export class Result {
  constructor(
    public success: boolean,
    public error: Error | null,
  ) {}

  isSuccess(): boolean {
    return this.success;
  }
}

export class ClaimedExecution extends Execution {
  declare static orphaned: () => Relation<ClaimedExecution>;
  declare process_id: unknown;
  declare process: Promise<Base | null>;

  static {
    registerModel(this);

    this.belongsTo("process");

    this.scope("orphaned", function () {
      return this.where().missing("process");
    });
  }

  static async claiming(
    jobIds: unknown,
    processId: unknown,
    block: (claimed: ClaimedExecution[]) => unknown,
  ): Promise<ClaimedExecution[]> {
    const jobData = rbFArray(jobIds).map((jobId) => ({ job_id: jobId, process_id: processId }));

    return await SolidQueue.instrument(
      "claim",
      { process_id: processId, job_ids: jobIds },
      async (payload) => {
        await this.insertAllBang(jobData);
        const claimed = await (
          await this.where({ job_id: jobIds, process_id: processId }).load()
        ).toArray();
        await block(claimed);

        payload["size"] = claimed.length;
        payload["claimed_job_ids"] = claimed.map((execution) => execution.job_id);
        return claimed;
      },
    );
  }

  static async releaseAll(): Promise<ClaimedExecution[]> {
    return await SolidQueue.instrument("release_many_claimed", {}, async (payload) => {
      const executions = await this.includes("job").toArray();
      for (const execution of executions) await execution.release();

      payload["size"] = executions.length;
      return executions;
    });
  }

  static async failAllWith(error: Error): Promise<ClaimedExecution[]> {
    return await SolidQueue.instrument("fail_many_claimed", {}, async (payload) => {
      const executions = await this.includes("job").toArray();
      for (const execution of executions) await execution.failedWith(error);

      payload["process_ids"] = [...new Set(executions.map((execution) => execution.process_id))];
      payload["job_ids"] = [...new Set(executions.map((execution) => execution.job_id))];
      payload["size"] = executions.length;
      return executions;
    });
  }

  static override async discardAllInBatches(..._args: unknown[]): Promise<never> {
    throw new UndiscardableError("Can't discard jobs in progress");
  }

  static override async discardAllFromJobs(..._args: unknown[]): Promise<never> {
    throw new UndiscardableError("Can't discard jobs in progress");
  }

  async perform(): Promise<void> {
    try {
      const result = await this.execute();

      if (result.isSuccess()) {
        await this.finished();
      } else {
        await this.failedWith(result.error!);
        throw result.error;
      }
    } finally {
      await (await this.job).unblockNextBlockedJob();
    }
  }

  async release(): Promise<void> {
    const job = await this.job;
    await SolidQueue.instrument(
      "release_claimed",
      { job_id: job.id, process_id: this.process_id },
      async () => {
        await this.transaction(async () => {
          await job.dispatchBypassingConcurrencyLimits();
          await this.destroyBang();
        });
      },
    );
  }

  override async discard(): Promise<never> {
    throw new UndiscardableError("Can't discard a job in progress");
  }

  async failedWith(error: Error): Promise<void> {
    await this.transaction(async () => {
      await (await this.job).failedWith(error);
      await this.destroyBang();
    });
  }

  /** @internal */
  private async execute(): Promise<Result> {
    try {
      await ActiveJobBase.execute(
        (await this.job).arguments as unknown as Parameters<typeof ActiveJobBase.execute>[0],
      );
      return new Result(true, null);
    } catch (e) {
      return new Result(false, e as Error);
    }
  }

  /** @internal */
  private async finished(): Promise<void> {
    await this.transaction(async () => {
      await (await this.job).finishedBang();
      await this.destroyBang();
    });
  }
}
