import { ExecutionContext } from "./execution-context.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

/**
 * Mirror of Ruby's `ArgumentError`, raised by `subscribe` and by `report`'s
 * severity check (`error_reporter.rb:163,221`).
 */
class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * Mirror of Ruby's `RuntimeError` — the class `raise "msg"` and
 * `RuntimeError.new(string)` build, which is what `unexpected` wraps a String
 * argument in (`error_reporter.rb:146`).
 */
class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * The duck type `ErrorReporter#subscribe` requires — Rails asserts
 * `subscriber.respond_to?(:report)` and names no constant for the shape. The
 * method's signature is `error_reporter.rb:158`'s documented one, with Ruby's
 * kwargs as the trailing options object.
 *
 * @noRailsEquivalent PERMANENT — name collision only. Ruby's
 * `ErrorSubscriber` (`error_reporter/test_helper.rb`) is a concrete
 * recording subscriber for tests, not the protocol itself.
 */
export interface ErrorSubscriber {
  report(
    error: unknown,
    opts: {
      handled: boolean;
      severity: ErrorSeverity;
      context: ErrorContext;
      source: string;
    },
  ): void;
}

/**
 * The subset of {@link Logger} `report`'s subscriber rescue reaches
 * (`error_reporter.rb:231-235`). Rails' `attr_accessor :logger` names no type.
 */
type ErrorReporterLogger = { fatal(message?: string | (() => string)): unknown };

/** A `rescue`-able error class, as `handle`/`record`'s `*error_classes` splat holds. */
type ErrorClass = abstract new (...args: any[]) => Error;

/** The class form `unsubscribe` and `disable` accept alongside a subscriber itself. */
type ErrorSubscriberClass = abstract new (...args: any[]) => ErrorSubscriber;

/**
 * `ActiveSupport::ErrorReporter` is a common interface for error reporting
 * services.
 *
 * Mirrors: `activesupport/lib/active_support/error_reporter.rb`.
 */
export class ErrorReporter {
  static readonly SEVERITIES: ErrorSeverity[] = ["error", "warning", "info"];
  static readonly DEFAULT_SOURCE = "application";
  /** Ruby's `[StandardError].freeze`; JS' nearest rescuable root is `Error`. */
  static readonly DEFAULT_RESCUE: readonly ErrorClass[] = Object.freeze([Error]);

