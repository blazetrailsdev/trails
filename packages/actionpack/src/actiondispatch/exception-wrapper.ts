/**
 * ActionDispatch::ExceptionWrapper
 *
 * Wraps exceptions to provide consistent error metadata for error pages.
 */

const STATUS_MAP: Record<string, number> = {
  Error: 500,
  TypeError: 500,
  RangeError: 500,
  ReferenceError: 500,
  SyntaxError: 500,
  NotFoundError: 404,
  RoutingError: 404,
  UnknownFormat: 406,
  InvalidAuthenticityToken: 422,
  ParameterMissing: 400,
  UnpermittedParameters: 400,
};

export class ExceptionWrapper {
  readonly exception: Error;
  readonly statusCode: number;
  readonly statusText: string;

  constructor(exception: Error) {
    this.exception = exception;
    this.statusCode = this.computeStatusCode();
    this.statusText = STATUS_TEXTS[this.statusCode] ?? "Internal Server Error";
  }

  /** The exception class/constructor name. */
  get exceptionName(): string {
    return this.exception.constructor?.name ?? this.exception.name ?? "Error";
  }

  /** The exception message. */
  get message(): string {
    return this.exception.message;
  }

  /** Get a clean stack trace as an array of lines. */
  get traces(): string[] {
    const stack = this.exception.stack;
    if (!stack) return [];
    return stack
      .split("\n")
      .slice(1) // Remove the first line (error message)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /** Get the application trace (filter out node_modules). */
  get applicationTrace(): string[] {
    return this.traces.filter((line) => !line.includes("node_modules"));
  }

  /** Get the framework trace (only node_modules lines). */
  get frameworkTrace(): string[] {
    return this.traces.filter((line) => line.includes("node_modules"));
  }

  /** Get the source file and line number of the exception. */
  get sourceLocation(): { file: string; line: number } | null {
    const firstTrace = this.traces[0];
    if (!firstTrace) return null;
    // Match patterns like "at Object.<anonymous> (/path/file.ts:10:5)"
    const match = firstTrace.match(/\(([^:]+):(\d+):\d+\)/) ?? firstTrace.match(/at\s+([^:]+):(\d+):\d+/);
    if (!match) return null;
    return { file: match[1], line: parseInt(match[2], 10) };
  }

  /** Register a custom exception → status code mapping. */
  static registerStatus(exceptionName: string, statusCode: number): void {
    STATUS_MAP[exceptionName] = statusCode;
  }

  /** Get the status code for an exception name. */
  static statusCodeFor(exceptionName: string): number {
    return STATUS_MAP[exceptionName] ?? 500;
  }

  /** Build a simple error response. */
  toResponse(): [number, Record<string, string>, string] {
    return [
      this.statusCode,
      { "content-type": "text/plain; charset=utf-8" },
      `${this.statusCode} ${this.statusText}\n${this.message}\n`,
    ];
  }

  private computeStatusCode(): number {
    const name = this.exceptionName;
    return STATUS_MAP[name] ?? 500;
  }
}

const STATUS_TEXTS: Record<number, string> = {
  100: "Continue",
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
};
