import { Duration, Concern, classAttribute } from "@blazetrails/activesupport";
import {
  slice,
  RuntimeError,
  rbInspect,
  Kernel,
  kernelRand,
  StandardError,
  extend,
  classModule,
  Extended,
  block as rbBlock,
} from "@blazetrails/ruby-compat";
import { rbBinop } from "./codegen-runtime.js";
import type { Base } from "./base.js";
import type { DeserializationError } from "./arguments.js";

export class Exceptions {
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Exceptions";
  }

  async retryJob(this: Base, options: Record<string, unknown> = {}) {
    return await this.instrument(
      "enqueue_retry",
      slice(options, "error", "wait"),
      async () => await this.enqueue(options),
    );
  }

  static JITTER_DEFAULT: unknown = new (class Object {})();

  /** @internal */
  determineDelay(
    this: Base,
    {
      secondsOrDurationOrAlgorithm,
      executions,
      jitter = Exceptions.JITTER_DEFAULT,
    }: { secondsOrDurationOrAlgorithm: unknown; executions: number | null; jitter?: unknown } = {},
  ) {
    let delay, delayJitter, algorithm;
    jitter =
      jitter === Exceptions.JITTER_DEFAULT
        ? this.constructor.retryJitter
        : jitter != null && jitter !== false
          ? jitter
          : 0;
    if (secondsOrDurationOrAlgorithm === "polynomially_longer") {
      delay = executions ** 4;
      delayJitter = this.determineJitterForDelay(delay, jitter as number);
      return rbBinop(rbBinop(delay, "+", delayJitter), "+", 2);
    } else if (
      secondsOrDurationOrAlgorithm instanceof Duration ||
      typeof secondsOrDurationOrAlgorithm === "bigint" ||
      Number.isInteger(secondsOrDurationOrAlgorithm)
    ) {
      delay = parseInt(String(secondsOrDurationOrAlgorithm), 10) || 0;
      delayJitter = this.determineJitterForDelay(delay, jitter as number);
      return delay + delayJitter;
    } else if (
      typeof secondsOrDurationOrAlgorithm === "function" &&
      !Function.prototype.toString.call(secondsOrDurationOrAlgorithm).startsWith("class")
    ) {
      algorithm = secondsOrDurationOrAlgorithm;
      return algorithm(executions);
    } else {
      throw new RuntimeError(
        `Couldn't determine a delay based on ${rbInspect(secondsOrDurationOrAlgorithm)}`,
      );
    }
  }

  /** @internal */
  determineJitterForDelay(this: Base, delay: number, jitter: number): number {
    if (jitter === 0) {
      return 0;
    }
    return rbBinop(
      rbBinop(((Kernel as { rand?: typeof kernelRand }).rand ?? kernelRand)(), "*", delay),
      "*",
      jitter,
    );
  }

  /** @internal */
  executionsFor(this: Base, exceptions: unknown[]): number | null {
    if (this.exceptionExecutions != null && this.exceptionExecutions !== false) {
      return (this.exceptionExecutions[rbInspect(exceptions)] = rbBinop(
        this.exceptionExecutions[rbInspect(exceptions)] ?? 0,
        "+",
        1,
      ));
    } else {
      return this.executions;
    }
  }

  /** @internal */
  async runAfterDiscardProcs(this: Base, exception: unknown) {
    let exceptions = [];
    for (const blk of this.afterDiscardProcs) {
      try {
        blk.call(this, this, exception);
      } catch (e) {
        if (e instanceof StandardError) {
          exceptions.push(e);
        } else {
          throw e;
        }
      }
    }
    if (!(exceptions.length === 0)) {
      throw ((x) =>
        typeof x === "string" ? new RuntimeError(x) : typeof x === "function" ? new x() : x)(
        exceptions.at(-1),
      );
    }
    return null;
  }
}
extend(Exceptions, Concern);
Exceptions.included(null, function (this: typeof Base): void {
  classAttribute.call(this, "retryJitter", {
    instanceAccessor: false,
    instancePredicate: false,
    default: 0,
  });
  classAttribute.call(this, "afterDiscardProcs", { default: [] });
});
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::Exceptions::ClassMethods";
  }

  static retryOn(this: typeof Base, ...exceptions: unknown[]) {
    const block =
      typeof exceptions[exceptions.length - 1] === "function" &&
      !Function.prototype.toString.call(exceptions[exceptions.length - 1]).startsWith("class")
        ? (exceptions.pop() as (...args: unknown[]) => unknown)
        : undefined;
    const {
      wait = Duration.seconds(3),
      attempts = 5,
      queue = null,
      priority = null,
      jitter = Exceptions.JITTER_DEFAULT,
    } = Object.getPrototypeOf(exceptions.at(-1) ?? 0) === Object.prototype ? exceptions.pop() : {};
    return this.rescueFrom(
      ...exceptions,
      rbBlock(async function (this: Base, error) {
        const executions = this.executionsFor(exceptions);
        if (attempts === "unlimited" || rbBinop(executions, "<", attempts)) {
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
          await this.instrument("retry_stopped", { error: error }, () => block(this, error));
          return await this.runAfterDiscardProcs(error);
        } else {
          await this.instrument("retry_stopped", { error: error });
          await this.runAfterDiscardProcs(error);
          throw typeof error === "string"
            ? new RuntimeError(error)
            : typeof error === "function"
              ? new error()
              : error;
        }
      }),
    );
  }

  static discardOn(this: typeof Base, ...exceptions: unknown[]) {
    const block =
      typeof exceptions[exceptions.length - 1] === "function" &&
      !Function.prototype.toString.call(exceptions[exceptions.length - 1]).startsWith("class")
        ? (exceptions.pop() as (...args: unknown[]) => unknown)
        : undefined;
    return this.rescueFrom(
      ...exceptions,
      rbBlock(async function (this: Base, error) {
        return await this.instrument("discard", { error: error }, async () => {
          if (block != null) {
            block(this, error);
          }
          return await this.runAfterDiscardProcs(error);
        });
      }),
    );
  }

  static afterDiscard(this: typeof Base, blk?: (...args: unknown[]) => unknown) {
    this.afterDiscardProcs = rbBinop(this.afterDiscardProcs, "+", [blk]);
    return this.afterDiscardProcs;
  }
}
Object.assign(Exceptions, { ClassMethods: ClassMethods });
