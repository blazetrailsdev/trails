import { ArgumentError, RuntimeError } from "@blazetrails/ruby-compat";
import { ExecutionContext } from "./execution-context.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorContext {
  [key: string]: unknown;
}

/** @noRailsEquivalent PERMANENT */
export interface ErrorSubscriber {
  report(
    error: Error,
    opts: {
      handled: boolean;
      severity: ErrorSeverity;
      context: ErrorContext;
      source: string;
    },
  ): void;
}

type ErrorReporterLogger = { fatal(message?: string | (() => string)): unknown };

type ErrorClass = abstract new (...args: any[]) => Error;

type ErrorSubscriberClass = abstract new (...args: any[]) => ErrorSubscriber;

export class ErrorReporter {
  static readonly SEVERITIES: ErrorSeverity[] = ["error", "warning", "info"];
  static readonly DEFAULT_SOURCE = "application";
  static readonly DEFAULT_RESCUE: readonly ErrorClass[] = Object.freeze([Error]);

  static readonly UnexpectedError = class UnexpectedError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
      super(message, options);
      this.name = "UnexpectedError";
    }
  };

  logger: ErrorReporterLogger | null;
  debugMode: boolean;

  private subscribers: ErrorSubscriber[];

  constructor(...subscribers: (ErrorSubscriber | ErrorSubscriber[])[]);
  constructor(
    ...args: [
      ...subscribers: (ErrorSubscriber | ErrorSubscriber[])[],
      options: { logger?: ErrorReporterLogger | null },
    ]
  );
  constructor(...args: unknown[]) {
    const [subscribers, { logger = null }] = splitKwargs<{
      logger?: ErrorReporterLogger | null;
    }>(args, respondsToReport);
    this.subscribers = (subscribers as (ErrorSubscriber | ErrorSubscriber[])[]).flat();
    this.logger = logger;
    this.debugMode = false;
  }

  handle<T>(...args: [fn: () => T]): T | null;
  handle<T>(...args: [opts: HandleOptions, fn: () => T]): T | null;
  handle<T>(...args: [...errorClasses: ErrorClass[], fn: () => T]): T | null;
  handle<T>(...args: [...errorClasses: ErrorClass[], opts: HandleOptions, fn: () => T]): T | null;
  handle<T>(...args: unknown[]): T | null {
    const [errorClasses, opts, fn] = splitBlockArgs<HandleOptions, T>(args);
    const {
      severity = "warning",
      context = {},
      fallback = null,
      source = ErrorReporter.DEFAULT_SOURCE,
    } = opts;

    try {
      return fn();
    } catch (error) {
      if (!rescues(errorClasses, error)) throw error;
      this.report(error, { handled: true, severity, context, source });
      return fallback != null && fallback !== false ? (fallback as () => T)() : null;
    }
  }

  record<T>(...args: [fn: () => T]): T;
  record<T>(...args: [opts: RecordOptions, fn: () => T]): T;
  record<T>(...args: [...errorClasses: ErrorClass[], fn: () => T]): T;
  record<T>(...args: [...errorClasses: ErrorClass[], opts: RecordOptions, fn: () => T]): T;
  record<T>(...args: unknown[]): T {
    const [errorClasses, opts, fn] = splitBlockArgs<RecordOptions, T>(args);
    const { severity = "error", context = {}, source = ErrorReporter.DEFAULT_SOURCE } = opts;

    try {
      return fn();
    } catch (error) {
      if (!rescues(errorClasses, error)) throw error;
      this.report(error, { handled: false, severity, context, source });
      throw error;
    }
  }

  unexpected(
    error: Error | string,
    {
      severity = "warning",
      context = {},
      source = ErrorReporter.DEFAULT_SOURCE,
    }: { severity?: ErrorSeverity; context?: ErrorContext; source?: string } = {},
  ): null {
    if (typeof error === "string") error = new RuntimeError(error);

    if (this.debugMode) {
      this.ensureBacktrace(error);
      const unexpected = new ErrorReporter.UnexpectedError(`${error.name}: ${error.message}`, {
        cause: error,
      });
      unexpected.stack = error.stack;
      throw unexpected;
    } else {
      return this.report(error, { handled: true, severity, context, source });
    }
  }

  subscribe(subscriber: ErrorSubscriber): void {
    if (typeof (subscriber as { report?: unknown })?.report !== "function") {
      throw new ArgumentError("Error subscribers must respond to #report");
    }
    this.subscribers.push(subscriber);
  }

  unsubscribe(subscriber: ErrorSubscriber | ErrorSubscriberClass): void {
    deleteIf(this.subscribers, (s) => caseEquals(subscriber, s));
  }

  disable<T>(subscriber: ErrorSubscriber | ErrorSubscriberClass, fn: () => T): T {
    const disabledSubscribers = IsolatedExecutionState.fetch<
      Array<ErrorSubscriber | ErrorSubscriberClass>
    >(this, () => []);
    disabledSubscribers.push(subscriber);
    try {
      return fn();
    } finally {
      deleteFrom(disabledSubscribers, subscriber);
    }
  }

  setContext(attrs: Record<string, unknown>): void {
    ExecutionContext.set(attrs);
  }

  /** @missingRailsCall merge — PERMANENT */
  report(
    error: Error,
    {
      handled = true,
      severity = handled ? ("warning" as const) : ("error" as const),
      context = {},
      source = ErrorReporter.DEFAULT_SOURCE,
    }: {
      handled?: boolean;
      severity?: ErrorSeverity;
      context?: ErrorContext;
      source?: string;
    } = {},
  ): null {
    if ((error as unknown as Record<symbol, unknown>)?.[RAILS_ERROR_REPORTED] !== undefined)
      return null;
    this.ensureBacktrace(error);

    if (!ErrorReporter.SEVERITIES.includes(severity)) {
      throw new ArgumentError(
        `severity must be one of ${ErrorReporter.SEVERITIES.map((s) => `:${s}`).join(", ")}, got: :${severity}`,
      );
    }

    const fullContext = { ...ExecutionContext.toH(), ...context };
    const disabledSubscribers =
      IsolatedExecutionState.get<Array<ErrorSubscriber | ErrorSubscriberClass>>(this);
    for (const subscriber of this.subscribers) {
      try {
        if (!disabledSubscribers?.some((s) => caseEquals(s, subscriber))) {
          subscriber.report(error, { handled, severity, context: fullContext, source });
        }
      } catch (subscriberError) {
        if (this.logger) {
          this.logger.fatal(
            `Error subscriber raised an error: ${(subscriberError as Error).message} (${(subscriberError as Error).name})\n` +
              ((subscriberError as Error).stack ?? ""),
          );
        } else {
          throw subscriberError;
        }
      }
    }

    let marked: unknown = error;
    while (marked != null) {
      if (!Object.isFrozen(marked)) {
        (marked as Record<symbol, unknown>)[RAILS_ERROR_REPORTED] = true;
      }
      marked = (marked as { cause?: unknown }).cause;
    }

    return null;
  }

  /** @missingRailsCall first — PERMANENT */
  private ensureBacktrace(error: Error): void {
    if (Object.isFrozen(error)) return;
    if (error?.stack != null) return;

    Error.captureStackTrace?.(error as object, this.ensureBacktrace);
  }
}

