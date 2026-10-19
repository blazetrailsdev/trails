import {
  DelegateClass,
  excBacktraceLocations,
  File,
  Location,
  Pathname,
  rbObjClassname,
  rbObjRespondTo,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";

import {
  ActionableError,
  cattrAccessor,
  TopLevel,
  type BacktraceCleaner,
} from "@blazetrails/activesupport";
import { statusCode } from "@blazetrails/rack";
import { PathRegistry, type Spot, type Template } from "@blazetrails/actionview";
import { RoutingError } from "../../action-controller/metal/exceptions.js";

/** @noRailsEquivalent PERMANENT */
export type BacktraceLine = Location | SourceMapLocation;

/** @internal */
export class SourceMapLocation extends DelegateClass(Location) {
  private template: Template;

  constructor(location: Location, template: Template) {
    super(location);
    this.template = template;
  }

  spot(exc: Error): Spot | null {
    const location = this.template.spot(this.__getobj__());

    if (location) {
      return this.template.translateLocation(this.__getobj__(), location);
    }
    return null;
  }
}

export interface ShowExceptionsRequest {
  getHeader(name: string): unknown;
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
export type SourceExtract = {
  code: Record<number, string | [string, string, string]> | null;
  lineNumber: number;
};

export class ExceptionWrapper {
  declare static rescueResponses: Record<string, string | number>;
  declare static rescueTemplates: Record<string, string>;
  declare static wrapperExceptions: string[];
  declare static silentExceptions: string[];
  declare rescueResponses: Record<string, string | number>;
  declare rescueTemplates: Record<string, string>;
  declare wrapperExceptions: string[];
  declare silentExceptions: string[];

  static {
    cattrAccessor.call(this, "rescueResponses", {
      default: {
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
      },
    });

    cattrAccessor.call(this, "rescueTemplates", {
      default: {
        "ActionView::MissingTemplate": "missing_template",
        "ActionController::RoutingError": "routing_error",
        "AbstractController::ActionNotFound": "unknown_action",
        "ActiveRecord::StatementInvalid": "invalid_statement",
        "ActionView::Template::Error": "template_error",
        "ActionController::MissingExactTemplate": "missing_exact_template",
      },
    });

    cattrAccessor.call(this, "wrapperExceptions", {
      default: ["ActionView::Template::Error"],
    });

    cattrAccessor.call(this, "silentExceptions", {
      default: [
        "ActionController::RoutingError",
        "ActionDispatch::Http::MimeNegotiation::InvalidType",
      ],
    });
  }

  readonly exception: Error;
  readonly backtraceCleaner: BacktraceCleaner | null;
  readonly exceptionClassName: string;
  readonly wrappedCauses: ExceptionWrapper[];
  readonly statusCode: number;
  /** @internal */
  readonly backtrace: BacktraceLine[];

  constructor(exception: Error);
  constructor(backtraceCleaner: BacktraceCleaner | null, exception: Error);
  constructor(a: Error | BacktraceCleaner | null, b?: Error) {
    const backtraceCleaner = b !== undefined ? (a as BacktraceCleaner | null) : null;
    const exception = b !== undefined ? b : (a as Error);
    this.backtraceCleaner = backtraceCleaner;
    this.exception = exception;
    this.exceptionClassName = rbObjClassname(exception);
    this.wrappedCauses = this.wrappedCausesFor(exception, backtraceCleaner);
    this.statusCode = this.computeStatusCode();
    this.backtrace = this.buildBacktrace();
  }

  get unwrappedException(): Error {
    if (
      this.wrapperExceptions.includes(this.exceptionClassName) &&
      this.exception.cause instanceof Error
    ) {
      return this.exception.cause;
    }
    return this.exception;
  }

  get exceptionName(): string {
    const cause = this.exception.cause;
    return cause instanceof Error ? rbObjClassname(cause) : this.exceptionClassName;
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
    return Object.hasOwn(this.rescueTemplates, this.exceptionClassName)
      ? this.rescueTemplates[this.exceptionClassName]
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

  get applicationTrace(): Array<BacktraceLine | string> {
    return this.cleanBacktrace("silent");
  }

  get frameworkTrace(): Array<BacktraceLine | string> {
    return this.cleanBacktrace("noise");
  }

  get fullTrace(): Array<BacktraceLine | string> {
    return this.cleanBacktrace("all");
  }

  exceptionTrace(): Array<BacktraceLine | string> {
    const app = this.applicationTrace;
    if (app.length === 0 && !this.silentExceptions.includes(this.exceptionClassName)) {
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
    const firstTrace = this.backtrace[0];
    if (!firstTrace) return null;
    const [file, line] = this.extractFileAndLineNumber(firstTrace);
    return file == null ? null : { file, line };
  }

  static statusCodeForException(className: string): number {
    const status = Object.hasOwn(this.rescueResponses, className)
      ? this.rescueResponses[className]
      : ":internal_server_error";
    return statusCode(status);
  }

  isShow(request: ShowExceptionsRequest): boolean {
    const config = request.getHeader("action_dispatch.show_exceptions");
    if (config === "none") return false;
    if (config === "rescuable") return this.rescueResponse();
    return true;
  }

  rescueResponse(): boolean {
    return Object.hasOwn(this.rescueResponses, this.exceptionClassName);
  }

  exceptionInspect(): string {
    return `#<${this.exceptionClassName}: ${this.message}>`;
  }

  exceptionId(): number {
    return _idFor(this.exception);
  }

  get sourceExtracts(): SourceExtract[] {
    return this.backtrace.map((trace) => this.extractSource(trace));
  }

  /** @internal */
  buildBacktrace(): BacktraceLine[] {
    const builtMethods = new Map<string, Template>();

    for (const resolver of PathRegistry.allResolvers()) {
      for (const template of resolver.builtTemplates?.() ?? []) {
        builtMethods.set(template.methodName(), template);
      }
    }

    return (excBacktraceLocations(this.exception) ?? []).map((loc) => {
      if (builtMethods.has(loc.label ?? "")) {
        return new SourceMapLocation(loc, builtMethods.get(loc.label ?? "")!);
      } else {
        return loc;
      }
    });
  }

  /** @internal */
  causesFor(exception: Error): Enumerator<Error>;
  /** @internal */
  causesFor(exception: Error, block: (cause: Error) => void): void;
  /** @internal */
  causesFor(exception: Error, block?: (cause: Error) => void): Enumerator<Error> | void {
    if (!block) return toEnum(this, "causesFor", exception);

    while ((exception = exception.cause as Error) != null) block(exception);
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
  cleanBacktrace(args: "silent" | "noise" | "all"): Array<BacktraceLine | string> {
    if (this.backtraceCleaner) {
      return this.backtraceCleaner.clean(this.backtrace, args);
    } else {
      return this.backtrace;
    }
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

      return {
        code: code,
        lineNumber: line,
      };
    }

    const [file, lineNumber] = this.extractFileAndLineNumber(trace);

    return {
      code: this.sourceFragment(file, lineNumber),
      lineNumber: lineNumber,
    };
  }

  /** @internal */
  extractSourceFragmentLines(
    sourceLines: Iterable<string>,
    line: number,
  ): Record<number, string | [string, string, string]> {
    const start = Math.max(line - 3, 0);
    const slice = [...sourceLines].slice(start, start + 6);
    const out: Record<number, string> = {};
    for (let i = 0; i < slice.length; i++) out[start + 1 + i] = slice[i];
    return out;
  }

  /** @internal */
  sourceFragment(
    path: string,
    line: number,
  ): Record<number, string | [string, string, string]> | null {
    if (!(rbObjRespondTo(TopLevel.Trails, "root") && TopLevel.Trails!.root() != null)) return null;
    const fullPath = new Pathname(TopLevel.Trails!.root()!).join(path).toString();
    if (File.isExist(fullPath)) {
      return File.open(fullPath, "r", (file) =>
        this.extractSourceFragmentLines(file.eachLine(), line),
      );
    }
    return null;
  }

  /** @internal */
  extractFileAndLineNumber(trace: BacktraceLine): [string, number] {
    return [trace.path, trace.lineno];
  }

  private computeStatusCode(): number {
    return ExceptionWrapper.statusCodeForException(rbObjClassname(this.unwrappedException));
  }
}
