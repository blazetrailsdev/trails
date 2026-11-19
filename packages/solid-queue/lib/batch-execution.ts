import type { Base, Relation } from "@blazetrails/activerecord";
import { StandardError, constSet, toI } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import { SolidQueue } from "./solid-queue.js";
import type { Job } from "./job.js";

export class BatchExecution extends Execution {
  declare batch_id: number;
  declare static withFinishedJobs: () => Relation<BatchExecution>;
  declare static withFailedJobs: () => Relation<BatchExecution>;

  static {
    constSet(SolidQueue, "BatchExecution", this);

    this.assumableAttributesFromJob = ["batch_id"];

    this.belongsTo("batch");

    this.scope("withFinishedJobs", function () {
      return this.joins(":job").merge(SolidQueue.Job!.finished());
    });
    this.scope("withFailedJobs", function () {
      return this.joins({ job: "failedExecution" });
    });

    this.afterCommit(":finishBatch", { on: "destroy" });
  }

  static override async createAllFromJobs(jobs: Iterable<Base>): Promise<unknown> {
    const jobsByBatchId = new Map<number, Job[]>();
    for (const job of jobs as Iterable<Job>) {
      if (!(await job.isBatched())) continue;
      if (!jobsByBatchId.has(job.batch_id!)) jobsByBatchId.set(job.batch_id!, []);
      jobsByBatchId.get(job.batch_id!)!.push(job);
    }

    for (const [batchId, jobsInBatch] of jobsByBatchId) {
      if (await this.attemptToUpdateTotalJobs(batchId, jobsInBatch)) {
        await super.createAllFromJobs(jobsInBatch);
      } else {
        throw new SolidQueue.Batch!.AlreadyFinished(
          "Can't add jobs into an already finished batch",
        );
      }
    }
    return jobsByBatchId;
  }

  /** @internal */
  private static async attemptToUpdateTotalJobs(batchId: number, jobs: Job[]): Promise<boolean> {
    const newJobsCount = this.countNewJobsAmong(jobs);
    const updated = await SolidQueue.Batch!.where({ id: batchId })
      .unfinished()
      .updateAll(["total_jobs = total_jobs + ?", newJobsCount]);
    return updated > 0;
  }

  /** @internal */
  private static countNewJobsAmong(jobs: Job[]): number {
    return new Set(
      jobs.filter((job) => !(toI(job.arguments["executions"]) > 0)).map((job) => job.active_job_id),
    ).size;
  }

  /** @internal */
  private async finishBatch(): Promise<void> {
    try {
      const batch = await SolidQueue.Batch!.select("id", "finished_at", "enqueued_at").findBy({
        id: this.batch_id,
      });
      if (batch != null) {
        await batch.finish();
      }
    } catch (error) {
      if (!(error instanceof StandardError)) throw error;
      await SolidQueue.instrument("batch_progress_error", {
        batch_id: this.batch_id,
        job_id: this.job_id,
        error: error,
      });
    }
  }
}
