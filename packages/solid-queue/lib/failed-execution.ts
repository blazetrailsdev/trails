import { include, isPresent, truncateBytes } from "@blazetrails/activesupport";
import { constSet, excBacktrace, rbModName } from "@blazetrails/ruby-compat";
import { takeWhile } from "@blazetrails/ruby-compat/enumerable";
import { Execution } from "./execution.js";
import {
  Dispatching,
  type ClassMethods as DispatchingClassMethods,
} from "./execution/dispatching.js";
import { SolidQueue } from "./solid-queue.js";
import type { Job } from "./job.js";
import { Batchable } from "./failed-execution/batchable.js";
import type { Relation } from "@blazetrails/activerecord";

export class FailedExecution extends Execution {
  declare static dispatchJobs: typeof DispatchingClassMethods.dispatchJobs;
  declare error: { [key: string]: unknown } | null;
  declare private _exception: Error | null | undefined;

  static {
    constSet(SolidQueue, "FailedExecution", this);
    include(this, Dispatching);
    include(this, Batchable);

    this.serialize("error", { coder: JSON });

    this.beforeSave(":expandErrorDetailsFromException", { if: ":exception" });
  }

  get exception(): Error | null {
    return this._exception ?? null;
  }

  set exception(value: Error | null) {
    this._exception = value;
  }

  static async retryAll(jobs: Relation<Job> | Job[]): Promise<unknown> {
    return await SolidQueue.instrument(
      "retry_all",
      { jobs_size: Array.isArray(jobs) ? jobs.length : await jobs.size() },
      async (payload) => {
        return await this.transaction(async () => {
          const jobIds = await this.lockAllFromJobs(jobs);
          await SolidQueue.Job!.where({ id: jobIds }).findEach({}, async (job) => {
            await job.resetExecutionCounters();
          });

          return (payload["size"] = await this.dispatchJobs(jobIds));
        });
      },
    );
  }

  async retry(): Promise<unknown> {
    const job = await this.job;
    return await SolidQueue.instrument("retry", { job_id: job.id }, async () => {
      await this.withLock(async () => {
        await job.resetExecutionCounters();
        await job.prepareForExecution();
        await this.destroyBang();
      });
    });
  }

  exceptionClass(): unknown {
    return this.error!["exception_class"];
  }

  message(): unknown {
    return this.error!["message"];
  }

  backtrace(): unknown {
    return this.error!["backtrace"];
  }

  /** @internal */
  private async expandErrorDetailsFromException(): Promise<void> {
    if (this.exception) {
      this.error = await this.fitIntoErrorColumn({
        exception_class: this.exceptionClassName(),
        message: this.exceptionMessage(),
        backtrace: this.exceptionBacktrace(),
      });
    }
  }

  /** @internal */
  private exceptionClassName(): string {
    return rbModName(this.exception!.constructor) as string;
  }

  /** @internal */
  private exceptionMessage(): string {
    return this.exception!.message;
  }

  /** @internal */
  private exceptionBacktrace(): string[] | null {
    return excBacktrace(this.exception!);
  }

  /** @internal */
  private async fitIntoErrorColumn(error: ErrorDetails): Promise<ErrorDetails> {
    const limit = await this.errorColumnLimit();
    if (limit != null && this.serializedErrorSize(error) > limit) {
      if (error.backtrace != null) error.backtrace = this.truncateBacktrace(error, limit);
      if (this.serializedErrorSize(error) > limit)
        error.message = this.truncateMessage(error, limit);
    }

    return error;
  }

  /** @internal */
  private async errorColumnLimit(): Promise<number | null> {
    const klass = this.constructor as typeof FailedExecution;
    const column = await klass
      .connectionPool()
      .withConnection(
        async (connection) => (await connection.schemaCache.columnsHash(klass.tableName!))["error"],
      );

    return column?.limit ?? null;
  }

  /** @internal */
  private serializedErrorSize(error: unknown): number {
    const klass = this.constructor as typeof FailedExecution;
    const serialized = klass.typeForAttribute("error").serialize(error);
    return new TextEncoder().encode(String(serialized)).length;
  }

  /** @internal */
  private truncateBacktrace(error: ErrorDetails, limit: number): string[] {
    let available = limit - this.serializedErrorSize({ ...error, backtrace: [] }) + 1;

    return takeWhile(
      error.backtrace!,
      (line) => (available -= this.serializedErrorSize(line) + 1) >= 0,
    );
  }

  /** @internal */
  private truncateMessage(error: ErrorDetails, limit: number): string {
    let message = String(error.message ?? "");
    let overflow: number;

    while (
      isPresent(message) &&
      (overflow = this.serializedErrorSize({ ...error, message }) - limit) > 0
    ) {
      const truncateTo = new TextEncoder().encode(message).length - overflow;

      message =
        truncateTo > new TextEncoder().encode(TRUNCATED_MESSAGE_OMISSION).length
          ? truncateBytes(message, truncateTo, { omission: TRUNCATED_MESSAGE_OMISSION })
          : "";
    }

    return message;
  }
}

const TRUNCATED_MESSAGE_OMISSION = "... (truncated)";

type ErrorDetails = { exception_class: string; message: string; backtrace: string[] | null };
