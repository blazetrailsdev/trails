/**
 * ActionDispatch::ExceptionWrapper
 *
 * Wraps exceptions to provide consistent error metadata for error pages.
 */

import { ActionableError, type BacktraceCleaner, getFs, getPath } from "@blazetrails/activesupport";
import { RoutingError } from "../../action-controller/metal/exceptions.js";

export interface ShowExceptionsRequest {
  getHeader(name: string): unknown;
}

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
  ParameterTypeError: 400,
  InvalidParameterError: 400,
  ParamsTooDeepError: 400,
  UnpermittedParameters: 400,
  // ActionDispatch ParseError/ParamError family — Rails' rescue_responses uses
  // the fully-qualified class names that param-error.ts and parameters.ts
  // assign via `this.name`. All map to 400 Bad Request.
  "ActionDispatch::Http::Parameters::ParseError": 400,
  "ActionDispatch::ParamError": 400,
  "ActionDispatch::ParameterTypeError": 400,
  "ActionDispatch::InvalidParameterError": 400,
  "ActionDispatch::ParamsTooDeepError": 400,
};

// Rails keys these by fully-qualified class names. trails error classes set
// `.name` inconsistently (TemplateError uses the Rails-qualified form;
// MissingTemplate/RoutingError/ActionNotFound/MissingExactTemplate use the
// short form), so both spellings live here until the short ones are
// promoted to Rails-qualified names.
/** @internal */
const RESCUE_TEMPLATES: Record<string, string> = {
  "ActionView::MissingTemplate": "missing_template",
  "ActionController::RoutingError": "routing_error",
  "AbstractController::ActionNotFound": "unknown_action",
  "ActiveRecord::StatementInvalid": "invalid_statement",
  "ActionView::Template::Error": "template_error",
  "ActionController::MissingExactTemplate": "missing_exact_template",
  MissingTemplate: "missing_template",
  RoutingError: "routing_error",
  ActionNotFound: "unknown_action",
  StatementInvalid: "invalid_statement",
  MissingExactTemplate: "missing_exact_template",
};

/** @internal */
const WRAPPER_EXCEPTIONS = new Set<string>(["ActionView::Template::Error", "TemplateError"]);

/** @internal */
const SILENT_EXCEPTIONS = new Set<string>([
  "RoutingError",
  "ActionDispatch::Http::MimeNegotiation::InvalidType",
]);

// JS closest analog to Ruby's exception.class.name. Prefer `e.name` first
// since trails error classes set it to the Rails-qualified constant (e.g.
// "ActionDispatch::Http::Parameters::ParseError") that STATUS_MAP /
// SILENT_EXCEPTIONS key off. Fall back to the constructor name so custom
// subclasses that forget to assign `name` don't collapse into the generic
// "Error" bucket. The default inherited "Error" on either side is treated
// as unset.
function classNameOf(e: Error): string {
  if (e.name && e.name !== "Error") return e.name;
  const ctor = e.constructor?.name;
  if (ctor && ctor !== "Error") return ctor;
  return e.name || ctor || "Error";
}

const EXCEPTION_IDS = new WeakMap<object, number>();
let _nextExceptionId = 1;
function _idFor(err: object): number {
  let id = EXCEPTION_IDS.get(err);
  if (id === undefined) {
    id = _nextExceptionId++;
    EXCEPTION_IDS.set(err, id);
  }
  return id;
}

export type TraceEntry = { file: string; line: number };
export type SourceExtract = TraceEntry & { code?: Record<number, string> };

export class ExceptionWrapper {
  readonly exception: Error;
  readonly backtraceCleaner: BacktraceCleaner | null;
  readonly exceptionClassName: string;
  readonly wrappedCauses: ExceptionWrapper[];
  readonly statusCode: number;
  readonly statusText: string;

  constructor(exception: Error);
  constructor(backtraceCleaner: BacktraceCleaner | null, exception: Error);
  constructor(a: Error | BacktraceCleaner | null, b?: Error) {
    const backtraceCleaner = b !== undefined ? (a as BacktraceCleaner | null) : null;
    const exception = b !== undefined ? b : (a as Error);
    this.backtraceCleaner = backtraceCleaner;
    this.exception = exception;
    this.exceptionClassName = classNameOf(exception);
    this.wrappedCauses = this.wrappedCausesFor(exception, backtraceCleaner);
    this.statusCode = this.computeStatusCode();
    this.statusText = STATUS_TEXTS[this.statusCode] ?? "Internal Server Error";
  }

