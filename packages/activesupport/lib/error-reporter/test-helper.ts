import type {
  ErrorContext,
  ErrorSeverity,
  ErrorSubscriber as ErrorSubscriberInterface,
} from "../error-reporter.js";

export class ErrorSubscriber implements ErrorSubscriberInterface {
  events: Array<[unknown, boolean, ErrorSeverity, string, ErrorContext]> = [];

  report(
    error: unknown,
    {
      handled,
      severity,
      source,
      context,
    }: { handled: boolean; severity: ErrorSeverity; source: string; context: ErrorContext },
  ): void {
    this.events.push([error, handled, severity, source, context]);
  }
}
