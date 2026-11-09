import { constantize, hours, ordinalize, seconds } from "@blazetrails/activesupport";
import {
  block,
  rbModName,
  rbObjClass,
  StandardError,
  toF,
  TopLevel,
  constSet,
} from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";
import { DeserializationError } from "../../../lib/arguments.js";
import { JobBuffer } from "../job-buffer.js";

export class DefaultsError extends StandardError {}
constSet(TopLevel, "DefaultsError", DefaultsError);
export class DisabledJitterError extends StandardError {}
constSet(TopLevel, "DisabledJitterError", DisabledJitterError);
export class ZeroJitterError extends StandardError {}
constSet(TopLevel, "ZeroJitterError", ZeroJitterError);
export class FirstRetryableErrorOfTwo extends StandardError {}
constSet(TopLevel, "FirstRetryableErrorOfTwo", FirstRetryableErrorOfTwo);
export class SecondRetryableErrorOfTwo extends StandardError {}
constSet(TopLevel, "SecondRetryableErrorOfTwo", SecondRetryableErrorOfTwo);
export class LongWaitError extends StandardError {}
constSet(TopLevel, "LongWaitError", LongWaitError);
export class ShortWaitTenAttemptsError extends StandardError {}
constSet(TopLevel, "ShortWaitTenAttemptsError", ShortWaitTenAttemptsError);
export class PolynomialWaitTenAttemptsError extends StandardError {}
constSet(TopLevel, "PolynomialWaitTenAttemptsError", PolynomialWaitTenAttemptsError);
export class CustomWaitTenAttemptsError extends StandardError {}
constSet(TopLevel, "CustomWaitTenAttemptsError", CustomWaitTenAttemptsError);
export class CustomCatchError extends StandardError {}
constSet(TopLevel, "CustomCatchError", CustomCatchError);
export class DiscardableError extends StandardError {}
constSet(TopLevel, "DiscardableError", DiscardableError);
export class FirstDiscardableErrorOfTwo extends StandardError {}
constSet(TopLevel, "FirstDiscardableErrorOfTwo", FirstDiscardableErrorOfTwo);
export class SecondDiscardableErrorOfTwo extends StandardError {}
constSet(TopLevel, "SecondDiscardableErrorOfTwo", SecondDiscardableErrorOfTwo);
export class CustomDiscardableError extends StandardError {}
constSet(TopLevel, "CustomDiscardableError", CustomDiscardableError);
export class UnlimitedRetryError extends StandardError {}
constSet(TopLevel, "UnlimitedRetryError", UnlimitedRetryError);

export class RetryJob extends Base {
  static toString(): string {
    return "RetryJob";
  }

  perform(raising: unknown, attempts: number, ..._rest: unknown[]): void {
    if (Array.isArray(raising)) raising = raising.shift();
    if (raising != null && raising !== false && this.executions! < attempts) {
      JobBuffer.add(`Raised ${String(raising)} for the ${ordinalize(this.executions!)} time`);
      const klass = constantize(raising as string) as new () => Error;
      throw new klass();
    } else {
      JobBuffer.add("Successfully completed job");
    }
  }
}
constSet(TopLevel, "RetryJob", RetryJob);

RetryJob.retryOn(DefaultsError);
RetryJob.retryOn(DisabledJitterError, { jitter: null });
RetryJob.retryOn(ZeroJitterError, { jitter: 0.0 });
RetryJob.retryOn(FirstRetryableErrorOfTwo, SecondRetryableErrorOfTwo, { attempts: 4 });
RetryJob.retryOn(LongWaitError, { wait: hours(1), attempts: 10 });
RetryJob.retryOn(ShortWaitTenAttemptsError, { wait: seconds(1), attempts: 10 });
RetryJob.retryOn(PolynomialWaitTenAttemptsError, { wait: ":polynomially_longer", attempts: 10 });
RetryJob.retryOn(CustomWaitTenAttemptsError, {
  wait: (executions: number) => executions * 2,
  attempts: 10,
});
RetryJob.retryOn(
  CustomCatchError,
  block((job: RetryJob, error: Error) =>
    JobBuffer.add(
      `Dealt with a job that failed to retry in a custom way after ${String(job.arguments[1])} attempts. Message: ${error.message}`,
    ),
  ),
);
RetryJob.retryOn(
  DeserializationError,
  block((job: RetryJob, error: Error) =>
    JobBuffer.add(`Raised ${rbModName(rbObjClass(error))} for the ${job.executions} time`),
  ),
);
RetryJob.retryOn(UnlimitedRetryError, { attempts: ":unlimited" });

RetryJob.discardOn(DiscardableError);
RetryJob.discardOn(FirstDiscardableErrorOfTwo, SecondDiscardableErrorOfTwo);
RetryJob.discardOn(
  CustomDiscardableError,
  block((_job: RetryJob, error: Error) =>
    JobBuffer.add(`Dealt with a job that was discarded in a custom way. Message: ${error.message}`),
  ),
);

RetryJob.beforeEnqueue((job: RetryJob) => {
  if (job.arguments.includes(":log_scheduled_at") && job.scheduledAt != null) {
    JobBuffer.add(`Next execution scheduled at ${toF(job.scheduledAt)}`);
  }
});
