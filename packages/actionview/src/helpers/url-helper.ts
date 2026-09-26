import {
  ArgumentError,
  InvalidURIError,
  URI,
  isSymbol,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";

import { RoutingUrlFor } from "../routing-url-for.js";

export interface UrlHelperHost {
  controller: unknown;
  _backUrl(): string;
  _filteredReferrer(): string | null;
}

interface UrlHelperController {
  request: { env: Record<string, unknown> };
}

export const BUTTON_TAG_METHOD_VERBS = ["patch", "put", "delete"];

export class ClassMethods {
  static _urlForModules(): typeof RoutingUrlFor {
    return RoutingUrlFor;
  }
}

export function urlFor(this: UrlHelperHost, options: unknown = null): string {
  if (typeof options === "string" && !isSymbol(options)) {
    return options;
  } else if (options === ":back") {
    return this._backUrl();
  } else {
    throw new ArgumentError(
      "arguments passed to url_for can't be handled. Please require " +
        "routes or provide your own implementation",
    );
  }
}

/** @internal */
export function _backUrl(this: UrlHelperHost): string {
  return this._filteredReferrer() ?? "javascript:history.back()";
}

/** @internal */
export function _filteredReferrer(this: UrlHelperHost): string | null {
  try {
    if (rbObjRespondTo(this.controller, "request")) {
      const referrer = (this.controller as UrlHelperController).request.env["HTTP_REFERER"] as
        | string
        | null
        | undefined;
      if (referrer != null && URI.parse(referrer).scheme !== "javascript") {
        return referrer;
      }
    }
  } catch (e) {
    if (!(e instanceof InvalidURIError)) throw e;
  }
  return null;
}
