import { type Base, type Relation } from "@blazetrails/activerecord";
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import {
  Struct,
  constSet,
  excBacktrace,
  excSetBacktrace,
  rbFArray,
  rbModName,
} from "@blazetrails/ruby-compat";
import { Execution, UndiscardableError } from "./execution.js";
import { SolidQueue } from "./solid-queue.js";
import { UnrecoverableError } from "./processes/unrecoverable-error.js";

export class Result extends Struct.new("success", "error") {
  declare success: boolean;
  declare error: Error | null;

  isSuccess(): boolean {
    return this.success;
  }
}

export class FinalizationError extends UnrecoverableError {
  constructor(claimedExecution: ClaimedExecution, { cause }: { cause: Error }) {
    super(
      `Failed to finalize claimed execution ${claimedExecution.id} (job ${claimedExecution.job_id}): ${rbModName(cause.constructor)}: ${cause.message}`,
    );
    if (excBacktrace(cause) != null) excSetBacktrace(this, excBacktrace(cause));
  }
}

export class ClaimedExecution extends Execution {
  declare static Result: typeof Result;
  declare static FinalizationError: typeof FinalizationError;

  declare static orphaned: () => Relation<ClaimedExecution>;
  declare process_id: unknown;
  declare process: Promise<Base | null>;

  static {
    constSet(SolidQueue, "ClaimedExecution", this);
    constSet(this, "Result", Result);
    constSet(this, "FinalizationError", FinalizationError);

    this.belongsTo("process");

    this.scope("orphaned", function () {
      return this.where().missing(":process");
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

  static async failAllWith(error: Error): Promise<ClaimedExecution[] | null> {
    const executions = await this.includes("job").toArray();
    if (executions.length === 0) return null;

    await SolidQueue.instrument("fail_many_claimed", {}, async (payload) => {
      for (const execution of executions) await execution.failedWith(error);

      payload["process_ids"] = [...new Set(executions.map((execution) => execution.process_id))];
      payload["job_ids"] = [...new Set(executions.map((execution) => execution.job_id))];
      payload["size"] = executions.length;
      payload["error"] = error;
    });
    return executions;
  }

  static override async discardAllInBatches(..._args: unknown[]): Promise<never> {
    throw new UndiscardableError("Can't discard jobs in progress");
  }

  static override async discardAllFromJobs(..._args: unknown[]): Promise<never> {
    throw new UndiscardableError("Can't discard jobs in progress");
  }

  async perform(): Promise<void> {
    const result = await this.execute();

    if (result.isSuccess()) {
      await this.finalizing(() => this.finished());
    } else {
      await this.finalizing(() => this.failedWith(result.error!));
      throw result.error;
    }
  }

  async release(): Promise<void> {
    const job = await this.job;
    await SolidQueue.instrument(
      "release_claimed",
      { job_id: job.id, process_id: this.process_id },
      async () => {
        await this.unlessAlreadyFinalized(async () => {
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
    await this.finalize(async () => {
      await (await this.job).failedWith(error);
    });
  }

  /** @internal */
  private async finalizing(block: () => Promise<unknown>): Promise<void> {
    try {
      await block();
    } catch (error) {
      if (await this.isStillClaimed()) {
        throw new FinalizationError(this, { cause: error as Error });
      }

      throw error;
    }
  }

  /** @internal */
  private async execute(): Promise<Result> {
    try {
      const job = await this.job;
      if (job.jobClass() == null) throw SolidQueue.Job!.ClassMissingError.for(job);

      await ActiveJobBase.execute({
        ...(job.arguments as object),
        provider_job_id: job.id,
      } as unknown as Parameters<typeof ActiveJobBase.execute>[0]);
      return new ClaimedExecution.Result(true, null);
    } catch (e) {
      return new ClaimedExecution.Result(false, e as Error);
    }
  }

  /** @internal */
  private async finished(): Promise<void> {
    await this.finalize(async () => {
      await (await this.job).finishedBang();
    });
  }

  /** @internal */
  private async finalize(block: () => Promise<unknown>): Promise<void> {
    const finalized = await this.unlessAlreadyFinalized(async () => {
      await block();
      await this.destroyBang();
      return true;
    });

    if (finalized) await (await this.job).unblockNextBlockedJob();
  }

  /** @internal */
  private async unlessAlreadyFinalized<T>(block: () => Promise<T>): Promise<T | false> {
    return (await this.transaction(async () => {
      if (!(await ClaimedExecution.unscoped().lock().findBy({ id: this.id }))) return false;

      return await block();
    })) as T | false;
  }

  /** @internal */
  private async isStillClaimed(): Promise<boolean> {
    try {
      return await ClaimedExecution.isExists(this.id);
    } catch {
      return true;
    }
  }
}