  get unwrappedException(): Error {
    if (WRAPPER_EXCEPTIONS.has(this.exceptionClassName) && this.exception.cause instanceof Error) {
      return this.exception.cause;
    }
    return this.exception;
  }

  get exceptionName(): string {
    const cause = this.exception.cause;
    return cause instanceof Error ? classNameOf(cause) : this.exceptionClassName;
  }

  get message(): string {
    return this.exception.message;
  }

  isRoutingError(): boolean {
    return this.exception instanceof RoutingError || this.exceptionClassName === "RoutingError";
  }

  // ActionView::Template::Error is ported (actionview/src/template/error.ts
  // sets name = "ActionView::Template::Error") but we deliberately avoid
  // importing actionview from actionpack — name match keeps the dependency
  // direction one-way.
  isTemplateError(): boolean {
    return (
      this.exceptionClassName === "TemplateError" ||
      this.exceptionClassName === "ActionView::Template::Error"
    );
  }

  hasCause(): boolean {
    return this.exception.cause != null;
  }
  hasCorrections(): boolean {
    const e = this._e;
    return "originalMessage" in e && "corrections" in e;
  }
  subTemplateMessage(): string {
    const v = this._e.subTemplateMessage;
    return typeof v === "function" ? v.call(this.exception) : "";
  }
  failures(): unknown[] {
    return Array.isArray(this._e.failures) ? this._e.failures : [];
  }
  originalMessage(): string {
    return typeof this._e.originalMessage === "string" ? this._e.originalMessage : this.message;
  }
  corrections(): string[] {
    return Array.isArray(this._e.corrections) ? this._e.corrections : [];
  }
  annotatedSourceCode(): string[] {
    const v = this._e.annotatedSourceCode;
    return typeof v === "function" ? v.call(this.exception) : [];
  }
  fileName(): string | null {
    return typeof this._e.fileName === "string"
      ? this._e.fileName
      : (this.sourceLocation?.file ?? null);
  }
  lineNumber(): number | null {
    return typeof this._e.lineNumber === "number"
      ? this._e.lineNumber
      : (this.sourceLocation?.line ?? null);
  }
  actions(): Record<string, () => void> {
    return ActionableError.actions(this.exception);
  }

  private get _e(): any {
    return this.exception as any;
  }

  rescueTemplate(): string {
    return RESCUE_TEMPLATES[this.exceptionClassName] ?? "diagnostics";
  }

