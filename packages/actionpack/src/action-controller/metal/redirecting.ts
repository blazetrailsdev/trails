import { statusCode, type StatusSymbol } from "@blazetrails/rack";
import type { ToModel } from "../../action-dispatch/routing/polymorphic-routes.js";
import type { UrlOptions } from "../../action-dispatch/http/url.js";
import { DoubleRenderError } from "../../abstract-controller/rendering.js";
import { ActionControllerError } from "./exceptions.js";
import type { RedirectToResponseOptionsAndFlash } from "./flash.js";
import { Concern, Module, extend, include, mattrAccessor } from "@blazetrails/activesupport";
import { Logger } from "../../abstract-controller/logger.js";
import { UrlFor } from "./url-for.js";

export class UnsafeRedirectError extends Error {
  constructor(message?: string) {
    super(message ?? "Unsafe redirect");
    this.name = "UnsafeRedirectError";
  }
}

// eslint-disable-next-line no-control-regex -- mirrors Rails' ILLEGAL_HEADER_VALUE_REGEX
const ILLEGAL_HEADER_VALUE_REGEX = /[\x00-\x08\x0A-\x1F]/;
const SCHEME_OR_PROTOCOL_RELATIVE_RE = /^([a-z][a-z\d\-+.]*:|\/\/).*/i;

export type RedirectToOptions =
  | string
  | ToModel
  | unknown[]
  | (UrlOptions & Record<string, unknown>)
  | ((this: never) => RedirectToOptions);

export interface RedirectToResponseOptions {
  status?: StatusSymbol | `:${StatusSymbol}` | number;
  allowOtherHost?: boolean;
}

export interface RedirectingHost {
  request: { referer?: string | null; host?: string; protocol?: string; hostWithPort?(): string };
  redirectTo(
    options: RedirectToOptions,
    responseOptionsAndFlash?: RedirectToResponseOptionsAndFlash<string>,
  ): unknown;
  urlFor?(options: unknown): string;
}

interface PrivateHost extends RedirectingHost {
  raiseOnOpenRedirects?: boolean;
  redirectBackOrTo: OmitThisParameter<typeof redirectBackOrTo>;
  _computeRedirectToLocation: OmitThisParameter<typeof _computeRedirectToLocation>;
  _allowOtherHost: OmitThisParameter<typeof _allowOtherHost>;
  _extractRedirectToStatus: OmitThisParameter<typeof _extractRedirectToStatus>;
  _enforceOpenRedirectProtection: OmitThisParameter<typeof _enforceOpenRedirectProtection>;
  _urlHostAllowed: OmitThisParameter<typeof _urlHostAllowed>;
  _ensureUrlIsHttpHeaderSafe: OmitThisParameter<typeof _ensureUrlIsHttpHeaderSafe>;
}

interface RedirectToHost extends PrivateHost {
  request: RedirectingHost["request"] & { protocol?: string; hostWithPort?(): string };
  location: string;
  responseBody: unknown;
  status: number | string;
}

export function redirectTo(
  this: RedirectToHost,
  options: RedirectToOptions = {},
  responseOptions: RedirectToResponseOptions = {},
): number {
  if (options == null || (options as unknown) === false) {
    throw new ActionControllerError("Cannot redirect to nil!");
  }
  if (this.responseBody != null) throw new DoubleRenderError();

  const allowOtherHost = Object.hasOwn(responseOptions, "allowOtherHost")
    ? (responseOptions.allowOtherHost as boolean)
    : this._allowOtherHost();
  delete responseOptions.allowOtherHost;

  const proposedStatus = this._extractRedirectToStatus(options, responseOptions);

  const redirectToLocation = this._computeRedirectToLocation(this.request, options);
  this._ensureUrlIsHttpHeaderSafe(redirectToLocation);

  this.location = this._enforceOpenRedirectProtection(redirectToLocation, {
    allowOtherHost,
  });
  this.responseBody = "";
  return (this.status = proposedStatus);
}

export function redirectBack(
  this: PrivateHost,
  {
    fallbackLocation,
    allowOtherHost = this._allowOtherHost(),
    ...args
  }: { fallbackLocation: string; allowOtherHost?: boolean } & Record<string, unknown>,
): unknown {
  return this.redirectBackOrTo(fallbackLocation, { allowOtherHost, ...args });
}

export function redirectBackOrTo(
  this: PrivateHost,
  fallbackLocation: string,
  options: { allowOtherHost?: boolean } & Record<string, unknown> = {},
): unknown {
  const { allowOtherHost: explicitAllow, ...redirectOptions } = options;
  const allowOtherHost = Object.hasOwn(options, "allowOtherHost")
    ? explicitAllow
    : this._allowOtherHost();
  const referer = this.request.referer;
  if (referer && (allowOtherHost || this._urlHostAllowed(referer))) {
    return this.redirectTo(referer, { allowOtherHost, ...redirectOptions });
  } else {
    return this.redirectTo(fallbackLocation, redirectOptions);
  }
}

