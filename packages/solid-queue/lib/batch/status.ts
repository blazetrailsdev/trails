import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import type { Relation } from "@blazetrails/activerecord";
import type { Time } from "@blazetrails/date";
import { classModule } from "@blazetrails/ruby-compat";
import type { Batch } from "../batch.js";
import type { Job } from "../job.js";

export class Status {
  static readonly [classModule] = true;
  declare finished_at: Time | null;
  declare failed_at: Time | null;
  declare enqueued_at: Time | null;
  declare total_jobs: number;
  declare jobs: Relation<Job>;
  declare batchExecutions: Relation<import("../batch-execution.js").BatchExecution>;
  declare readAttribute: (name: string) => unknown;

  status(): string {
    if (this.isFinished()) {
      return this.isFailed() ? "failed" : "completed";
    } else if (this.isEnqueued()) {
      return "enqueued";
    } else {
      return "pending";
    }
  }

  isFailed(): boolean {
    return isPresent(this.failed_at);
  }

  isSucceeded(): boolean {
    return this.isFinished() && !this.isFailed();
  }

  isFinished(): boolean {
    return isPresent(this.finished_at);
  }

  isEnqueued(): boolean {
    return isPresent(this.enqueued_at);
  }

  async completedJobs(): Promise<number> {
    return this.isFinished()
      ? (this.readAttribute("completed_jobs") as number)
      : Math.max(this.total_jobs - (await this.pendingJobs()) - (await this.failedJobs()), 0);
  }

  async failedJobs(): Promise<number> {
    return this.isFinished()
      ? (this.readAttribute("failed_jobs") as number)
      : await this.jobs.failed().count();
  }

  async pendingJobs(): Promise<number> {
    return this.isFinished() ? 0 : await this.batchExecutions.count();
  }

  async progressPercentage(): Promise<number> {
    if (this.total_jobs === 0) return 0;
    const percentage =
      (Math.max(this.total_jobs - (await this.pendingJobs()), 0) * 100.0) / this.total_jobs;
    return Math.round(percentage * 100) / 100;
  }
}
extend(Status, Concern);
(
  Status as unknown as {
    included(base: null, block: (this: typeof Batch) => void): void;
  }
).included(null, function (this: typeof Batch) {
  this.scope("finished", function () {
    return this.where().not({ finished_at: null });
  });
  this.scope("succeeded", function (this: Relation<Batch>) {
    return this.finished().where({ failed_at: null });
  });
  this.scope("unfinished", function () {
    return this.where({ finished_at: null });
  });
  this.scope("failed", function () {
    return this.where().not({ failed_at: null });
  });
  this.scope("enqueued", function () {
    return this.where().not({ enqueued_at: null });
  });
});
