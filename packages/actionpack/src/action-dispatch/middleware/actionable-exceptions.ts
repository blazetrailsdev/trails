/**
 * ActionDispatch::ActionableExceptions
 *
 * Middleware that dispatches actions defined on actionable errors when the
 * exception page POSTs back to its endpoint. Mirrors Rails'
 * `action_dispatch/middleware/actionable_exceptions.rb` 1:1.
 */

import { ActionableError, cattrAccessor } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";
import { LOCATION } from "../constants.js";
import { Request } from "../http/request.js";

export class ActionableExceptions {
  /**
   * Endpoint that actionable-exception forms POST back to. Declared via
   * {@link cattrAccessor} to mirror Rails'
   * `cattr_accessor :endpoint, default: "/rails/actions"`: assignment goes
   * through a getter/setter pair so apps can swap it via
   * `ActionableExceptions.endpoint = "..."` (or via Railtie config) instead of
   * shadowing a plain class field. Rails' `cattr_accessor` stores the value in
   * a single class variable shared across the hierarchy, so subclass writes
   * mutate the same slot — `cattrAccessor` matches that semantics.
   */
  static endpoint: string;

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  static {
    cattrAccessor(ActionableExceptions, "endpoint", { default: "/rails/actions" });
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
