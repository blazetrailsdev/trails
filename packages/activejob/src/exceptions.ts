import { classAttribute, Concern, Duration, extend, seconds } from "@blazetrails/activesupport";
import {
  block,
  classModule,
  Kernel,
  rbBlockGivenP,
  rbInspect,
  rbModConstSet,
  rbObjClass,
  RuntimeError,
  StandardError,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

type AfterDiscardProc = (this: unknown, job: unknown, exception: unknown) => unknown;
type RetryBlock = (job: unknown, error: unknown) => unknown;

interface ExceptionsJob {
  executions: number;
  exceptionExecutions: Record<string, number> | null;
  afterDiscardProcs: AfterDiscardProc[];
  instrument(
    operation: string,
    payload?: Record<string, unknown>,
    block?: () => unknown,
  ): Promise<unknown>;
  enqueue(options?: Record<string, unknown>): Promise<unknown>;
  retryJob(options?: Record<string, unknown>): Promise<unknown>;
  determineDelay(options: {
    secondsOrDurationOrAlgorithm: unknown;
    executions: number;
    jitter?: unknown;
  }): unknown;
  determineJitterForDelay(delay: number, jitter: number): number;
  executionsFor(exceptions: unknown[]): number;
  runAfterDiscardProcs(exception: unknown): Promise<void>;
}

interface ExceptionsClass {
  afterDiscardProcs: AfterDiscardProc[];
  retryJitter: number;
  rescueFrom(...args: unknown[]): void;
}

interface RetryOnOptions {
  wait?: unknown;
  attempts?: number | ":unlimited";
  queue?: unknown;
  priority?: unknown;
  jitter?: unknown;
}

const JITTER_DEFAULT = {};

export class ClassMethods {
  static retryOn(this: ExceptionsClass, ...exceptions: unknown[]): void {
    const blk = rbBlockGivenP(exceptions[exceptions.length - 1])
      ? (exceptions.pop() as RetryBlock)
      : undefined;
    const last = exceptions[exceptions.length - 1];
    const options: RetryOnOptions =
      typeof last === "object" && last !== null && Object.getPrototypeOf(last) === Object.prototype
        ? (exceptions.pop() as RetryOnOptions)
        : {};
    const {
      wait = seconds(3),
      attempts = 5,
      queue = null,
      priority = null,
      jitter = JITTER_DEFAULT,
    } = options;
    this.rescueFrom(
      ...exceptions,
      block(async function (this: ExceptionsJob, error: unknown) {
        const executions = this.executionsFor(exceptions);
        if (attempts === ":unlimited" || executions < attempts) {
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
        } else {
          if (blk !== undefined) {
            await this.instrument("retry_stopped", { error: error }, () => blk(this, error));
            return await this.runAfterDiscardProcs(error);
          } else {
            await this.instrument("retry_stopped", { error: error });
            await this.runAfterDiscardProcs(error);
            throw error;
          }
        }
      }),
    );
  }

  static discardOn(this: ExceptionsClass, ...exceptions: unknown[]): void {
    const blk = rbBlockGivenP(exceptions[exceptions.length - 1])
      ? (exceptions.pop() as RetryBlock)
      : undefined;
    this.rescueFrom(
      ...exceptions,
      block(async function (this: ExceptionsJob, error: unknown) {
        return await this.instrument("discard", { error: error }, async () => {
          if (blk !== undefined) await blk(this, error);
          return await this.runAfterDiscardProcs(error);
        });
      }),
    );
  }

  static afterDiscard(this: ExceptionsClass, blk: AfterDiscardProc): void {
    this.afterDiscardProcs = [...this.afterDiscardProcs, blk];
  }
}

export class Exceptions {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare afterDiscardProcs: AfterDiscardProc[];
  declare instrument: ExceptionsJob["instrument"];
  declare enqueue: ExceptionsJob["enqueue"];
  declare executions: number | null;
  declare exceptionExecutions: Record<string, number> | null;

  async retryJob(options: Record<string, unknown> = {}): Promise<unknown> {
    const payload: Record<string, unknown> = {};
    if ("error" in options) payload["error"] = options["error"];
    if ("wait" in options) payload["wait"] = options["wait"];
    return await this.instrument("enqueue_retry", payload, () => this.enqueue(options));
  }

  /** @internal */
  determineDelay({
    secondsOrDurationOrAlgorithm,
    executions,
    jitter = JITTER_DEFAULT,
  }: {
    secondsOrDurationOrAlgorithm: unknown;
    executions: number;
    jitter?: unknown;
  }): unknown {
    jitter =
      jitter === JITTER_DEFAULT
        ? (rbObjClass(this) as unknown as ExceptionsClass).retryJitter
        : (jitter ?? 0.0);

    if (secondsOrDurationOrAlgorithm === ":polynomially_longer") {
      const delay = executions ** 4;
      const delayJitter = this.determineJitterForDelay(delay, jitter as number);
      return delay + delayJitter + 2;
    } else if (
      secondsOrDurationOrAlgorithm instanceof Duration ||
      Number.isInteger(secondsOrDurationOrAlgorithm)
    ) {
      const delay =
        secondsOrDurationOrAlgorithm instanceof Duration
          ? secondsOrDurationOrAlgorithm.toI()
          : (secondsOrDurationOrAlgorithm as number);
      const delayJitter = this.determineJitterForDelay(delay, jitter as number);
      return delay + delayJitter;
    } else if (typeof secondsOrDurationOrAlgorithm === "function") {
      const algorithm = secondsOrDurationOrAlgorithm as (executions: number) => unknown;
      return algorithm(executions);
    } else {
      throw new RuntimeError(
        `Couldn't determine a delay based on ${rbInspect(secondsOrDurationOrAlgorithm)}`,
      );
    }
  }

  /** @internal */
  determineJitterForDelay(delay: number, jitter: number): number {
    if (jitter === 0) return 0.0;
    return (Kernel.rand() as number) * delay * jitter;
  }

  /** @internal */
  executionsFor(exceptions: unknown[]): number | null {
    const exceptionExecutions = this.exceptionExecutions;
    if (exceptionExecutions != null) {
      const key = rbInspect(exceptions);
      return (exceptionExecutions[key] = (exceptionExecutions[key] ?? 0) + 1);
    } else {
      return this.executions;
    }
  }

  /** @internal */
  async runAfterDiscardProcs(exception: unknown): Promise<void> {
    const exceptions: unknown[] = [];
    for (const blk of this.afterDiscardProcs) {
      try {
        await blk.call(this, this, exception);
      } catch (e) {
        if (!(e instanceof StandardError)) throw e;
        exceptions.push(e);
      }
    }
    if (exceptions.length !== 0) throw exceptions[exceptions.length - 1];
  }
}
extend(Exceptions, Concern);
(Exceptions as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function (this: object) {
    classAttribute.call(this, "retryJitter", {
      instanceAccessor: false,
      instancePredicate: false,
      default: 0.0,
    });
    classAttribute.call(this, "afterDiscardProcs", { default: [] });
  },
);
Object.defineProperty(Exceptions, "ClassMethods", { value: ClassMethods });

rbModConstSet(ActiveJob, "Exceptions", Exceptions);
