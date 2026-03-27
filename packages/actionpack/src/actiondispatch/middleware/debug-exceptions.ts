/**
 * ActionDispatch::DebugExceptions
 *
 * Middleware that catches exceptions and renders debug error pages
 * in development mode.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { ExceptionWrapper } from "../exception-wrapper.js";

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
  interceptors?: Array<(request: RackEnv, exception: Error) => void>;
}

export class DebugExceptions {
  private app: RackApp;
  private showDetailedExceptions: boolean;
  private showExceptions: boolean;
  private logLevel: "error" | "warn" | "info";
  private logger: Logger | null;
  private logRescuedResponses: boolean;
  private interceptors: Array<(request: RackEnv, exception: Error) => void>;

  constructor(app: RackApp, options: DebugExceptionsOptions = {}) {
    this.app = app;
    this.showDetailedExceptions = options.showDetailedExceptions !== false;
    this.showExceptions = options.showExceptions !== false;
    this.logLevel = options.logLevel ?? "error";
    this.logger = options.logger ?? null;
    this.logRescuedResponses = options.logRescuedResponses !== false;
    this.interceptors = options.interceptors ?? [];
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

    // Run interceptors
    for (const interceptor of this.interceptors) {
      try {
        interceptor(env, exception);
      } catch {
        // Bad interceptors shouldn't break error handling
      }
    }

    // Log the exception
    this.logException(env, exception, wrapper);

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

  private logException(env: RackEnv, exception: Error, wrapper: ExceptionWrapper): void {
    if (!this.logRescuedResponses && wrapper.statusCode < 500) return;

    const logger = (env["action_dispatch.logger"] as Logger) ?? this.logger;
    if (!logger) return;

    const lines = [
      `${wrapper.exceptionName} (${wrapper.message}):`,
      ...wrapper.applicationTrace.slice(0, 10),
    ];

    // Log causes
    let cause = (exception as { cause?: Error }).cause;
    while (cause) {
      lines.push(`Caused by: ${cause.constructor?.name ?? "Error"} (${cause.message})`);
      cause = (cause as { cause?: Error }).cause;
    }

    const message = lines.join("\n");
    const logFn =
      this.logLevel === "warn"
        ? (logger.warn ?? logger.error)
        : this.logLevel === "info"
          ? (logger.info ?? logger.error)
          : logger.error;
    logFn.call(logger, message);
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
