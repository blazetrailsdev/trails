import { hasKey } from "@blazetrails/ruby-compat";

import { ActionableError, type BacktraceCleaner } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { statusCode } from "@blazetrails/rack";
import {
  PathRegistry,
  type BacktraceLocation,
  type Spot,
  type Template,
} from "@blazetrails/actionview";
import { RoutingError } from "../../action-controller/metal/exceptions.js";

/** @noRailsEquivalent PERMANENT */
export type BacktraceLine = string | SourceMapLocation;

class SourceMapLocation extends String {
  private template: Template;

  constructor(location: string, template: Template) {
    super(location);
    this.template = template;
  }

  /** @missingRailsCall super — PERMANENT */
  spot(exc: Error): Spot | null {
    const getobj = backtraceLocationFor(String(this));
    if (!getobj) return null;
    const location = this.template.spot(getobj);

    if (location) {
      return this.template.translateLocation(getobj, location);
    }
    return null;
  }
}

/** @noRailsEquivalent PERMANENT */
function labelFor(trace: string): string | null {
  const match = /^at\s+([^\s(]+)\s*\(/.exec(trace.trim());
  if (!match) return null;
  const qualified = match[1];
  return qualified.slice(qualified.lastIndexOf(".") + 1);
}

/** @noRailsEquivalent PERMANENT */
function backtraceLocationFor(trace: string): BacktraceLocation | null {
  const match = /:(\d+):(\d+)\)?$/.exec(trace.trim());
  if (!match) return null;
  return { lineno: Number(match[1]), column: Number(match[2]) };
}

export interface ShowExceptionsRequest {
  getHeader(name: string): unknown;
}

const rescueResponses: Record<string, string> = {
  "ActionController::RoutingError": ":not_found",
  "AbstractController::ActionNotFound": ":not_found",
  "ActionController::MethodNotAllowed": ":method_not_allowed",
  "ActionController::UnknownHttpMethod": ":method_not_allowed",
  "ActionController::NotImplemented": ":not_implemented",
  "ActionController::UnknownFormat": ":not_acceptable",
  "ActionDispatch::Http::MimeNegotiation::InvalidType": ":not_acceptable",
  "ActionController::MissingExactTemplate": ":not_acceptable",
  "ActionController::InvalidAuthenticityToken": ":unprocessable_entity",
  "ActionController::InvalidCrossOriginRequest": ":unprocessable_entity",
  "ActionDispatch::Http::Parameters::ParseError": ":bad_request",
  "ActionController::BadRequest": ":bad_request",
  "ActionController::ParameterMissing": ":bad_request",
  "Rack::QueryParser::ParameterTypeError": ":bad_request",
  "Rack::QueryParser::InvalidParameterError": ":bad_request",
};

const rescueTemplates: Record<string, string> = {
  "ActionView::MissingTemplate": "missing_template",
  "ActionController::RoutingError": "routing_error",
  "AbstractController::ActionNotFound": "unknown_action",
  "ActiveRecord::StatementInvalid": "invalid_statement",
  "ActionView::Template::Error": "template_error",
  "ActionController::MissingExactTemplate": "missing_exact_template",
};

const wrapperExceptions: string[] = ["ActionView::Template::Error"];

const silentExceptions: string[] = [
  "ActionController::RoutingError",
  "ActionDispatch::Http::MimeNegotiation::InvalidType",
];

/** @noRailsEquivalent PERMANENT */
export function classNameOf(e: Error): string {
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
export type TraceWithId = { exceptionObjectId: number; id: number; trace: string };
export type SourceExtract = TraceEntry & {
  code?: Record<number, string | [string, string, string]>;
};

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
    if (
      wrapperExceptions.includes(this.exceptionClassName) &&
      this.exception.cause instanceof Error
    ) {
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
    return this.exception instanceof RoutingError;
  }

  isTemplateError(): boolean {
    return this.exceptionClassName === "ActionView::Template::Error";
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
    return hasKey(rescueTemplates, this.exceptionClassName)
      ? rescueTemplates[this.exceptionClassName]
      : "diagnostics";
  }

  get traces(): Record<string, TraceWithId[]> {
    const applicationTraceWithIds: TraceWithId[] = [];
    const frameworkTraceWithIds: TraceWithId[] = [];
    const fullTraceWithIds: TraceWithId[] = [];

    this.fullTrace.forEach((trace, idx) => {
      const traceWithId: TraceWithId = {
        exceptionObjectId: _idFor(this.exception),
        id: idx,
        trace: String(trace),
      };

      if (this.applicationTrace.includes(trace)) {
        applicationTraceWithIds.push(traceWithId);
      } else {
        frameworkTraceWithIds.push(traceWithId);
      }

      fullTraceWithIds.push(traceWithId);
    });

    return {
      "Application Trace": applicationTraceWithIds,
      "Framework Trace": frameworkTraceWithIds,
      "Full Trace": fullTraceWithIds,
    };
  }

  get applicationTrace(): BacktraceLine[] {
    return this.cleanBacktrace("silent");
  }

  get frameworkTrace(): BacktraceLine[] {
    return this.cleanBacktrace("noise");
  }

  get fullTrace(): BacktraceLine[] {
    return this.cleanBacktrace("all");
  }

  exceptionTrace(): BacktraceLine[] {
    const app = this.applicationTrace;
    if (app.length === 0 && !silentExceptions.includes(this.exceptionClassName)) {
      return this.frameworkTrace;
    }
    return app;
  }

  traceToShow(): "Application Trace" | "Full Trace" {
    if (
      this.traces["Application Trace"].length === 0 &&
      this.rescueTemplate() !== "routing_error"
    ) {
      return "Full Trace";
    }
    return "Application Trace";
  }

  sourceToShowId(): number | undefined {
    return this.traces[this.traceToShow()][0]?.id;
  }

  get sourceLocation(): TraceEntry | null {
    const firstTrace = this.backtrace()[0];
    if (!firstTrace) return null;
    return this.extractFileAndLineNumber(firstTrace);
  }

  static statusCodeForException(className: string): number {
    const status = hasKey(rescueResponses, className)
      ? rescueResponses[className]
      : ":internal_server_error";
    return statusCode(status.slice(1));
  }

  show(request: ShowExceptionsRequest): boolean {
    const config = request.getHeader("action_dispatch.show_exceptions");
    if (config === "none") return false;
    if (config === "rescuable") return this.rescueResponse();
    return true;
  }

  rescueResponse(): boolean {
    return hasKey(rescueResponses, this.exceptionClassName);
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
  backtrace(): BacktraceLine[] {
    return this.buildBacktrace();
  }

  /** @internal */
  buildBacktrace(): BacktraceLine[] {
    const builtMethods = new Map<string, Template>();

    for (const resolver of PathRegistry.allResolvers()) {
      for (const template of resolver.builtTemplates?.() ?? []) {
        builtMethods.set(template.methodName(), template);
      }
    }

    const stack = this.exception.stack;
    if (!stack) return [];
    return stack
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((loc) => {
        const label = labelFor(loc);
        if (label !== null && builtMethods.has(label)) {
          return new SourceMapLocation(loc, builtMethods.get(label)!);
        } else {
          return loc;
        }
      });
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
  cleanBacktrace(args: "silent" | "noise" | "all"): BacktraceLine[] {
    const lines = this.backtrace();
    const partitioned =
      args === "silent"
        ? lines.filter((l) => !String(l).includes("node_modules"))
        : args === "noise"
          ? lines.filter((l) => String(l).includes("node_modules"))
          : lines;
    return this.backtraceCleaner
      ? this.backtraceCleaner.clean(partitioned.map(String))
      : partitioned;
  }

  /** @internal */
  extractSource(trace: BacktraceLine): SourceExtract {
    const spot = trace instanceof SourceMapLocation ? trace.spot(this.exception) : null;

    if (spot) {
      const line = spot.firstLineno;
      const code = this.extractSourceFragmentLines(spot.scriptLines ?? [], line);

      const offending = code[line];
      if (line === spot.lastLineno && typeof offending === "string") {
        code[line] = [
          offending.slice(0, spot.firstColumn),
          offending.slice(spot.firstColumn, spot.lastColumn),
          offending.slice(spot.lastColumn),
        ];
      }

      return { file: String(trace), line, code };
    }

    const loc = this.extractFileAndLineNumber(trace);
    if (!loc) return { file: String(trace), line: 0 };
    const code = this.sourceFragment(loc.file, loc.line);
    return code ? { ...loc, code } : loc;
  }

  /** @internal */
  extractSourceFragmentLines(
    sourceLines: string[],
    line: number,
  ): Record<number, string | [string, string, string]> {
    const start = Math.max(line - 3, 0);
    const slice = sourceLines.slice(start, start + 6);
    const out: Record<number, string> = {};
    for (let i = 0; i < slice.length; i++) out[start + 1 + i] = slice[i];
    return out;
  }

  /** @internal */
  sourceFragment(
    path: string,
    line: number,
  ): Record<number, string | [string, string, string]> | null {
    const full = File.expandPath(path);
    if (!File.isExist(full)) return null;
    try {
      const lines = File.read(full).split(/\r?\n/);
      return this.extractSourceFragmentLines(lines, line);
    } catch {
      return null;
    }
  }

  /** @internal */
  extractFileAndLineNumber(trace: BacktraceLine): TraceEntry | null {
    const text = String(trace);
    const match =
      text.match(/\((.+):(\d+):\d+\)/) ??
      text.match(/at\s+(.+):(\d+):\d+/) ??
      text.match(/(.+):(\d+):\d+/);
    if (!match) return null;
    return { file: match[1], line: parseInt(match[2], 10) };
  }

  private computeStatusCode(): number {
    return ExceptionWrapper.statusCodeForException(classNameOf(this.unwrappedException));
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
