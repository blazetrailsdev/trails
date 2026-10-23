import { Concern, extend } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import { classModule } from "@blazetrails/ruby-compat";
import type { Job } from "../job.js";
import { FailedExecution } from "../failed-execution.js";

export class Retryable {
  static readonly [classModule] = true;
  declare id: number;
  declare arguments: { [key: string]: unknown };
  declare failedExecution: Promise<FailedExecution | null>;
  declare saveBang: () => Promise<unknown>;

  async retry(): Promise<unknown> {
    return await (await this.failedExecution)?.retry();
  }

  async failedWith(exception: unknown): Promise<Base> {
    return (await FailedExecution.createOrFindByBang({ job_id: this.id, exception }))!;
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
      .not({ failed_execution: { id: null } });
  });
});
