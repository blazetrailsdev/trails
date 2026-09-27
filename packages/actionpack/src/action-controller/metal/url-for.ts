import type { Request } from "../../action-dispatch/http/request.js";
import { urlOptions as routingUrlOptions } from "../../action-dispatch/routing/url-for.js";
import type { UrlForHost as RoutingUrlForHost } from "../../action-dispatch/routing/url-for.js";

export interface UrlForHost extends RoutingUrlForHost {
  request: Request;
  /** @internal */
  _urlOptions: Readonly<Record<string, unknown>> | null | undefined;
}

export function urlOptions(this: UrlForHost): Record<string, unknown> {
  this._urlOptions ??= Object.freeze({
    host: this.request.host,
    port: this.request.optionalPort,
    protocol: this.request.protocol,
    _recall: this.request.pathParameters,
    ...routingUrlOptions.call(this),
  });

  let sameOrigin: boolean;
  let scriptName: unknown;
  let originalScriptName: unknown;
  if (
    (sameOrigin = this._routes === this.request.routes) ||
    (scriptName = this.request.engineScriptName(this._routes as unknown as { envKey: string })) !=
      null ||
    (originalScriptName = this.request.originalScriptName) != null
  ) {
    const options: Record<string, unknown> = { ...this._urlOptions };
    if (originalScriptName != null) {
      options["originalScriptName"] = originalScriptName;
    } else {
      if (sameOrigin) {
        options["scriptName"] = this.request.scriptName === "" ? "" : this.request.scriptName;
      } else {
        options["scriptName"] = scriptName;
      }
    }
    return Object.freeze(options);
  } else {
    return this._urlOptions as Record<string, unknown>;
  }
}
