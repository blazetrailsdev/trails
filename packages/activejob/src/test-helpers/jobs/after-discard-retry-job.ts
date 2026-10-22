import { constantize, ordinalize } from "@blazetrails/activesupport";
import { block, rbModConstSet, registerConstant, StandardError } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";

class UnhandledError extends StandardError {}
class DefaultsError extends StandardError {}
class CustomCatchError extends StandardError {}
class DiscardableError extends StandardError {}
class CustomDiscardableError extends StandardError {}
class AfterDiscardError extends StandardError {}
class ChildAfterDiscardError extends AfterDiscardError {}

export class AfterDiscardRetryJob extends Base {
  static toString(): string {
    return "AfterDiscardRetryJob";
  }

  perform(raising: string, attempts: number): void {
    if (this.executions! < attempts) {
      JobBuffer.add(`Raised ${raising} for the ${ordinalize(this.executions!)} time`);
      const klass = constantize(raising) as new () => Error;
      throw new klass();
    } else {
      JobBuffer.add("Successfully completed job");
    }
  }
}
registerConstant("AfterDiscardRetryJob", AfterDiscardRetryJob);
for (const [name, klass] of Object.entries({
  UnhandledError,
  DefaultsError,
  CustomCatchError,
  DiscardableError,
  CustomDiscardableError,
  AfterDiscardError,
  ChildAfterDiscardError,
})) {
  rbModConstSet(AfterDiscardRetryJob, name, klass);
}

AfterDiscardRetryJob.retryOn(DefaultsError);
AfterDiscardRetryJob.retryOn(
  CustomCatchError,
  block((job: AfterDiscardRetryJob, error: Error) =>
    JobBuffer.add(
      `Dealt with a job that failed to retry in a custom way after ${String(job.arguments[1])} attempts. Message: ${error.message}`,
    ),
  ),
);
AfterDiscardRetryJob.retryOn(AfterDiscardError);
AfterDiscardRetryJob.retryOn(ChildAfterDiscardError);

AfterDiscardRetryJob.discardOn(DiscardableError);
AfterDiscardRetryJob.discardOn(
  CustomDiscardableError,
  block((_job: AfterDiscardRetryJob, error: Error) =>
    JobBuffer.add(`Dealt with a job that was discarded in a custom way. Message: ${error.message}`),
  ),
);

AfterDiscardRetryJob.afterDiscard((_job: unknown, error: unknown) =>
  JobBuffer.add(`Ran after_discard for job. Message: ${(error as Error).message}`),
);