  get traces(): string[] {
    const stack = this.exception.stack;
    if (!stack) return [];
    return stack
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  get applicationTrace(): string[] {
    return this.cleanBacktrace("silent");
  }

  get frameworkTrace(): string[] {
    return this.cleanBacktrace("noise");
  }

  get fullTrace(): string[] {
    return this.cleanBacktrace("all");
  }

  exceptionTrace(): string[] {
    const app = this.applicationTrace;
    if (app.length === 0 && !SILENT_EXCEPTIONS.has(this.exceptionClassName)) {
      return this.frameworkTrace;
    }
    return app;
  }

  traceToShow(): "Application Trace" | "Full Trace" {
    if (this.applicationTrace.length === 0 && this.rescueTemplate() !== "routing_error") {
      return "Full Trace";
    }
    return "Application Trace";
  }

  sourceToShowId(): number {
    return 0;
  }

  get sourceLocation(): TraceEntry | null {
    const firstTrace = this.traces[0];
    if (!firstTrace) return null;
    return this.extractFileAndLineNumber(firstTrace);
  }

  static registerStatus(exceptionName: string, statusCode: number): void {
    STATUS_MAP[exceptionName] = statusCode;
  }

  static statusCodeFor(exceptionName: string): number {
    return STATUS_MAP[exceptionName] ?? 500;
  }

  static statusCodeForException(exceptionName: string): number {
    return ExceptionWrapper.statusCodeFor(exceptionName);
  }

  static rescueResponse(exceptionName: string): boolean {
    return Object.hasOwn(STATUS_MAP, exceptionName) && STATUS_MAP[exceptionName] !== 500;
  }

  show(request: ShowExceptionsRequest): boolean {
    const config = request.getHeader("action_dispatch.show_exceptions");
    if (config === "none") return false;
    if (config === "rescuable") return this.rescueResponse();
    return true;
  }

  rescueResponse(): boolean {
    return ExceptionWrapper.rescueResponse(this.exceptionClassName);
  }

  exceptionInspect(): string {
    return `#<${this.exceptionClassName}: ${this.message}>`;
  }

  exceptionId(): number {
    return _idFor(this.exception);
  }

  get sourceExtracts(): SourceExtract[] {
    return this.backtrace().map((trace) => this.extractSource(trace));
  }

  toResponse(): [number, Record<string, string>, string] {
    return [
      this.statusCode,
      { "content-type": "text/plain; charset=utf-8" },
      `${this.statusCode} ${this.statusText}\n${this.message}\n`,
    ];
  }

  /** @internal */
  backtrace(): string[] {
    return this.buildBacktrace();
  }

  // Rails walks ActionView::PathRegistry to remap template frames; that
  // registry isn't ported yet, so we return the raw stack and let the cleaner
  // handle it.
  /** @internal */
  buildBacktrace(): string[] {
    return this.traces;
  }

  /** @internal */
  *causesFor(exception: Error): Generator<Error> {
    let cur: unknown = exception.cause;
    while (cur instanceof Error) {
      yield cur;
      cur = cur.cause;
    }
  }

  /** @internal */
  wrappedCausesFor(
    exception: Error,
    backtraceCleaner: BacktraceCleaner | null,
  ): ExceptionWrapper[] {
    const out: ExceptionWrapper[] = [];
    for (const cause of this.causesFor(exception)) {
      out.push(new ExceptionWrapper(backtraceCleaner, cause));
    }
    return out;
  }

  /** @internal */
  // Rails passes `kind` straight into BacktraceCleaner#clean (which supports
  // :silent/:noise/:all via its silencer chain). Our cleaner doesn't yet take
  // a kind, so we always apply the local node_modules partition so the three
  // trace getters stay distinct, then let the cleaner post-process the slice.
  cleanBacktrace(kind: "silent" | "noise" | "all"): string[] {
    const lines = this.backtrace();
    const partitioned =
      kind === "silent"
        ? lines.filter((l) => !l.includes("node_modules"))
        : kind === "noise"
          ? lines.filter((l) => l.includes("node_modules"))
          : lines;
    return this.backtraceCleaner ? this.backtraceCleaner.clean(partitioned) : partitioned;
  }

  /** @internal */
  extractSource(trace: string): SourceExtract {
    const loc = this.extractFileAndLineNumber(trace);
    if (!loc) return { file: trace, line: 0 };
    const code = this.sourceFragment(loc.file, loc.line);
    return code ? { ...loc, code } : loc;
  }

  /** @internal */
  extractSourceFragmentLines(sourceLines: string[], line: number): Record<number, string> {
    const start = Math.max(line - 3, 0);
    const slice = sourceLines.slice(start, start + 6);
    const out: Record<number, string> = {};
    for (let i = 0; i < slice.length; i++) out[start + 1 + i] = slice[i];
    return out;
  }

  /** @internal */
  sourceFragment(file: string, line: number): Record<number, string> | null {
    const full = getPath().resolve(getFs().cwd(), file);
    if (!getFs().existsSync(full)) return null;
    try {
      const lines = getFs().readFileSync(full, "utf8").split(/\r?\n/);
      return this.extractSourceFragmentLines(lines, line);
    } catch {
      return null;
    }
  }

  /** @internal */
  extractFileAndLineNumber(trace: string): TraceEntry | null {
    const match =
      trace.match(/\((.+):(\d+):\d+\)/) ??
      trace.match(/at\s+(.+):(\d+):\d+/) ??
      trace.match(/(.+):(\d+):\d+/);
    if (!match) return null;
    return { file: match[1], line: parseInt(match[2], 10) };
  }

  private computeStatusCode(): number {
    return (
      STATUS_MAP[classNameOf(this.unwrappedException)] ?? STATUS_MAP[this.exceptionName] ?? 500
    );
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
