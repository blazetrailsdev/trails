import { rbInspect, stderr } from "@blazetrails/ruby-compat";
import { toXml, type BacktraceCleaner } from "@blazetrails/activesupport";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { ExceptionWrapper } from "./exception-wrapper.js";
import { X_CASCADE } from "../constants.js";
import type { MimeType } from "../http/mime-type.js";
import { Request } from "../http/request.js";
import { RoutingError } from "../../action-controller/metal/exceptions.js";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

/** @noRailsEquivalent PERMANENT */
export interface Logger {
  error(message: string): void;
  warn?(message: string): void;
  info?(message: string): void;
}

export interface DebugExceptionsOptions {
  showDetailedExceptions?: boolean;
  showExceptions?: boolean;
  logLevel?: "error" | "warn" | "info";
  logger?: Logger;
  logRescuedResponses?: boolean;
  interceptors?: Interceptor[];
  responseFormat?: "default" | "api";
}

export type Interceptor = (env: RackEnv, exception: Error) => void;

const API_SERIALIZERS: Record<string, (body: Record<string, unknown>) => string> = {
  ":json": (body) => JSON.stringify(body),
  ":xml": (body) => toXml(body),
};

export class DebugExceptions {
  /** @internal */
  static readonly interceptors: Interceptor[] = [];

  static registerInterceptor(object: Interceptor): void {
    DebugExceptions.interceptors.push(object);
  }

  private app: RackApp;
  private showDetailedExceptions: boolean;
  private showExceptions: boolean;
  private logLevel: "error" | "warn" | "info";
  private logger: Logger | null;
  private logRescuedResponses: boolean;
  private interceptors: Interceptor[];
  private responseFormat: "default" | "api";
  private _stderrLogger?: Logger;

  constructor(app: RackApp, options: DebugExceptionsOptions = {}) {
    this.app = app;
    this.showDetailedExceptions = options.showDetailedExceptions !== false;
    this.showExceptions = options.showExceptions !== false;
    this.logLevel = options.logLevel ?? "error";
    this.logger = options.logger ?? null;
    this.logRescuedResponses = options.logRescuedResponses !== false;
    this.interceptors = options.interceptors ?? [...DebugExceptions.interceptors];
    this.responseFormat = options.responseFormat ?? "default";
  }

  /** @internal */
  invokeInterceptors(request: RackEnv, exception: Error, wrapper: ExceptionWrapper): void {
    for (const interceptor of this.interceptors) {
      try {
        interceptor(request, exception);
      } catch {
        this.logError(request, wrapper);
      }
    }
  }

  /** @internal */
  renderForApiRequest(contentType: MimeType | undefined, wrapper: ExceptionWrapper): RackResponse {
    const body = {
      status: wrapper.statusCode,
      error: wrapper.statusText,
      exception: wrapper.exceptionInspect(),
      traces: wrapper.traces,
    };
    const serializer = contentType ? API_SERIALIZERS[contentType.symbol ?? ""] : undefined;
    if (contentType && serializer) {
      return this.render(wrapper.statusCode, serializer(body), contentType.toString());
    }
    return this.render(wrapper.statusCode, JSON.stringify(body), "application/json");
  }

  /** @internal */
  render(status: number, body: string, format: string): RackResponse {
    const charset = "utf-8";
    return [
      status,
      {
        "content-type": `${format}; charset=${charset}`,
        "content-length": String(Buffer.byteLength(body, "utf8")),
      },
      bodyFromString(body),
    ];
  }

  /** @internal */
  logError(request: RackEnv, wrapper: ExceptionWrapper): void {
    const logger =
      (request["action_dispatch.logger"] as Logger | undefined) ??
      (request["rack.logger"] as Logger | undefined) ??
      this.logger ??
      this.stderrLogger();
    if (!this.isLogRescuedResponses(request) && wrapper.statusCode < 500) return;

    const lines: string[] = ["  "];
    if (wrapper.hasCause()) {
      lines.push(`${wrapper.exceptionClassName} (${wrapper.message})`);
      for (const cause of wrapper.wrappedCauses) {
        lines.push(`Caused by: ${cause.exceptionClassName} (${cause.message})`);
      }
      lines.push(`\nInformation for: ${wrapper.exceptionClassName} (${wrapper.message}):`);
    } else {
      lines.push(`${wrapper.exceptionClassName} (${wrapper.message}):`);
    }
    lines.push(...wrapper.annotatedSourceCode());
    lines.push("  ");
    lines.push(...wrapper.exceptionTrace().map(String));
    for (const cause of wrapper.hasCause() ? wrapper.wrappedCauses : []) {
      lines.push(`\nInformation for cause: ${cause.exceptionClassName} (${cause.message}):`);
      lines.push(...cause.annotatedSourceCode());
      lines.push("  ");
      lines.push(...cause.exceptionTrace().map(String));
    }
    this.logArray(logger, lines, request);
  }

