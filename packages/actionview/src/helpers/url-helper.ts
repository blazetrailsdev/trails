import { SafeBuffer } from "@blazetrails/activesupport";
import {
  ArgumentError,
  InvalidURIError,
  URI,
  isSymbol,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";

import { RoutingUrlFor } from "../routing-url-for.js";
import { tag } from "./tag-helper.js";

export interface UrlHelperHost {
  controller: unknown;
  _backUrl(): string;
  _filteredReferrer(): string | null;
  isProtectAgainstForgery?(): boolean;
  formAuthenticityToken?(options: { formOptions: Record<string, unknown> }): string;
  requestForgeryProtectionToken?: unknown;
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

/** @internal */
export function tokenTag(
  this: UrlHelperHost,
  token: unknown = null,
  { formOptions = {} }: { formOptions?: Record<string, unknown> } = {},
): SafeBuffer | string {
  if (
    token !== false &&
    rbObjRespondTo(this, "isProtectAgainstForgery", true) &&
    this.isProtectAgainstForgery!()
  ) {
    token =
      token === true || token == null
        ? this.formAuthenticityToken!({ formOptions: { ...formOptions, authenticityToken: token } })
        : token;
    return tag("input", {
      type: "hidden",
      name: String(this.requestForgeryProtectionToken),
      value: token,
      autocomplete: "off",
    }) as SafeBuffer;
  } else {
    return "";
  }
}

/** @internal */
export function methodTag(method: unknown): SafeBuffer {
  return tag("input", {
    type: "hidden",
    name: "_method",
    value: String(method),
    autocomplete: "off",
  }) as SafeBuffer;
}
