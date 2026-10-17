import { ordinalize, constantize } from "@blazetrails/activesupport";
import {
  rbObjAsString,
  registerConstant,
  StandardError,
  rbFSend,
  block as rbBlock,
} from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { rbBinop, rbMakeException } from "../../codegen-runtime.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class AfterDiscardRetryJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(raising: any, attempts: any): any {
    if (rbBinop(this.executions, "<", attempts)) {
      add(
        `Raised ${rbObjAsString(raising)} for the ${rbObjAsString(ordinalize(this.executions))} time`,
      );
      throw rbMakeException(constantize(raising));
    } else {
      return add("Successfully completed job");
    }
  }
}
registerConstant("AfterDiscardRetryJob", AfterDiscardRetryJob);
{
  AfterDiscardRetryJob.afterDiscard(function (this: any, _job?: any, error?: any) {
    return add(`Ran after_discard for job. Message: ${rbObjAsString(error.message)}`);
  });
}
export class UnhandledError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::UnhandledError", UnhandledError);
export class DefaultsError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::DefaultsError", DefaultsError);
export class CustomCatchError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::CustomCatchError", CustomCatchError);
export class DiscardableError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::DiscardableError", DiscardableError);
export class CustomDiscardableError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::CustomDiscardableError", CustomDiscardableError);
export class AfterDiscardError extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::AfterDiscardError", AfterDiscardError);
export class ChildAfterDiscardError extends AfterDiscardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("AfterDiscardRetryJob::ChildAfterDiscardError", ChildAfterDiscardError);
AfterDiscardRetryJob.retryOn(DefaultsError);
AfterDiscardRetryJob.retryOn(
  CustomCatchError,
  rbBlock((job?: any, error?: any) =>
    add(
      `Dealt with a job that failed to retry in a custom way after ${rbObjAsString(rbFSend(job.arguments, "second"))} attempts. Message: ${rbObjAsString(error.message)}`,
    ),
  ),
);
AfterDiscardRetryJob.retryOn(AfterDiscardError);
AfterDiscardRetryJob.retryOn(ChildAfterDiscardError);
AfterDiscardRetryJob.discardOn(DiscardableError);
AfterDiscardRetryJob.discardOn(
  CustomDiscardableError,
  rbBlock((_job?: any, error?: any) =>
    add(
      `Dealt with a job that was discarded in a custom way. Message: ${rbObjAsString(error.message)}`,
    ),
  ),
);
