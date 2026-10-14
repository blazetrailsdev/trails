import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import type { BacktraceCleaner } from "@blazetrails/activesupport";
import { ExceptionWrapper } from "./exception-wrapper.js";
import { Request } from "../http/request.js";
import type { RackAppObject } from "./stack.js";

export class ShowExceptions {
  private app: RackApp;
  private exceptionsApp: RackApp | RackAppObject;

  constructor(app: RackApp, exceptionsApp: RackApp | RackAppObject) {
    this.app = app;
    this.exceptionsApp = exceptionsApp;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    try {
      return await this.app(env);
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      const request = new Request(env);
      const backtraceCleaner =
        (request.getHeader("action_dispatch.backtrace_cleaner") as BacktraceCleaner | undefined) ??
        null;
      const wrapper = new ExceptionWrapper(backtraceCleaner, exception);
      request.setHeader("action_dispatch.exception", wrapper.unwrappedException);
      request.setHeader("action_dispatch.report_exception", !wrapper.rescueResponse());

      if (wrapper.isShow(request)) {
        return this.renderException({ ...request.env }, wrapper);
      } else {
        throw exception;
      }
    }
  }

  /** @internal */
  private async renderException(
    request: RackEnv,
    wrapper: ExceptionWrapper,
  ): Promise<RackResponse> {
    const status = wrapper.statusCode;
    const originalPath = request["PATH_INFO"];
    const originalMethod = request["REQUEST_METHOD"];
    request["action_dispatch.original_path"] = originalPath;
    request["action_dispatch.original_request_method"] = originalMethod;
    this.fallbackToHtmlFormatIfInvalidMimeType(request);
    request["PATH_INFO"] = `/${status}`;
    request["REQUEST_METHOD"] = "GET";
    try {
      try {
        const response = await (typeof this.exceptionsApp === "function"
          ? this.exceptionsApp(request)
          : this.exceptionsApp.call(request));
        const cascade = response[1]["x-cascade"] ?? response[1]["X-Cascade"];
        return cascade === "pass" ? this.passResponse(status) : response;
      } catch {
        return this.failsafeResponse(wrapper);
      }
    } finally {
      request["PATH_INFO"] = originalPath;
      request["REQUEST_METHOD"] = originalMethod;
    }
  }

  /** @internal */
  private fallbackToHtmlFormatIfInvalidMimeType(request: RackEnv): void {
    const ct = request["CONTENT_TYPE"];
    if (typeof ct === "string" && !isValidMimeLike(ct)) {
      request["CONTENT_TYPE"] = "text/html";
    }
    const accept = request["HTTP_ACCEPT"];
    if (typeof accept === "string" && !isValidMimeLike(accept)) {
      request["HTTP_ACCEPT"] = "text/html";
    }
  }

  /** @internal */
  private passResponse(status: number): RackResponse {
    return [
      status,
      { "content-type": "text/html; charset=utf-8", "content-length": "0" },
      bodyFromString(""),
    ];
  }

  private failsafeResponse(_wrapper: ExceptionWrapper): RackResponse {
    return [
      500,
      { "content-type": "text/plain; charset=utf-8" },
      bodyFromString("500 Internal Server Error\n"),
    ];
  }
}

function isValidMimeLike(value: string): boolean {
  const first = value.split(",")[0]?.trim().split(";")[0]?.trim() ?? "";
  return /^[\w!#$&^_.+*-]+\/[\w!#$&^_.+*-]+$/.test(first);
}