export interface HandleOptions {
  severity?: ErrorSeverity;
  context?: ErrorContext;
  fallback?: (() => unknown) | unknown;
  source?: string;
}

export interface RecordOptions {
  severity?: ErrorSeverity;
  context?: ErrorContext;
  source?: string;
}

const RAILS_ERROR_REPORTED = Symbol.for("__rails_error_reported");

function caseEquals(subscriber: unknown, s: unknown): boolean {
  if (typeof subscriber === "function") return s instanceof (subscriber as ErrorSubscriberClass);
  return subscriber === s;
}

function deleteFrom<T>(array: T[], value: T): void {
  deleteIf(array, (element) => element === value);
}

function deleteIf<T>(array: T[], predicate: (element: T) => boolean): void {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) array.splice(i, 1);
  }
}

function rescues(errorClasses: readonly ErrorClass[], error: unknown): error is Error {
  return errorClasses.some((cls) => error instanceof cls);
}

function splitKwargs<O>(
  args: readonly unknown[],
  isPositional: (value: unknown) => boolean = () => false,
): [readonly unknown[], O] {
  const last = args[args.length - 1];
  if (isKwargs(last) && !isPositional(last)) return [args.slice(0, -1), last as O];
  return [args, {} as O];
}

function splitBlockArgs<O, T>(args: readonly unknown[]): [readonly ErrorClass[], O, () => T] {
  const rest = args.slice();
  const fn = rest.pop() as () => T;
  const [errorClassArgs, opts] = splitKwargs<O>(rest);

  let errorClasses = errorClassArgs as readonly ErrorClass[];
  if (errorClasses.length === 0) errorClasses = ErrorReporter.DEFAULT_RESCUE;
  return [errorClasses, opts, fn];
}

function respondsToReport(value: unknown): boolean {
  return typeof (value as { report?: unknown })?.report === "function";
}

function isKwargs(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** @internal */
export let currentErrorReporter = new ErrorReporter();

/** @internal */
export function _setErrorReporter(reporter: ErrorReporter): void {
  currentErrorReporter = reporter;
}
