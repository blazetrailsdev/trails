import { Concern, extend } from "@blazetrails/activesupport";
import { RecordNotUnique, type Relation } from "@blazetrails/activerecord";
import { classModule } from "@blazetrails/ruby-compat";
import type { Job } from "../job.js";
import { FailedExecution } from "../failed-execution.js";

export class Retryable {
  static readonly [classModule] = true;
  declare static failed: () => Relation<Job>;
  declare id: number;
  declare arguments: { [key: string]: unknown };
  declare failedExecution: Promise<FailedExecution | null>;
  declare saveBang: () => Promise<unknown>;

  async retry(): Promise<unknown> {
    return await (await this.failedExecution)?.retry();
  }

  async failedWith(exception: Error): Promise<unknown> {
    try {
      return await FailedExecution.transaction(
        async () => await FailedExecution.createBang({ job_id: this.id, exception: exception }),
        { requiresNew: true },
      );
    } catch (e) {
      if (!(e instanceof RecordNotUnique)) throw e;
      let failedExecution: FailedExecution | null;
      if ((failedExecution = await FailedExecution.findBy({ job_id: this.id }))) {
        failedExecution.exception = exception;
        return await failedExecution.saveBang();
      } else {
        return await this.retry();
      }
    }
  }

  async resetExecutionCounters(): Promise<unknown> {
    this.arguments["executions"] = 0;
    this.arguments["exception_executions"] = {};
    return await this.saveBang();
  }
}
extend(Retryable, Concern);
(
  Retryable as unknown as {
    included(base: null, block: (this: typeof Job) => void): void;
  }
).included(null, function (this: typeof Job) {
  this.hasOne("failedExecution");

  this.scope("failed", function () {
    return this.includes("failedExecution")
      .where()
      .not({ failedExecution: { id: null } });
  });
});