export function urlFrom(this: PrivateHost, location: string | null | undefined): string | null {
  if (!location || location.trim() === "") return null;
  return this._urlHostAllowed(location) ? location : null;
}

/** @internal */
export function _computeRedirectToLocation(
  this: RedirectingHost | void,
  request: { protocol?: string; hostWithPort?(): string },
  options: unknown,
): string {
  let result: string;
  if (typeof options === "string") {
    if (SCHEME_OR_PROTOCOL_RELATIVE_RE.test(options)) {
      result = options;
    } else {
      result = `${request.protocol ?? ""}${request.hostWithPort?.() ?? ""}${options}`;
    }
  } else if (typeof options === "function") {
    const self = this as RedirectingHost | undefined;
    const resolved = (options as (this: unknown) => unknown).call(self);
    return _computeRedirectToLocation.call(self as RedirectingHost, request, resolved);
  } else {
    const self = this as RedirectingHost | undefined;
    if (self && typeof self.urlFor === "function") {
      result = self.urlFor(options);
    } else {
      throw new TypeError(
        `_computeRedirectToLocation: cannot resolve options of type ${typeof options} without a urlFor() host`,
      );
    }
  }
  return result.replace(/[\0\r\n]/g, "");
}

/** @internal */
export function _allowOtherHost(this: PrivateHost): boolean {
  return !this.raiseOnOpenRedirects;
}

/** @internal */
export function _extractRedirectToStatus(
  this: unknown,
  options: unknown,
  responseOptions: RedirectToResponseOptions,
): number {
  if (
    options !== null &&
    typeof options === "object" &&
    !Array.isArray(options) &&
    Object.hasOwn(options, "status")
  ) {
    const opts = options as Record<string, unknown>;
    const status = opts.status;
    delete opts.status;
    return statusCode(status as number | string);
  }
  if (Object.hasOwn(responseOptions, "status")) {
    return statusCode(responseOptions.status as number | string);
  }
  return 302;
}

/** @internal */
export function _enforceOpenRedirectProtection(
  this: PrivateHost,
  location: string,
  { allowOtherHost }: { allowOtherHost: boolean },
): string {
  if (allowOtherHost || this._urlHostAllowed(location)) {
    return location;
  }
  const truncated = location.length > 100 ? `${location.slice(0, 97)}...` : location;
  throw new UnsafeRedirectError(
    `Unsafe redirect to ${JSON.stringify(truncated)}, pass allow_other_host: true to redirect anyway.`,
  );
}

/** @internal */
export function _urlHostAllowed(this: RedirectingHost, url: unknown): boolean {
  const raw = url == null ? "" : String(url);
  let host: string | null = null;
  if (/^[a-z][a-z\d\-+.]*:/i.test(raw)) {
    try {
      host = new URL(raw).hostname || null;
    } catch {
      return false;
    }
  }
  if (host !== null) return host === (this.request.host ?? "");
  if (!raw.startsWith("/")) return false;
  return !raw.startsWith("//");
}

/** @internal */
export function _ensureUrlIsHttpHeaderSafe(this: unknown, url: string): void {
  if (ILLEGAL_HEADER_VALUE_REGEX.test(url)) {
    throw new UnsafeRedirectError(
      `The redirect URL ${url} contains one or more illegal HTTP header field character. ` +
        `Set of legal characters defined in https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6`,
    );
  }
}

type IncludedBlock = { included(base: null, block: (this: object) => void): void };

export const Redirecting = new Module((mod) => {
  extend(mod, Concern);

  include(mod, Logger);
  include(mod, UrlFor);

  (mod as unknown as IncludedBlock).included(null, function (this: object) {
    mattrAccessor.call(this, "raiseOnOpenRedirects", { default: false });
  });

  mod.defineMethod("redirectTo", redirectTo);
  mod.defineMethod("redirectBack", redirectBack);
  mod.defineMethod("redirectBackOrTo", redirectBackOrTo);
  mod.defineMethod("_computeRedirectToLocation", _computeRedirectToLocation);
  mod.defineMethod("urlFrom", urlFrom);
  mod.defineMethod("_allowOtherHost", _allowOtherHost);
  mod.defineMethod("_extractRedirectToStatus", _extractRedirectToStatus);
  mod.defineMethod("_enforceOpenRedirectProtection", _enforceOpenRedirectProtection);
  mod.defineMethod("_urlHostAllowed", _urlHostAllowed);
  mod.defineMethod("_ensureUrlIsHttpHeaderSafe", _ensureUrlIsHttpHeaderSafe);
}) as Module<{
  redirectTo: typeof redirectTo;
  redirectBack: typeof redirectBack;
  redirectBackOrTo: typeof redirectBackOrTo;
  _computeRedirectToLocation: typeof _computeRedirectToLocation;
  urlFrom: typeof urlFrom;
}> & { _computeRedirectToLocation: typeof _computeRedirectToLocation };
Redirecting._computeRedirectToLocation = _computeRedirectToLocation;
