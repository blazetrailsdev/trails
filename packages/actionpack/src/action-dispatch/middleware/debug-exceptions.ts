/**
 * ActionDispatch::DebugExceptions
 *
 * Middleware that catches exceptions and renders debug error pages
 * in development mode.
 */

import { stderr } from "@blazetrails/activesupport/process-adapter";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { ExceptionWrapper } from "./exception-wrapper.js";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

export interface Logger {
  error(message: string): void;
  warn?(message: string): void;
  info?(message: string): void;
}

export interface DebugExceptionsOptions {
  /** Show detailed error pages (default: true) */
  showDetailedExceptions?: boolean;
  /** Show exceptions at all (default: true) */
  showExceptions?: boolean;
  /** Log level for exceptions (default: "error") */
  logLevel?: "error" | "warn" | "info";
  /** Logger instance */
  logger?: Logger;
  /** Log rescued responses (default: true) */
  logRescuedResponses?: boolean;
  /** Interceptors called before rendering error page */
  interceptors?: Interceptor[];
  /** Response shape (default: "default"; "api" disables template rendering) */
  responseFormat?: "default" | "api";
}

export type Interceptor = (env: RackEnv, exception: Error) => void;

export class DebugExceptions {
  /**
   * Class-level interceptor registry. Mirrors Rails'
   * `cattr_reader :interceptors`.
   *
   * @internal
   */
  static readonly interceptors: Interceptor[] = [];

  /**
   * Append an interceptor to the class-level registry. Mirrors Rails'
   * `DebugExceptions.register_interceptor`.
   */
  static registerInterceptor(interceptor: Interceptor): void {
    DebugExceptions.interceptors.push(interceptor);
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

  /**
   * Iterate registered interceptors, swallowing per-interceptor errors
   * and logging them via {@link logError}. Mirrors Rails'
   * `invoke_interceptors`.
   *
   * @internal
   */
  invokeInterceptors(env: RackEnv, exception: Error, wrapper: ExceptionWrapper): void {
    for (const interceptor of this.interceptors) {
      try {
        interceptor(env, exception);
      } catch {
        this.logError(env, wrapper);
      }
    }
  }

  /**
   * Render the API JSON error body for an exception. Mirrors Rails'
   * `render_for_api_request`.
   *
   * @internal
   */
  renderForApiRequest(wrapper: ExceptionWrapper): RackResponse {
    const body = JSON.stringify({
      status: wrapper.statusCode,
      error: wrapper.statusText,
      exception: wrapper.exceptionName,
      traces: {
        "Application Trace": wrapper.applicationTrace,
        "Framework Trace": wrapper.frameworkTrace,
      },
    });
    return this.render(wrapper.statusCode, body, "application/json");
  }

  /**
   * Rack response builder used by {@link renderForApiRequest}. Mirrors
   * Rails' private `DebugExceptions#render(status, body, format)`. The
   * legacy `renderJsonError` / `renderXmlError` / `renderHtmlError` /
   * `renderTextError` paths predate this helper and build their own
   * tuples directly; they should migrate to `render` over time.
   *
   * @internal
   */
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

  /**
   * Format and log a rescued exception. Mirrors Rails' `log_error` —
   * walks `cause` chain, then dispatches to {@link logArray}.
   *
   * @internal
   */
  logError(env: RackEnv, wrapper: ExceptionWrapper): void {
    // Rails: `request.logger || ActionView::Base.logger || stderr_logger`.
    // trails' `request.logger` reads `action_dispatch.logger` then
    // `rack.logger` (http/request.ts:480) — mirror that here, then fall
    // back to the constructor option, then the stderr logger so errors
    // are never silently swallowed.
    const logger =
      (env["action_dispatch.logger"] as Logger | undefined) ??
      (env["rack.logger"] as Logger | undefined) ??
      this.logger ??
      this.stderrLogger();
    if (!this.isLogRescuedResponses(env) && wrapper.statusCode < 500) return;

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
    lines.push(...wrapper.exceptionTrace());
    for (const cause of wrapper.hasCause() ? wrapper.wrappedCauses : []) {
      lines.push(`\nInformation for cause: ${cause.exceptionClassName} (${cause.message}):`);
      lines.push(...cause.annotatedSourceCode());
      lines.push("  ");
      lines.push(...cause.exceptionTrace());
    }
    this.logArray(logger, lines, env);
  }

  /**
   * Newline-join `lines` and emit them via `logger.add(level, ...)`.
   * Mirrors Rails' `log_array`.
   *
   * @internal
   */
  logArray(logger: Logger, lines: string[], env: RackEnv): void {
    if (lines.length === 0) return;
    const level =
      (env["action_dispatch.debug_exception_log_level"] as "error" | "warn" | "info" | undefined) ??
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

  /**
   * Lazily-initialized fallback logger writing to `stderr`. Mirrors
   * Rails' `stderr_logger`.
   *
   * @internal
   */
  stderrLogger(): Logger {
    if (this._stderrLogger) return this._stderrLogger;
    this._stderrLogger = {
      error: (m: string) => stderr.write(`${m}\n`),
      warn: (m: string) => stderr.write(`${m}\n`),
      info: (m: string) => stderr.write(`${m}\n`),
    };
    return this._stderrLogger;
  }

  /**
   * Builds a routes inspector for routing/template errors. Mirrors Rails'
   * `routes_inspector(exception)` — only returns an inspector when the
   * wrapper marks the exception as a routing or template error.
   *
   * @internal
   */
  routesInspector(_wrapper: ExceptionWrapper): unknown {
    // The `@routes_app` constructor argument from Rails isn't plumbed
    // through trails' DebugExceptions yet — there is no routes_app to
    // ask for `.routes`. Return null until the wiring lands.
    return null;
  }

  /**
   * Whether the response should be rendered as an API response. Mirrors
   * Rails' `api_request?` — true when `responseFormat: "api"` was passed
   * to the constructor and the resolved content type is not HTML.
   *
   * @internal
   */
  isApiRequest(contentType: string | null | undefined): boolean {
    if (this.responseFormat !== "api") return false;
    return !contentType || !contentType.includes("text/html");
  }

  /** @internal */
  isLogRescuedResponses(env: RackEnv): boolean {
    const flag = env["action_dispatch.log_rescued_responses"];
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

    // Log the exception
    this.logError(env, wrapper);

    if (!this.showExceptions) {
      throw exception;
    }

    if (!this.showDetailedExceptions) {
      return this.renderMinimalError(wrapper);
    }

    // Determine response format
    const accept = (env["HTTP_ACCEPT"] as string) ?? "";
    const xhr = env["HTTP_X_REQUESTED_WITH"] === "XMLHttpRequest";
    const contentType = (env["CONTENT_TYPE"] as string) ?? "";

    // When configured for the api response format, route any non-HTML
    // request through the Rails-shaped JSON body. Mirrors Rails'
    // `api_request?(content_type) ? render_for_api_request(...) : ...`.
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

    // Default to HTML
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
      .map((line) => `  <li>${this.escapeHtml(line)}</li>`)
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
