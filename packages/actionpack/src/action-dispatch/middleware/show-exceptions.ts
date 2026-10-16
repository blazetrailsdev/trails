import { excBacktrace, rbFSend, stderr } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { CONTENT_LENGTH, CONTENT_TYPE, bodyFromString } from "@blazetrails/rack";
import type { BacktraceCleaner } from "@blazetrails/activesupport";
import { ExceptionWrapper } from "./exception-wrapper.js";
import { Request } from "../http/request.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { X_CASCADE } from "../constants.js";
import type { RackAppObject } from "./stack.js";

export class ShowExceptions {
  private app: RackApp | RackAppObject;
  private exceptionsApp: RackApp | RackAppObject;

  constructor(app: RackApp | RackAppObject, exceptionsApp: RackApp | RackAppObject) {
    this.app = app;
    this.exceptionsApp = exceptionsApp;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    try {
      return await (rbFSend(this.app, "call", env) as Promise<RackResponse>);
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
        return this.renderException(request.dup(), wrapper);
      } else {
        throw exception;
      }
    }
  }

  /** @internal */
  private async renderException(
    request: Request,
    wrapper: ExceptionWrapper,
  ): Promise<RackResponse> {
    try {
      const status = wrapper.statusCode;
      request.setHeader("action_dispatch.original_path", request.pathInfo);
      request.setHeader("action_dispatch.original_request_method", request.rawRequestMethod);
      this.fallbackToHtmlFormatIfInvalidMimeType(request);
      request.pathInfo = `/${status}`;
      request.requestMethod = "GET";
      const response = await (rbFSend(
        this.exceptionsApp,
        "call",
        request.env,
      ) as Promise<RackResponse>);
      return response[1][X_CASCADE] === "pass" ? this.passResponse(status) : response;
    } catch (failsafeError) {
      stderr.write(
        `Error during failsafe response: ${(failsafeError as Error).message}\n  ${excBacktrace(failsafeError as Error)!.join("\n  ")}\n`,
      );

      return [
        500,
        { [CONTENT_TYPE]: "text/plain; charset=utf-8" },
        bodyFromString(
          "500 Internal Server Error\n" +
            "If you are the administrator of this website, then please read this web " +
            "application's log file and/or the web server's log file to find out what " +
            "went wrong.",
        ),
      ];
    }
  }

  /** @internal */
  private fallbackToHtmlFormatIfInvalidMimeType(request: Request): void {
    try {
      void request.contentMimeType;
    } catch (e) {
      if (!(e instanceof InvalidType)) throw e;
      request.setHeader("CONTENT_TYPE", "text/html");
    }

    try {
      void request.formats;
    } catch (e) {
      if (!(e instanceof InvalidType)) throw e;
      request.setHeader("HTTP_ACCEPT", "text/html");
    }
  }

  /** @internal */
  private passResponse(status: number): RackResponse {
    return [
      status,
      { [CONTENT_TYPE]: "text/html; charset=utf-8", [CONTENT_LENGTH]: "0" },
      bodyFromString(""),
    ];
  }
}
