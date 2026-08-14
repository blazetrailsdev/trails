/**
 * Mirrors: active_support/testing/error_reporter_assertions.rb
 *
 * The `ErrorCollector` subscribes itself to `ActiveSupport.errorReporter` once
 * and stacks a recorder array per `record` call, so nested assertions each see
 * the reports raised inside their own block.
 */
import { ActiveSupport } from "../index.js";
import { IsolatedExecutionState } from "../isolated-execution-state.js";
import type { ErrorContext, ErrorSeverity } from "../error-reporter.js";
import { assert, Assertion, _assertNothingRaisedOrWarn } from "./assertions.js";

const RECORDERS = "active_support_error_reporter_assertions";

/**
 * `Report = Struct.new(..., keyword_init: true)` plus its
 * `alias_method :handled?, :handled` reopening
 * (error_reporter_assertions.rb:10-13).
 * @internal
 */
export class Report {
  error: Error;
  handled: boolean;
  severity: ErrorSeverity;
  context: ErrorContext;
  source: string;

  constructor(kwargs: {
    error: Error;
    handled: boolean;
    severity: ErrorSeverity;
    context: ErrorContext;
    source: string;
  }) {
    this.error = kwargs.error;
    this.handled = kwargs.handled;
    this.severity = kwargs.severity;
    this.context = kwargs.context;
    this.source = kwargs.source;
  }

  isHandled(): boolean {
    return this.handled;
  }
}

/** @internal */
export const ErrorCollector = {
  subscribed: false,

  async record(block: () => unknown): Promise<Report[]> {
    subscribe();
    const recorders =
      IsolatedExecutionState.get<Report[][]>(RECORDERS) ??
      IsolatedExecutionState.set(RECORDERS, [] as Report[][]);
    const reports: Report[] = [];
    recorders.push(reports);
    try {
      await block();
      return reports;
    } finally {
      deleteIf(recorders, (r) => reports === r);
    }
  },

  report(
    error: Error,
    kwargs: {
      handled: boolean;
      severity: ErrorSeverity;
      context: ErrorContext;
      source: string;
    },
  ): boolean {
    const report = new Report({ error, ...kwargs });
    IsolatedExecutionState.get<Report[][]>(RECORDERS)?.forEach((reports) => {
      reports.push(report);
    });
    return true;
  },
};

/**
 * `@mutex.synchronize` (error_reporter_assertions.rb:39) guards a race a
 * single-threaded JS runtime cannot have: nothing can interleave between the
 * `@subscribed` read and the write below.
 *
 * @internal
 */
function deleteIf<T>(array: T[], predicate: (element: T) => boolean): void {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) array.splice(i, 1);
  }
}

/** @internal */
function subscribe(): void {
  if (ErrorCollector.subscribed) return;

  if (ActiveSupport.errorReporter) {
    ActiveSupport.errorReporter.subscribe(ErrorCollector);
    ErrorCollector.subscribed = true;
  } else {
    throw new Assertion("No error reporter is configured");
  }
}

/**
 * Assertion that the block should not cause an exception to be reported
 * to `Rails.error`.
 *
 * Passes if evaluated code in the yielded block reports no exception.
 *
 *   assertNoErrorReported(() => {
 *     performService({ param: "no_exception" });
 *   });
 */
export async function assertNoErrorReported(block: () => unknown): Promise<void> {
  const reports = await ErrorCollector.record(() =>
    _assertNothingRaisedOrWarn("assert_no_error_reported", block),
  );
  // Minitest's `assert_predicate(reports, :empty?)`, with its message.
  assert(
    reports.length === 0,
    () => `Expected [${reports.map((r) => r.error.constructor.name).join(", ")}] to be empty?`,
  );
}

/**
 * Assertion that the block should cause at least one exception to be reported
 * to `Rails.error`.
 *
 * Passes if the evaluated code in the yielded block reports a matching
 * exception. To test further details about the reported exception, use the
 * return value:
 *
 *   const report = await assertErrorReported(IOError, () => { ... });
 *   assertEqual("Oops", report.error.message);
 *
 * Ruby's block is a separate `&block` parameter and is not optional; TypeScript
 * cannot declare a required parameter after `error_class`'s default, so the
 * block carries one too. Rails' `self.assertions += 1` on the matching arm is
 * Minitest's assertion counter, for which trails has no receiver.
 */
export async function assertErrorReported(
  errorClass: abstract new (...args: any[]) => Error = Error,
  block: () => unknown = () => undefined,
): Promise<Report | undefined> {
  const reports = await ErrorCollector.record(() =>
    _assertNothingRaisedOrWarn("assert_error_reported", block),
  );

  let report: Report | undefined;
  if (reports.length === 0) {
    assert(
      false,
      `Expected a ${errorClass.name} to be reported, but there were no errors reported.`,
    );
  } else if ((report = reports.find((r) => r.error instanceof errorClass))) {
    return report;
  } else {
    const message =
      `Expected a ${errorClass.name} to be reported, but none of the ` +
      `${reports.length} reported errors matched:  \n` +
      `${reports.map((r) => r.error.constructor.name).join("\n  ")}`;
    assert(false, message);
  }
  return undefined;
}
