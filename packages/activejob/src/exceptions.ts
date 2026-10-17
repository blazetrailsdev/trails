import { Duration, classAttribute, Concern } from "@blazetrails/activesupport";
import {
  slice,
  rbEqual,
  rtest,
  rbObjIsKindOf,
  rbCInteger,
  toI,
  rbObjIsProc,
  RuntimeError,
  rbInspect,
  rbObjAsString,
  StandardError,
  isEmpty,
  last,
  extend,
  Module,
  rbModConstSet,
  rbBlockGivenP,
  block as rbBlock,
} from "@blazetrails/ruby-compat";
import {
  RubyObject,
  rbBinop,
  rbKernel,
  jsInstanceExec,
  rbMakeException,
  rbExtractKeywords,
} from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export async function retryJob(this: any, options: any = {}): Promise<any> {
  return await this.instrument(
    "enqueue_retry",
    slice(options, "error", "wait"),
    async () => await this.enqueue(options),
  );
}

export const JITTER_DEFAULT: any = new RubyObject();

/** @internal */
export function determineDelay(
  this: any,
  { secondsOrDurationOrAlgorithm, executions, jitter = JITTER_DEFAULT }: any = {},
): any {
  let delay: any, delayJitter: any, algorithm: any;
  jitter = rbEqual(jitter, JITTER_DEFAULT)
    ? this.constructor.retryJitter
    : rtest(jitter)
      ? jitter
      : 0;
  if (secondsOrDurationOrAlgorithm === "polynomially_longer") {
    delay = executions ** 4;
    delayJitter = this.determineJitterForDelay(delay, jitter);
    return rbBinop(rbBinop(delay, "+", delayJitter), "+", 2);
  } else if (
    secondsOrDurationOrAlgorithm instanceof Duration ||
    rbObjIsKindOf(secondsOrDurationOrAlgorithm, rbCInteger)
  ) {
    delay = toI(secondsOrDurationOrAlgorithm);
    delayJitter = this.determineJitterForDelay(delay, jitter);
    return delay + delayJitter;
  } else if (rbObjIsProc(secondsOrDurationOrAlgorithm)) {
    algorithm = secondsOrDurationOrAlgorithm;
    return algorithm(executions);
  } else {
    throw new RuntimeError(
      `Couldn't determine a delay based on ${rbInspect(secondsOrDurationOrAlgorithm)}`,
    );
  }
}

/** @internal */
export function determineJitterForDelay(this: any, delay: any, jitter: any): any {
  if (jitter === 0) {
    return 0;
  }
  return rbBinop(rbBinop(rbKernel.rand(), "*", delay), "*", jitter);
}

/** @internal */
export function executionsFor(this: any, exceptions: any): any {
  if (rtest(this.exceptionExecutions)) {
    return (this.exceptionExecutions[rbObjAsString(exceptions)] = rbBinop(
      this.exceptionExecutions[rbObjAsString(exceptions)] ?? 0,
      "+",
      1,
    ));
  } else {
    return this.executions;
  }
}

/** @internal */
export function runAfterDiscardProcs(this: any, exception: any): any {
  const exceptions: any = [];
  for (const blk of this.afterDiscardProcs) {
    try {
      jsInstanceExec(this, this, exception, blk);
    } catch (e: any) {
      if (e instanceof StandardError) {
        exceptions.push(e);
      } else {
        throw e;
      }
    }
  }
  if (!isEmpty(exceptions)) {
    throw rbMakeException(last(exceptions));
  }
  return null;
}

export const Exceptions: any = new Module((mod: any) => {
  mod.defineMethod("retryJob", retryJob);
  mod.defineMethod("determineDelay", determineDelay);
  mod.defineMethod("determineJitterForDelay", determineJitterForDelay);
  mod.defineMethod("executionsFor", executionsFor);
  mod.defineMethod("runAfterDiscardProcs", runAfterDiscardProcs);
});
rbModConstSet(Exceptions, "JITTER_DEFAULT", JITTER_DEFAULT);
extend(Exceptions, Concern);
Exceptions.included(null, function (this: any): void {
  const base = this;
  classAttribute.call(base, "retryJitter", {
    instanceAccessor: false,
    instancePredicate: false,
    default: 0,
  });
  classAttribute.call(base, "afterDiscardProcs", { default: [] });
});
export function retryOn(this: any, ...exceptions: any[]): any {
  const block = rbBlockGivenP(exceptions[exceptions.length - 1]) ? exceptions.pop() : undefined;
  const {
    wait = Duration.seconds(3),
    attempts = 5,
    queue = null,
    priority = null,
    jitter = JITTER_DEFAULT,
  }: any = rbExtractKeywords(exceptions);
  return this.rescueFrom(
    ...exceptions,
    rbBlock(async function (this: any, error?: any) {
      const executions: any = this.executionsFor(exceptions);
      if (rbEqual(attempts, "unlimited") || rbBinop(executions, "<", attempts)) {
        return await this.retryJob({
          wait: this.determineDelay({
            secondsOrDurationOrAlgorithm: wait,
            executions: executions,
            jitter: jitter,
          }),
          queue: queue,
          priority: priority,
          error: error,
        });
      } else if (block != null) {
        this.instrument("retry_stopped", { error: error }, () => block(this, error));
        return this.runAfterDiscardProcs(error);
      } else {
        this.instrument("retry_stopped", { error: error });
        this.runAfterDiscardProcs(error);
        throw rbMakeException(error);
      }
    }),
  );
}

export function discardOn(this: any, ...exceptions: any[]): any {
  const block = rbBlockGivenP(exceptions[exceptions.length - 1]) ? exceptions.pop() : undefined;
  return this.rescueFrom(
    ...exceptions,
    rbBlock(function (this: any, error?: any) {
      return this.instrument("discard", { error: error }, () => {
        if (block != null) {
          block(this, error);
        }
        return this.runAfterDiscardProcs(error);
      });
    }),
  );
}

export function afterDiscard(this: any, blk?: any): any {
  this.afterDiscardProcs = rbBinop(this.afterDiscardProcs, "+", [blk]);
  return this.afterDiscardProcs;
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("retryOn", retryOn);
  mod.defineMethod("discardOn", discardOn);
  mod.defineMethod("afterDiscard", afterDiscard);
});
rbModConstSet(ActiveJobSeat, "Exceptions", Exceptions);
Exceptions.ClassMethods = ClassMethods;
