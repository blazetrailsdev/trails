/**
 * ErrorReporter — centralized error reporting with subscriber support.
 * Mirrors Rails ActiveSupport::ErrorReporter.
 */

export type ErrorSeverity = "error" | "warning" | "info";

export interface ErrorContext {
  [key: string]: unknown;
}

export interface ReportedError {
  error: Error;
  handled: boolean;
  severity: ErrorSeverity;
  context: ErrorContext;
  source: string;
}

export interface ErrorSubscriber {
  report(reportedError: ReportedError): void;
}

export interface HandleOptions {
  context?: ErrorContext;
  source?: string;
  severity?: ErrorSeverity;
  fallback?: (() => unknown) | unknown;
}

export interface RecordOptions {
  context?: ErrorContext;
  source?: string;
  severity?: ErrorSeverity;
}

export class ErrorReporter {
  private subscribers: ErrorSubscriber[] = [];
  private executionContext: ErrorContext = {};
  private reportedErrors = new WeakSet<Error>();
  logger: { error: (msg: string) => void } | null = null;

  /** subscribe — adds a subscriber to receive error reports. */
  subscribe(subscriber: ErrorSubscriber): void {
    this.subscribers.push(subscriber);
  }

  /** unsubscribe — removes a subscriber. */
  unsubscribe(subscriber: ErrorSubscriber): void {
    this.subscribers = this.subscribers.filter((s) => s !== subscriber);
  }

  /** disable — temporarily disables a subscriber while running fn. */
  disable<T>(
    subscriber: ErrorSubscriber | ErrorSubscriber[],
    fn: () => T
  ): T {
    const disabled = Array.isArray(subscriber) ? subscriber : [subscriber];
    const original = [...this.subscribers];
    this.subscribers = this.subscribers.filter((s) => !disabled.includes(s));
    try {
      return fn();
    } finally {
      this.subscribers = original;
    }
  }

  /** setContext — sets the execution context (merged into all error reports). */
  setContext(context: ErrorContext): void {
    this.executionContext = { ...this.executionContext, ...context };
  }

  /**
   * handle — runs fn(), swallowing errors that match the given error classes.
   * Reports the error to subscribers. Returns the fallback value on handled errors.
   */
  handle<T>(
    errorClassesOrFn: Array<new (...a: any[]) => Error> | (() => T),
    optionsOrFn?: HandleOptions | (() => T),
    fn?: () => T
  ): T | undefined {
    let errorClasses: Array<new (...a: any[]) => Error>;
    let options: HandleOptions;
    let theFn: () => T;

    if (typeof errorClassesOrFn === "function") {
      errorClasses = [Error];
      options = {};
      theFn = errorClassesOrFn;
    } else if (typeof optionsOrFn === "function") {
      errorClasses = errorClassesOrFn;
      options = {};
      theFn = optionsOrFn;
    } else {
      errorClasses = errorClassesOrFn;
      options = optionsOrFn ?? {};
      theFn = fn!;
    }

    try {
      return theFn();
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (!errorClasses.some((cls) => e instanceof cls)) throw e;

      this.report(e, {
        handled: true,
        severity: options.severity ?? "warning",
        context: { ...this.executionContext, ...options.context },
        source: options.source ?? "application",
      });

      if (options.fallback !== undefined) {
        if (typeof options.fallback === "function") {
          return (options.fallback as () => T)();
        }
        return options.fallback as T;
      }
      return undefined;
    }
  }

  /**
   * record — runs fn(), reports errors that match the given error classes, then re-raises.
   */
  record<T>(
    errorClassesOrFn: Array<new (...a: any[]) => Error> | (() => T),
    optionsOrFn?: RecordOptions | (() => T),
    fn?: () => T
  ): T {
    let errorClasses: Array<new (...a: any[]) => Error>;
    let options: RecordOptions;
    let theFn: () => T;

    if (typeof errorClassesOrFn === "function") {
      errorClasses = [Error];
      options = {};
      theFn = errorClassesOrFn;
    } else if (typeof optionsOrFn === "function") {
      errorClasses = errorClassesOrFn;
      options = {};
      theFn = optionsOrFn;
    } else {
      errorClasses = errorClassesOrFn;
      options = optionsOrFn ?? {};
      theFn = fn!;
    }

    try {
      return theFn();
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (!errorClasses.some((cls) => e instanceof cls)) throw e;

      this.report(e, {
        handled: false,
        severity: options.severity ?? "error",
        context: { ...this.executionContext, ...options.context },
        source: options.source ?? "application",
      });
      throw e;
    }
  }

  /**
   * unexpected — reports an error as unexpected. Typically swallows in production,
   * re-raises in development/test.
   */
  unexpected(error: Error | string, context: ErrorContext = {}): void {
    const err = typeof error === "string" ? new Error(error) : error;
    this.report(err, {
      handled: true,
      severity: "error",
      context: { ...this.executionContext, ...context },
      source: "unexpected",
    });
  }

  /**
   * report — reports an error to all subscribers.
   */
  public report(
    error: Error,
    opts: {
      handled?: boolean;
      severity?: ErrorSeverity;
      context?: ErrorContext;
      source?: string;
    } = {}
  ): void {
    // Don't report the same error twice
    if (this.reportedErrors.has(error)) return;
    this.reportedErrors.add(error);

    const reportedError: ReportedError = {
      error,
      handled: opts.handled ?? true,
      severity: opts.severity ?? "warning",
      context: { ...this.executionContext, ...opts.context },
      source: opts.source ?? "application",
    };

    for (const subscriber of this.subscribers) {
      try {
        subscriber.report(reportedError);
      } catch (subscriberError) {
        if (this.logger) {
          this.logger.error(
            `ErrorReporter subscriber raised: ${subscriberError}`
          );
        } else {
          throw subscriberError;
        }
      }
    }
  }
}
