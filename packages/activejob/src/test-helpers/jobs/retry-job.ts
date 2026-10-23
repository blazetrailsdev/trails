import { ordinalize, constantize, Duration } from "@blazetrails/activesupport";
import {
  StandardError,
  registerConstant,
  RuntimeError,
  rbFSend,
  rbObjClassname,
  Enumerator,
} from "@blazetrails/ruby-compat";
import { DeserializationError } from "../../arguments.js";
import { Base } from "../../base.js";
import { rbBinop } from "../../codegen-runtime.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class DefaultsError extends StandardError {
  static toString(): string {
    return "DefaultsError";
  }
}
registerConstant("DefaultsError", DefaultsError);
export class DisabledJitterError extends StandardError {
  static toString(): string {
    return "DisabledJitterError";
  }
}
registerConstant("DisabledJitterError", DisabledJitterError);
export class ZeroJitterError extends StandardError {
  static toString(): string {
    return "ZeroJitterError";
  }
}
registerConstant("ZeroJitterError", ZeroJitterError);
export class FirstRetryableErrorOfTwo extends StandardError {
  static toString(): string {
    return "FirstRetryableErrorOfTwo";
  }
}
registerConstant("FirstRetryableErrorOfTwo", FirstRetryableErrorOfTwo);
export class SecondRetryableErrorOfTwo extends StandardError {
  static toString(): string {
    return "SecondRetryableErrorOfTwo";
  }
}
registerConstant("SecondRetryableErrorOfTwo", SecondRetryableErrorOfTwo);
export class LongWaitError extends StandardError {
  static toString(): string {
    return "LongWaitError";
  }
}
registerConstant("LongWaitError", LongWaitError);
export class ShortWaitTenAttemptsError extends StandardError {
  static toString(): string {
    return "ShortWaitTenAttemptsError";
  }
}
registerConstant("ShortWaitTenAttemptsError", ShortWaitTenAttemptsError);
export class PolynomialWaitTenAttemptsError extends StandardError {
  static toString(): string {
    return "PolynomialWaitTenAttemptsError";
  }
}
registerConstant("PolynomialWaitTenAttemptsError", PolynomialWaitTenAttemptsError);
export class CustomWaitTenAttemptsError extends StandardError {
  static toString(): string {
    return "CustomWaitTenAttemptsError";
  }
}
registerConstant("CustomWaitTenAttemptsError", CustomWaitTenAttemptsError);
export class CustomCatchError extends StandardError {
  static toString(): string {
    return "CustomCatchError";
  }
}
registerConstant("CustomCatchError", CustomCatchError);
export class DiscardableError extends StandardError {
  static toString(): string {
    return "DiscardableError";
  }
}
registerConstant("DiscardableError", DiscardableError);
export class FirstDiscardableErrorOfTwo extends StandardError {
  static toString(): string {
    return "FirstDiscardableErrorOfTwo";
  }
}
registerConstant("FirstDiscardableErrorOfTwo", FirstDiscardableErrorOfTwo);
export class SecondDiscardableErrorOfTwo extends StandardError {
  static toString(): string {
    return "SecondDiscardableErrorOfTwo";
  }
}
registerConstant("SecondDiscardableErrorOfTwo", SecondDiscardableErrorOfTwo);
export class CustomDiscardableError extends StandardError {
  static toString(): string {
    return "CustomDiscardableError";
  }
}
registerConstant("CustomDiscardableError", CustomDiscardableError);
export class UnlimitedRetryError extends StandardError {
  static toString(): string {
    return "UnlimitedRetryError";
  }
}
registerConstant("UnlimitedRetryError", UnlimitedRetryError);
export class RetryJob extends Base {
  static toString(): string {
    return "RetryJob";
  }

  perform(raising: unknown, attempts: number, ...rest: unknown[]) {
    if (Array.isArray(raising)) {
      raising = raising.shift();
    }
    if (raising != null && raising !== false && rbBinop(this.executions, "<", attempts)) {
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
registerConstant("RetryJob", RetryJob);
{
  RetryJob.retryOn(DefaultsError);
  RetryJob.retryOn(DisabledJitterError, { jitter: null });
  RetryJob.retryOn(ZeroJitterError, { jitter: new Number(0.0) });
  RetryJob.retryOn(FirstRetryableErrorOfTwo, SecondRetryableErrorOfTwo, { attempts: 4 });
  RetryJob.retryOn(LongWaitError, { wait: Duration.hours(1), attempts: 10 });
  RetryJob.retryOn(ShortWaitTenAttemptsError, { wait: Duration.seconds(1), attempts: 10 });
  RetryJob.retryOn(PolynomialWaitTenAttemptsError, { wait: "polynomially_longer", attempts: 10 });
  RetryJob.retryOn(CustomWaitTenAttemptsError, {
    wait: (executions?: unknown) => rbBinop(executions, "*", 2),
    attempts: 10,
  });
  RetryJob.retryOn(CustomCatchError, (job: unknown, error: unknown) =>
    JobBuffer.add(
      `Dealt with a job that failed to retry in a custom way after ${rbFSend(job.arguments, "second") ?? ""} attempts. Message: ${error.message ?? ""}`,
    ),
  );
  RetryJob.retryOn(DeserializationError, (job: unknown, error: unknown) =>
    JobBuffer.add(`Raised ${rbObjClassname(error)} for the ${job.executions ?? ""} time`),
  );
  RetryJob.retryOn(UnlimitedRetryError, { attempts: "unlimited" });
  RetryJob.discardOn(DiscardableError);
  RetryJob.discardOn(FirstDiscardableErrorOfTwo, SecondDiscardableErrorOfTwo);
  RetryJob.discardOn(CustomDiscardableError, (job: unknown, error: unknown) =>
    JobBuffer.add(
      `Dealt with a job that was discarded in a custom way. Message: ${error.message ?? ""}`,
    ),
  );
  RetryJob.beforeEnqueue(function (job: unknown) {
    if (
      (job.arguments instanceof globalThis.Set ||
      job.arguments instanceof globalThis.Map ||
      job.arguments instanceof Enumerator
        ? [...job.arguments]
        : Object.getPrototypeOf(job.arguments) === Object.prototype
          ? Object.entries(job.arguments as object)
          : (job.arguments as unknown[])
      ).includes("log_scheduled_at") &&
      job.scheduledAt != null &&
      job.scheduledAt !== false
    ) {
      return JobBuffer.add(`Next execution scheduled at ${Number(job.scheduledAt)}`);
    }
    return null;
  });
}