  /** @internal */
  logArray(logger: Logger, lines: string[], request: RackEnv): void {
    if (lines.length === 0) return;
    const level =
      (request["action_dispatch.debug_exception_log_level"] as typeof this.logLevel | undefined) ??
      this.logLevel;
    const message = lines.join("\n");
    const fn =
      level === "warn"
        ? (logger.warn ?? logger.error)
        : level === "info"
          ? (logger.info ?? logger.error)
          : logger.error;
    fn.call(logger, message);
  }

  /** @internal */
  stderrLogger(): Logger {
    if (this._stderrLogger) return this._stderrLogger;
    this._stderrLogger = {
      error: (m: string) => stderr.write(`${m}\n`),
      warn: (m: string) => stderr.write(`${m}\n`),
      info: (m: string) => stderr.write(`${m}\n`),
    };
    return this._stderrLogger;
  }

  /** @internal */
  routesInspector(_exception: ExceptionWrapper): unknown {
    return null;
  }

  /** @internal */
  isApiRequest(contentType: MimeType | null | undefined): boolean {
    return this.responseFormat === "api" && !contentType?.isHtml();
  }

  /** @internal */
  isLogRescuedResponses(request: RackEnv): boolean {
    const flag = request["action_dispatch.log_rescued_responses"];
    return flag === undefined ? this.logRescuedResponses : Boolean(flag);
  }

  async call(env: RackEnv): Promise<RackResponse> {
    try {
      const response = await this.app(env);
      const [, headers, body] = response;

      if (headers[X_CASCADE] === "pass") {
        const closable = body as { close?: () => void };
        if (typeof closable.close === "function") closable.close();
        throw new RoutingError(
          `No route matches [${env["REQUEST_METHOD"]}] ${rbInspect(env["PATH_INFO"])}`,
        );
      }

      return response;
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      const backtraceCleaner =
        (env["action_dispatch.backtrace_cleaner"] as BacktraceCleaner | undefined) ?? null;
      const wrapper = new ExceptionWrapper(backtraceCleaner, exception);

      this.invokeInterceptors(env, exception, wrapper);
      if (!this.showExceptions) throw exception;
      return this.renderException(env, exception, wrapper);
    }
  }

  private renderException(
    request: RackEnv,
    exception: Error,
    wrapper: ExceptionWrapper,
  ): RackResponse {
    this.logError(request, wrapper);

    if (!this.showDetailedExceptions) {
      throw exception;
    }

    const xhr = request["HTTP_X_REQUESTED_WITH"] === "XMLHttpRequest";
    const contentType = (request["CONTENT_TYPE"] as string) ?? "";

    const format = new Request(request).formats[0];
    if (this.isApiRequest(format)) {
      return this.renderForApiRequest(format, wrapper);
    }

    if (xhr || contentType.includes("text/plain")) {
      return this.renderTextError(wrapper);
    }

    return this.renderHtmlError(wrapper, request);
  }

  private renderTextError(wrapper: ExceptionWrapper): RackResponse {
    const body = [
      `${wrapper.exceptionName} (${wrapper.message})`,
      "",
      ...wrapper.applicationTrace.slice(0, 10),
    ].join("\n");

    return [
      wrapper.statusCode,
      { "content-type": "text/plain; charset=utf-8" },
      bodyFromString(body),
    ];
  }

  private renderHtmlError(wrapper: ExceptionWrapper, env: RackEnv): RackResponse {
    const method = (env["REQUEST_METHOD"] as string) ?? "GET";
    const path = (env["PATH_INFO"] as string) ?? "/";
    const controller = env["action_dispatch.controller"] as string | undefined;

    const traceHtml = wrapper.applicationTrace
      .slice(0, 20)
      .map((line) => `  <li>${this.escapeHtml(String(line))}</li>`)
      .join("\n");

    const html = [
      "<!DOCTYPE html>",
      "<html>",
      "<head>",
      `  <title>${wrapper.exceptionName} at ${this.escapeHtml(path)}</title>`,
      '  <meta charset="utf-8">',
      "</head>",
      "<body>",
      `  <h1>${this.escapeHtml(wrapper.exceptionName)}</h1>`,
      `  <h2>${this.escapeHtml(wrapper.message)}</h2>`,
      controller ? `  <p>Controller: ${this.escapeHtml(controller)}</p>` : "",
      `  <p>Request: ${this.escapeHtml(method)} ${this.escapeHtml(path)}</p>`,
      "  <h3>Application Trace</h3>",
      "  <ul>",
      traceHtml,
      "  </ul>",
      "</body>",
      "</html>",
    ]
      .filter((l) => l.length > 0)
      .join("\n");

    return [
      wrapper.statusCode,
      { "content-type": "text/html; charset=utf-8" },
      bodyFromString(html),
    ];
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
