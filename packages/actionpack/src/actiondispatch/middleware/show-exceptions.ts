/**
 * ActionDispatch::ShowExceptions
 *
 * Middleware that catches exceptions and renders error pages.
 * Checks the `action_dispatch.show_exceptions` env variable to decide
 * whether to show an error page (:all), only for rescuable exceptions
 * (:rescuable), or re-raise (:none).
 */

import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { ExceptionWrapper } from "../exception-wrapper.js";

export type ShowExceptionsMode = "all" | "rescuable" | "none";

export class ShowExceptions {
  private app: RackApp;
  private exceptionsApp: RackApp;

  constructor(app: RackApp, exceptionsApp: RackApp) {
    this.app = app;
    this.exceptionsApp = exceptionsApp;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const rawMode = env["action_dispatch.show_exceptions"];
    const mode: ShowExceptionsMode =
      rawMode === "all" || rawMode === "rescuable" || rawMode === "none" ? rawMode : "none";

    try {
      return await this.app(env);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (mode === "none") {
        throw err;
      }

      const wrapper = new ExceptionWrapper(err);

      if (mode === "rescuable" && !wrapper.show("rescuable")) {
        throw err;
      }

      env["action_dispatch.exception"] = err;
      const originalPath = env["PATH_INFO"];
      env["action_dispatch.original_path"] = originalPath;
      env["PATH_INFO"] = `/${wrapper.statusCode}`;

      try {
        try {
          const response = await this.exceptionsApp(env);
          const cascade = response[1]["x-cascade"] ?? response[1]["X-Cascade"];
          if (cascade === "pass") {
            return [wrapper.statusCode, { "content-type": "text/plain" }, bodyFromString("")];
          }
          return response;
        } catch {
          return this.failsafeResponse(wrapper);
        }
      } finally {
        env["PATH_INFO"] = originalPath;
      }
    }
  }

  private failsafeResponse(_wrapper: ExceptionWrapper): RackResponse {
    return [
      500,
      { "content-type": "text/plain; charset=utf-8" },
      bodyFromString("500 Internal Server Error\n"),
    ];
  }
}
