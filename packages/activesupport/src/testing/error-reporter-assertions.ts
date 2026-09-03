import { ActiveSupport } from "../index.js";
import { IsolatedExecutionState } from "../isolated-execution-state.js";
import type { ErrorContext, ErrorSeverity } from "../error-reporter.js";
import { assert, Assertion, _assertNothingRaisedOrWarn } from "./assertions.js";

const RECORDERS = "active_support_error_reporter_assertions";

/** @internal */
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

/** @internal */
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

export async function assertNoErrorReported(block: () => unknown): Promise<void> {
  const reports = await ErrorCollector.record(() =>
    _assertNothingRaisedOrWarn("assert_no_error_reported", block),
  );
  assert(
    reports.length === 0,
    () => `Expected [${reports.map((r) => r.error.constructor.name).join(", ")}] to be empty?`,
  );
}

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
