import { constantize, hours, ordinalize, seconds } from "@blazetrails/activesupport";
import {
  block,
  rbModName,
  rbObjClass,
  registerConstant,
  StandardError,
  toF,
} from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { DeserializationError } from "../../arguments.js";
import { JobBuffer } from "../support/job-buffer.js";

export class DefaultsError extends StandardError {}
registerConstant("DefaultsError", DefaultsError);
export class DisabledJitterError extends StandardError {}
registerConstant("DisabledJitterError", DisabledJitterError);
export class ZeroJitterError extends StandardError {}
registerConstant("ZeroJitterError", ZeroJitterError);
export class FirstRetryableErrorOfTwo extends StandardError {}
registerConstant("FirstRetryableErrorOfTwo", FirstRetryableErrorOfTwo);
export class SecondRetryableErrorOfTwo extends StandardError {}
registerConstant("SecondRetryableErrorOfTwo", SecondRetryableErrorOfTwo);
export class LongWaitError extends StandardError {}
registerConstant("LongWaitError", LongWaitError);
export class ShortWaitTenAttemptsError extends StandardError {}
registerConstant("ShortWaitTenAttemptsError", ShortWaitTenAttemptsError);
export class PolynomialWaitTenAttemptsError extends StandardError {}
registerConstant("PolynomialWaitTenAttemptsError", PolynomialWaitTenAttemptsError);
export class CustomWaitTenAttemptsError extends StandardError {}
registerConstant("CustomWaitTenAttemptsError", CustomWaitTenAttemptsError);
export class CustomCatchError extends StandardError {}
registerConstant("CustomCatchError", CustomCatchError);
export class DiscardableError extends StandardError {}
registerConstant("DiscardableError", DiscardableError);
export class FirstDiscardableErrorOfTwo extends StandardError {}
registerConstant("FirstDiscardableErrorOfTwo", FirstDiscardableErrorOfTwo);
export class SecondDiscardableErrorOfTwo extends StandardError {}
registerConstant("SecondDiscardableErrorOfTwo", SecondDiscardableErrorOfTwo);
export class CustomDiscardableError extends StandardError {}
registerConstant("CustomDiscardableError", CustomDiscardableError);
export class UnlimitedRetryError extends StandardError {}
registerConstant("UnlimitedRetryError", UnlimitedRetryError);

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
registerConstant("RetryJob", RetryJob);

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
