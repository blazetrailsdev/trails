import { ordinalize, constantize, Duration } from "@blazetrails/activesupport";
import {
  StandardError,
  registerConstant,
  rtest,
  rbObjAsString,
  rbFSend,
  block as rbBlock,
  rbObjClassname,
} from "@blazetrails/ruby-compat";
import { DeserializationError } from "../../arguments.js";
import { Base } from "../../base.js";
import { rbEnum, rbBinop, rbMakeException, rbToF } from "../../codegen-runtime.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class DefaultsError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("DefaultsError", DefaultsError);
export class DisabledJitterError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("DisabledJitterError", DisabledJitterError);
export class ZeroJitterError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ZeroJitterError", ZeroJitterError);
export class FirstRetryableErrorOfTwo extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("FirstRetryableErrorOfTwo", FirstRetryableErrorOfTwo);
export class SecondRetryableErrorOfTwo extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("SecondRetryableErrorOfTwo", SecondRetryableErrorOfTwo);
export class LongWaitError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("LongWaitError", LongWaitError);
export class ShortWaitTenAttemptsError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ShortWaitTenAttemptsError", ShortWaitTenAttemptsError);
export class PolynomialWaitTenAttemptsError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("PolynomialWaitTenAttemptsError", PolynomialWaitTenAttemptsError);
export class CustomWaitTenAttemptsError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("CustomWaitTenAttemptsError", CustomWaitTenAttemptsError);
export class CustomCatchError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("CustomCatchError", CustomCatchError);
export class DiscardableError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("DiscardableError", DiscardableError);
export class FirstDiscardableErrorOfTwo extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("FirstDiscardableErrorOfTwo", FirstDiscardableErrorOfTwo);
export class SecondDiscardableErrorOfTwo extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("SecondDiscardableErrorOfTwo", SecondDiscardableErrorOfTwo);
export class CustomDiscardableError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("CustomDiscardableError", CustomDiscardableError);
export class UnlimitedRetryError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("UnlimitedRetryError", UnlimitedRetryError);
export class RetryJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(raising: any, attempts: any, ...rest: any[]): any {
    if (Array.isArray(raising)) {
      raising = raising.shift();
    }
    if (rtest(raising) && rbBinop(this.executions, "<", attempts)) {
      add(
        `Raised ${rbObjAsString(raising)} for the ${rbObjAsString(ordinalize(this.executions))} time`,
      );
      throw rbMakeException(constantize(raising));
    } else {
      return add("Successfully completed job");
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
    wait: (executions?: any) => rbBinop(executions, "*", 2),
    attempts: 10,
  });
  RetryJob.retryOn(
    CustomCatchError,
    rbBlock((job?: any, error?: any) =>
      add(
        `Dealt with a job that failed to retry in a custom way after ${rbObjAsString(rbFSend(job.arguments, "second"))} attempts. Message: ${rbObjAsString(error.message)}`,
      ),
    ),
  );
  RetryJob.retryOn(
    DeserializationError,
    rbBlock((job?: any, error?: any) =>
      add(`Raised ${rbObjClassname(error)} for the ${rbObjAsString(job.executions)} time`),
    ),
  );
  RetryJob.retryOn(UnlimitedRetryError, { attempts: "unlimited" });
  RetryJob.discardOn(DiscardableError);
  RetryJob.discardOn(FirstDiscardableErrorOfTwo, SecondDiscardableErrorOfTwo);
  RetryJob.discardOn(
    CustomDiscardableError,
    rbBlock((job?: any, error?: any) =>
      add(
        `Dealt with a job that was discarded in a custom way. Message: ${rbObjAsString(error.message)}`,
      ),
    ),
  );
  RetryJob.beforeEnqueue(
    rbBlock(function (this: any, job?: any) {
      if (rbEnum(job.arguments).includes("log_scheduled_at") && rtest(job.scheduledAt)) {
        return add(`Next execution scheduled at ${rbToF(job.scheduledAt)}`);
      }
      return null;
    }),
  );
}
