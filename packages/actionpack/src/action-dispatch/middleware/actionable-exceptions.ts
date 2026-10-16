import { rbFSend, rbModConstSet, URI } from "@blazetrails/ruby-compat";
import { ActionableError, cattrAccessor } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, CONTENT_LENGTH, CONTENT_TYPE } from "@blazetrails/rack";
import { LOCATION } from "../constants.js";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";
import { ActionDispatch } from "../../namespaces.js";

export class ActionableExceptions {
  static endpoint: string;

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  static {
    cattrAccessor.call(ActionableExceptions, "endpoint", { default: "/rails/actions" });
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const request = new Request(env);
    if (!this.actionableRequest(request)) {
      return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
    }

    const params = request.params;
    const errorName = String(params["error"] ?? "");
    const action = String(params["action"] ?? "");

    const cls = ActionableError.lookup(errorName);
    ActionableError.dispatch(cls, action);

    return this.redirectTo(String(params["location"] ?? ""));
  }

  /** @internal */
  private actionableRequest(request: Request): boolean {
    const flag = request.env["action_dispatch.show_detailed_exceptions"];
    return Boolean(flag) && request.isPost() && request.path === ActionableExceptions.endpoint;
  }

  /** @internal */
  private redirectTo(location: string): RackResponse {
    const uri = URI.parse(location);

    let body: string;
    if (uri.isRelative() || uri.scheme === "http" || uri.scheme === "https") {
      body = "";
    } else {
      return [
        400,
        { [CONTENT_TYPE]: "text/plain; charset=utf-8" },
        bodyFromString("Invalid redirection URI"),
      ];
    }

    return [
      302,
      {
        [CONTENT_TYPE]: `text/html; charset=${Response.defaultCharset}`,
        [CONTENT_LENGTH]: String(new TextEncoder().encode(body).byteLength),
        [LOCATION]: location,
      },
      bodyFromString(body),
    ];
  }
}

rbModConstSet(ActionDispatch, "ActionableExceptions", ActionableExceptions);
