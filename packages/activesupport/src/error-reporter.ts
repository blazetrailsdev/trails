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
    error: Error,
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

  /**
   * Evaluates the given block, reporting and swallowing any unhandled error.
   * If no error is raised, returns the return value of the block. Otherwise,
   * returns the result of `fallback.call`, or `null` if `fallback` is not
   * specified.
   */
  handle<T>(fn: () => T): T | null;
  handle<T>(opts: HandleOptions, fn: () => T): T | null;
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

  /**
   * Evaluates the given block, reporting and re-raising any unhandled error.
   * If no error is raised, returns the return value of the block.
   */
  record<T>(fn: () => T): T;
  record<T>(opts: RecordOptions, fn: () => T): T;
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

  /**
   * Either report the given error when in production, or raise it when in
   * development or test. The error can be either an exception instance or a
   * String.
   */
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
      // Ruby's third `raise` argument — the new error carries the original's
      // backtrace, so its first frame is the caller's, not this file's.
      unexpected.stack = error.stack;
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

  /**
   * @missingRailsCall first — Ruby walks `error.backtrace_locations.first&.path`
   * to shift this file's frames off the backtrace its `raise` just manufactured.
   * JS' `throw`/`catch` manufactures nothing, so there is no list to walk;
   * `Error.captureStackTrace`'s `constructorOpt` elides the same frames at
   * capture time, which is why no `first` survives here.
   */
  private ensureBacktrace(error: Error): void {
    if (Object.isFrozen(error)) return; // re-raising won't add a backtrace
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

/** Ruby's `rescue *error_classes`, which binds `error` to an Exception by construction. */
function rescues(errorClasses: readonly ErrorClass[], error: unknown): error is Error {
  return errorClasses.some((cls) => error instanceof cls);
}

/**
 * Ruby's trailing-`**kwargs` binding: the last argument is the kwargs Hash when
 * it is a plain object, and is otherwise absent. TS has no kwargs, so the splat
 * has to be unpicked from the end by hand.
 *
 * `isPositional` vetoes that: Ruby's parser tells a kwargs Hash from a trailing
 * positional argument, and where TS cannot, the caller supplies the same duck
 * type Rails itself dispatches on.
 */
function splitKwargs<O>(
  args: readonly unknown[],
  isPositional: (value: unknown) => boolean = () => false,
): [readonly unknown[], O] {
  const last = args[args.length - 1];
  if (isKwargs(last) && !isPositional(last)) return [args.slice(0, -1), last as O];
  return [args, {} as O];
}

/**
 * Ruby's `def handle(*error_classes, **kwargs, &block)` binding. The block is
 * always last, the kwargs Hash sits before it when present, and everything
 * ahead of them is the `*error_classes` splat — so `handle(NameError,
 * ArgumentError) { }` (`error_reporter.rb:82`) and `handle(fallback: -> { })
 * { }` (`:104`) both land where Rails puts them. `error_classes =
 * DEFAULT_RESCUE if error_classes.empty?` is the same line in both `handle` and
 * `record` (`:79`, `:115`).
 */
function splitBlockArgs<O, T>(args: readonly unknown[]): [readonly ErrorClass[], O, () => T] {
  const rest = args.slice();
  const fn = rest.pop() as () => T;
  const [errorClassArgs, opts] = splitKwargs<O>(rest);

  let errorClasses = errorClassArgs as readonly ErrorClass[];
  if (errorClasses.length === 0) errorClasses = ErrorReporter.DEFAULT_RESCUE;
  return [errorClasses, opts, fn];
}

/**
 * `subscribe`'s duck type (`error_reporter.rb:162`), which is what tells a plain
 * object subscriber from the constructor's `logger:` kwargs Hash.
 */
function respondsToReport(value: unknown): boolean {
  return typeof (value as { report?: unknown })?.report === "function";
}

/**
 * Whether a trailing argument is Ruby's kwargs Hash rather than a positional
 * one. A subscriber, an error class and a block are all callable or
 * class-shaped; only the kwargs Hash is a plain object.
 */
function isKwargs(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * The process-wide reporter behind `ActiveSupport.error_reporter`
 * (activesupport/lib/active_support.rb:104-105 — `@error_reporter =
 * ActiveSupport::ErrorReporter.new` plus `singleton_class.attr_accessor
 * :error_reporter`). It lives here rather than as a data property on the
 * `ActiveSupport` barrel object so that a caller inside the package can read
 * the CURRENT reporter without importing the barrel: that import is eager in
 * ESM, and from `deprecation.ts` it closed a cycle through `index.ts` into
 * `message-pack` that left `Serializer` in TDZ. `ActiveSupport.errorReporter`
 * is an accessor pair over this binding — the same shape `fsAdapter` and
 * `cryptoAdapter` already use — so the two can never disagree and assigning
 * through the barrel still works.
 *
 * @internal
 */
export let currentErrorReporter = new ErrorReporter();

/** @internal Writer behind `ActiveSupport.errorReporter =`. */
export function _setErrorReporter(reporter: ErrorReporter): void {
  currentErrorReporter = reporter;
}