  /**
   * Ruby's `Class.new(Exception)` — deliberately outside `StandardError` so a
   * `rescue` higher in the stack does not swallow it. JS has no class below
   * `Error` to express that with, so `handle`'s `DEFAULT_RESCUE` does catch it;
   * the intent survives in the name.
   */
  static readonly UnexpectedError = class UnexpectedError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
      super(message, options);
      this.name = "UnexpectedError";
    }
  };

  logger: ErrorReporterLogger | null;
  debugMode: boolean;

  private subscribers: ErrorSubscriber[];

  constructor(
    subscribers: (ErrorSubscriber | ErrorSubscriber[])[] = [],
    { logger = null }: { logger?: ErrorReporterLogger | null } = {},
  ) {
    this.subscribers = subscribers.flat();
    this.logger = logger;
    this.debugMode = false;
  }

  /**
   * Evaluates the given block, reporting and swallowing any unhandled error.
   * If no error is raised, returns the return value of the block. Otherwise,
   * returns the result of `fallback.call`, or `null` if `fallback` is not
   * specified.
   */
  handle<T>(fn: () => T): T | null;
  handle<T>(opts: HandleOptions, fn: () => T): T | null;
  handle<T>(errorClasses: ErrorClass[], fn: () => T): T | null;
  handle<T>(errorClasses: ErrorClass[], opts: HandleOptions, fn: () => T): T | null;
  handle<T>(
    errorClassesOrOptsOrFn: ErrorClass[] | HandleOptions | (() => T),
    optsOrFn?: HandleOptions | (() => T),
    maybeFn?: () => T,
  ): T | null {
    const [errorClasses, opts, fn] = splitArgs<HandleOptions, T>(
      errorClassesOrOptsOrFn,
      optsOrFn,
      maybeFn,
    );
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

  /**
   * Evaluates the given block, reporting and re-raising any unhandled error.
   * If no error is raised, returns the return value of the block.
   */
  record<T>(fn: () => T): T;
  record<T>(opts: RecordOptions, fn: () => T): T;
  record<T>(errorClasses: ErrorClass[], fn: () => T): T;
  record<T>(errorClasses: ErrorClass[], opts: RecordOptions, fn: () => T): T;
  record<T>(
    errorClassesOrOptsOrFn: ErrorClass[] | RecordOptions | (() => T),
    optsOrFn?: RecordOptions | (() => T),
    maybeFn?: () => T,
  ): T {
    const [errorClasses, opts, fn] = splitArgs<RecordOptions, T>(
      errorClassesOrOptsOrFn,
      optsOrFn,
      maybeFn,
    );
    const { severity = "error", context = {}, source = ErrorReporter.DEFAULT_SOURCE } = opts;

    try {
      return fn();
    } catch (error) {
      if (!rescues(errorClasses, error)) throw error;
      this.report(error, { handled: false, severity, context, source });
      throw error;
    }
  }

  /**
   * Either report the given error when in production, or raise it when in
   * development or test. The error can be either an exception instance or a
   * String.
   */
  unexpected(
    error: unknown,
    {
      severity = "warning",
      context = {},
      source = ErrorReporter.DEFAULT_SOURCE,
    }: { severity?: ErrorSeverity; context?: ErrorContext; source?: string } = {},
  ): null {
    if (typeof error === "string") error = new RuntimeError(error);

    if (this.debugMode) {
      this.ensureBacktrace(error);
      const unexpected = new ErrorReporter.UnexpectedError(
        `${(error as Error).name}: ${(error as Error).message}`,
        { cause: error },
      );
      // Ruby's third `raise` argument — the new error carries the original's
      // backtrace, so its first frame is the caller's, not this file's.
      unexpected.stack = (error as Error).stack;
      throw unexpected;
    } else {
      return this.report(error, { handled: true, severity, context, source });
    }
  }

  /**
   * Register a new error subscriber. The subscriber must respond to
   *
   *   report(error, { handled, severity, context, source })
   *
   * The `report` method **should never** raise an error.
   */
  subscribe(subscriber: ErrorSubscriber): void {
    if (typeof (subscriber as { report?: unknown })?.report !== "function") {
      throw new ArgumentError("Error subscribers must respond to #report");
    }
    this.subscribers.push(subscriber);
  }

  /** Unregister an error subscriber. Accepts either a subscriber or a class. */
  unsubscribe(subscriber: ErrorSubscriber | ErrorSubscriberClass): void {
    deleteIf(this.subscribers, (s) => caseEquals(subscriber, s));
  }

  /**
   * Prevent a subscriber from being notified of errors for the duration of the
   * block. You may pass in the subscriber itself, or its class.
   */
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

  /**
   * Update the execution context that is accessible to error subscribers. Any
   * context passed to #handle, #record, or #report will be merged with the
   * context set here.
   */
  setContext(attrs: Record<string, unknown>): void {
    ExecutionContext.set(attrs);
  }

  /**
   * Report an error directly to subscribers. You can use this method when the
   * block-based #handle and #record methods are not suitable.
   */
  report(
    error: unknown,
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
    if ((error as Record<symbol, unknown>)?.[RAILS_ERROR_REPORTED] !== undefined) return null;
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

    let marked = error;
    while (marked != null) {
      if (!Object.isFrozen(marked)) {
        (marked as Record<symbol, unknown>)[RAILS_ERROR_REPORTED] = true;
      }
      marked = (marked as { cause?: unknown }).cause;
    }

    return null;
  }

  /**
   * @missingRailsCall first — Ruby walks `error.backtrace_locations.first&.path`
   * to shift this file's frames off the backtrace its `raise` just manufactured.
   * JS' `throw`/`catch` manufactures nothing, so there is no list to walk;
   * `Error.captureStackTrace`'s `constructorOpt` elides the same frames at
   * capture time, which is why no `first` survives here.
   */
  private ensureBacktrace(error: unknown): void {
    if (Object.isFrozen(error)) return; // re-raising won't add a backtrace
    if ((error as Error)?.stack != null) return;

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

/**
 * Ruby's `@__rails_error_reported` instance variable (`error_reporter.rb:217`),
 * as the JS property that plays an ivar's part: hidden from enumeration and
 * shared across every copy of this module.
 */
const RAILS_ERROR_REPORTED = Symbol.for("__rails_error_reported");

/**
 * Ruby's `subscriber === s`, whose meaning depends on the receiver: a Module
 * tests membership, anything else tests equality.
 */
function caseEquals(subscriber: unknown, s: unknown): boolean {
  if (typeof subscriber === "function") return s instanceof (subscriber as ErrorSubscriberClass);
  return subscriber === s;
}

/** Ruby's `Array#delete`, which removes every equal element in place. */
function deleteFrom<T>(array: T[], value: T): void {
  deleteIf(array, (element) => element === value);
}

/** Ruby's `Array#delete_if`, which filters in place rather than returning a new array. */
function deleteIf<T>(array: T[], predicate: (element: T) => boolean): void {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) array.splice(i, 1);
  }
}

/** Ruby's `rescue *error_classes`. */
function rescues(errorClasses: readonly ErrorClass[], error: unknown): boolean {
  return errorClasses.some((cls) => error instanceof cls);
}

/**
 * Ruby's `def handle(*error_classes, **kwargs, &block)` binding, which TS has
 * to unpick by hand: the splat is the leading array, the kwargs the object, and
 * the block the trailing function. `error_classes = DEFAULT_RESCUE if
 * error_classes.empty?` is the same line in both `handle` and `record`
 * (`error_reporter.rb:79,115`).
 */
function splitArgs<O, T>(
  errorClassesOrOptsOrFn: ErrorClass[] | O | (() => T),
  optsOrFn: O | (() => T) | undefined,
  maybeFn: (() => T) | undefined,
): [readonly ErrorClass[], O, () => T] {
  let errorClasses: readonly ErrorClass[] = [];
  let opts: O;
  let fn: () => T;

  if (typeof errorClassesOrOptsOrFn === "function") {
    opts = {} as O;
    fn = errorClassesOrOptsOrFn as () => T;
  } else if (Array.isArray(errorClassesOrOptsOrFn)) {
    errorClasses = errorClassesOrOptsOrFn;
    if (typeof optsOrFn === "function") {
      opts = {} as O;
      fn = optsOrFn as () => T;
    } else {
      opts = (optsOrFn ?? {}) as O;
      fn = maybeFn as () => T;
    }
  } else {
    opts = errorClassesOrOptsOrFn;
    fn = optsOrFn as () => T;
  }

  if (errorClasses.length === 0) errorClasses = ErrorReporter.DEFAULT_RESCUE;
  return [errorClasses, opts, fn];
}
