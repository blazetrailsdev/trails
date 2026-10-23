import { ordinalize, constantize } from "@blazetrails/activesupport";
import { RuntimeError, registerConstant, StandardError, rbFSend } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { rbBinop } from "../../codegen-runtime.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class AfterDiscardRetryJob extends Base {
  static toString(): string {
    return "AfterDiscardRetryJob";
  }

  perform(raising: string, attempts: number) {
    if (rbBinop(this.executions, "<", attempts)) {
      JobBuffer.add(`Raised ${raising ?? ""} for the ${ordinalize(this.executions!) ?? ""} time`);
      throw ((x) =>
        typeof x === "string" ? new RuntimeError(x) : typeof x === "function" ? new x() : x)(
        constantize(raising),
      );
    } else {
      return JobBuffer.add("Successfully completed job");
    }
  }
}
registerConstant("AfterDiscardRetryJob", AfterDiscardRetryJob);
{
  AfterDiscardRetryJob.afterDiscard(function (_job, error) {
    return JobBuffer.add(`Ran after_discard for job. Message: ${error.message ?? ""}`);
  });
}
export class UnhandledError extends StandardError {
  static toString(): string {
    return "AfterDiscardRetryJob::UnhandledError";
  }
}
registerConstant("AfterDiscardRetryJob::UnhandledError", UnhandledError);
export class DefaultsError extends StandardError {
  static toString(): string {
    return "AfterDiscardRetryJob::DefaultsError";
  }
}
registerConstant("AfterDiscardRetryJob::DefaultsError", DefaultsError);
export class CustomCatchError extends StandardError {
  static toString(): string {
    return "AfterDiscardRetryJob::CustomCatchError";
  }
}
registerConstant("AfterDiscardRetryJob::CustomCatchError", CustomCatchError);
export class DiscardableError extends StandardError {
  static toString(): string {
    return "AfterDiscardRetryJob::DiscardableError";
  }
}
registerConstant("AfterDiscardRetryJob::DiscardableError", DiscardableError);
export class CustomDiscardableError extends StandardError {
  static toString(): string {
    return "AfterDiscardRetryJob::CustomDiscardableError";
  }
}
registerConstant("AfterDiscardRetryJob::CustomDiscardableError", CustomDiscardableError);
export class AfterDiscardError extends StandardError {
  static toString(): string {
    return "AfterDiscardRetryJob::AfterDiscardError";
  }
}
registerConstant("AfterDiscardRetryJob::AfterDiscardError", AfterDiscardError);
export class ChildAfterDiscardError extends AfterDiscardError {
  static toString(): string {
    return "AfterDiscardRetryJob::ChildAfterDiscardError";
  }
}
registerConstant("AfterDiscardRetryJob::ChildAfterDiscardError", ChildAfterDiscardError);
AfterDiscardRetryJob.retryOn(DefaultsError);
AfterDiscardRetryJob.retryOn(CustomCatchError, (job: unknown, error: unknown) =>
  JobBuffer.add(
    `Dealt with a job that failed to retry in a custom way after ${rbFSend(job.arguments, "second") ?? ""} attempts. Message: ${error.message ?? ""}`,
  ),
);
AfterDiscardRetryJob.retryOn(AfterDiscardError);
AfterDiscardRetryJob.retryOn(ChildAfterDiscardError);
AfterDiscardRetryJob.discardOn(DiscardableError);
AfterDiscardRetryJob.discardOn(CustomDiscardableError, (_job: unknown, error: unknown) =>
  JobBuffer.add(
    `Dealt with a job that was discarded in a custom way. Message: ${error.message ?? ""}`,
  ),
);
