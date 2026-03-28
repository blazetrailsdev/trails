import type {
  ErrorSubscriber as ErrorSubscriberInterface,
  ReportedError,
} from "../error-reporter.js";

export class ErrorSubscriber implements ErrorSubscriberInterface {
  events: ReportedError[] = [];

  report(reportedError: ReportedError): void {
    this.events.push(reportedError);
  }
}
