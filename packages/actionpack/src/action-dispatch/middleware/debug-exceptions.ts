import { stderr } from "@blazetrails/ruby-compat";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { ExceptionWrapper } from "./exception-wrapper.js";

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
  renderForApiRequest(wrapper: ExceptionWrapper): RackResponse {
    const body = JSON.stringify({
      status: wrapper.statusCode,
      error: wrapper.statusText,
      exception: wrapper.exceptionName,
      traces: wrapper.traces,
    });
    return this.render(wrapper.statusCode, body, "application/json");
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
  isApiRequest(contentType: string | null | undefined): boolean {
    if (this.responseFormat !== "api") return false;
    return !contentType || !contentType.includes("text/html");
  }

  /** @internal */
  isLogRescuedResponses(request: RackEnv): boolean {
    const flag = request["action_dispatch.log_rescued_responses"];
    return flag === undefined ? this.logRescuedResponses : Boolean(flag);
  }

  async call(env: RackEnv): Promise<RackResponse> {
    try {
      const response = await this.app(env);
      return response;
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      return this.renderException(env, exception);
    }
  }

  private renderException(env: RackEnv, exception: Error): RackResponse {
    const wrapper = new ExceptionWrapper(exception);

    this.invokeInterceptors(env, exception, wrapper);

    this.logError(env, wrapper);

    if (!this.showExceptions) {
      throw exception;
    }

    if (!this.showDetailedExceptions) {
      return this.renderMinimalError(wrapper);
    }

    const accept = (env["HTTP_ACCEPT"] as string) ?? "";
    const xhr = env["HTTP_X_REQUESTED_WITH"] === "XMLHttpRequest";
    const contentType = (env["CONTENT_TYPE"] as string) ?? "";

    const negotiated = accept || contentType;
    if (this.isApiRequest(negotiated)) {
      return this.renderForApiRequest(wrapper);
    }

    if (xhr || contentType.includes("text/plain")) {
      return this.renderTextError(wrapper);
    }

    if (accept.includes("application/json") || contentType.includes("application/json")) {
      return this.renderJsonError(wrapper, env);
    }

    if (accept.includes("application/xml") || accept.includes("text/xml")) {
      return this.renderXmlError(wrapper);
    }

    return this.renderHtmlError(wrapper, env);
  }

  private renderMinimalError(wrapper: ExceptionWrapper): RackResponse {
    return [
      wrapper.statusCode,
      { "content-type": "text/plain; charset=utf-8" },
      bodyFromString(`${wrapper.statusCode} ${wrapper.statusText}\n`),
    ];
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

  private renderJsonError(wrapper: ExceptionWrapper, env: RackEnv): RackResponse {
    const json = JSON.stringify({
      status: wrapper.statusCode,
      error: wrapper.statusText,
      exception: wrapper.exceptionName,
      message: wrapper.message,
      traces: {
        "Application Trace": wrapper.applicationTrace.slice(0, 10),
        "Framework Trace": wrapper.frameworkTrace.slice(0, 10),
      },
    });

    return [
      wrapper.statusCode,
      { "content-type": "application/json; charset=utf-8" },
      bodyFromString(json),
    ];
  }

  private renderXmlError(wrapper: ExceptionWrapper): RackResponse {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<error>",
      `  <status>${wrapper.statusCode}</status>`,
      `  <message>${this.escapeXml(wrapper.statusText)}</message>`,
      `  <exception>${this.escapeXml(wrapper.exceptionName)}</exception>`,
      `  <detail>${this.escapeXml(wrapper.message)}</detail>`,
      "</error>",
    ].join("\n");

    return [
      wrapper.statusCode,
      { "content-type": "application/xml; charset=utf-8" },
      bodyFromString(xml),
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

  private escapeXml(str: string): string {
    return this.escapeHtml(str);
  }
}
