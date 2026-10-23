import { registerModel } from "@blazetrails/activerecord";
import { include, isPresent } from "@blazetrails/activesupport";
import { excBacktrace, rbModName } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import {
  Dispatching,
  type ClassMethods as DispatchingClassMethods,
} from "./execution/dispatching.js";
import { SolidQueue } from "./solid-queue.js";
import type { Job } from "./job.js";
import type { Relation } from "@blazetrails/activerecord";

export class FailedExecution extends Execution {
  declare static dispatchJobs: typeof DispatchingClassMethods.dispatchJobs;
  static readonly JSON_OVERHEAD = 256;
  declare error: { [key: string]: unknown } | null;
  declare private _exception: Error | null | undefined;

  static {
    registerModel(this);
    include(this, Dispatching);

    this.serialize("error", { coder: JSON });

    this.beforeCreate(function (this: FailedExecution) {
      return this.expandErrorDetailsFromException();
    });
  }

  get exception(): Error | null {
    return this._exception ?? null;
  }

  set exception(value: Error | null) {
    this._exception = value;
  }

  static async retryAll(jobs: Relation<Job>): Promise<unknown> {
    return await SolidQueue.instrument(
      "retry_all",
      { jobs_size: await jobs.size() },
      async (payload) => {
        return await this.transaction(async () => {
          return (payload["size"] = await this.dispatchJobs(await this.lockAllFromJobs(jobs)));
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
      this.error = {
        exception_class: this.exceptionClassName(),
        message: this.exceptionMessage(),
        backtrace: await this.exceptionBacktrace(),
      };
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
  private async exceptionBacktrace(): Promise<string[] | null> {
    const limit = await this.determineBacktraceSizeLimit();
    const backtrace = excBacktrace(this.exception!);
    if (limit != null && new TextEncoder().encode(JSON.stringify(backtrace)).length > limit) {
      return this.truncateBacktrace(backtrace!, limit);
    } else {
      return backtrace;
    }
  }

  /** @internal */
  private async determineBacktraceSizeLimit(): Promise<number | null> {
    const klass = this.constructor as typeof FailedExecution;
    const column = (await (await klass.connection)!.schemaCache.columnsHash(klass.tableName!))[
      "error"
    ];
    if (isPresent(column.limit)) {
      return (
        column.limit! -
        new TextEncoder().encode(this.exceptionClassName()).length -
        new TextEncoder().encode(this.exceptionMessage()).length -
        FailedExecution.JSON_OVERHEAD
      );
    }
    return null;
  }

  /** @internal */
  private truncateBacktrace(lines: string[], limit: number): string[] {
    const truncatedBacktrace: string[] = [];
    for (const line of lines) {
      truncatedBacktrace.push(line);
      if (new TextEncoder().encode(JSON.stringify(truncatedBacktrace)).length > limit) {
        truncatedBacktrace.pop();
        break;
      }
    }
    return truncatedBacktrace;
  }
}
