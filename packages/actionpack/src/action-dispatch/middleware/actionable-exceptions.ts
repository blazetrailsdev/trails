/**
 * ActionDispatch::ActionableExceptions
 *
 * Middleware that dispatches actions defined on actionable errors when the
 * exception page POSTs back to its endpoint. Mirrors Rails'
 * `action_dispatch/middleware/actionable_exceptions.rb` 1:1.
 */

import { ActionableError } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { LOCATION } from "../constants.js";
import { Request } from "../http/request.js";

export class ActionableExceptions {
  static endpoint = "/rails/actions";

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const request = new Request(env);
    if (!this.actionableRequest(request)) {
      return this.app(env);
    }

    const params = request.params as Record<string, unknown>;
    const errorName = String(params["error"] ?? "");
    const action = String(params["action"] ?? "");

    const cls = ActionableError.lookup(errorName);
    ActionableError.dispatch(cls, action);

    return this.redirectTo(String(params["location"] ?? ""));
  }

  /** @internal */
  private actionableRequest(request: Request): boolean {
    const flag = request.env["action_dispatch.show_detailed_exceptions"];
    return Boolean(flag) && request.isPost && request.path === ActionableExceptions.endpoint;
  }

  /** @internal */
  private redirectTo(location: string): RackResponse {
    let scheme: string | null = null;
    let relative = false;
    try {
      const u = new URL(location);
      scheme = u.protocol.replace(/:$/, "");
    } catch {
      relative = true;
    }

    if (!relative && scheme !== "http" && scheme !== "https") {
      return [
        400,
        { "content-type": "text/plain; charset=utf-8" },
        bodyFromString("Invalid redirection URI"),
      ];
    }

    return [
      302,
      {
        "content-type": "text/html; charset=utf-8",
        "content-length": "0",
        [LOCATION]: location,
      },
      bodyFromString(""),
    ];
  }
}
