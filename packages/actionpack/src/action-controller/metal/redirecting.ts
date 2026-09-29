import { statusCode } from "@blazetrails/rack";
import { DoubleRenderError } from "../../abstract-controller/rendering.js";
import { ActionControllerError } from "./exceptions.js";

export class UnsafeRedirectError extends Error {
  constructor(message?: string) {
    super(message ?? "Unsafe redirect");
    this.name = "UnsafeRedirectError";
  }
}

// eslint-disable-next-line no-control-regex -- mirrors Rails' ILLEGAL_HEADER_VALUE_REGEX
const ILLEGAL_HEADER_VALUE_REGEX = /[\x00-\x08\x0A-\x1F]/;
const SCHEME_OR_PROTOCOL_RELATIVE_RE = /^([a-z][a-z\d\-+.]*:|\/\/).*/i;

export interface RedirectingHost {
  request: { referer?: string | null; host?: string; protocol?: string; hostWithPort?: string };
  redirectTo(options: string, responseOptions?: Record<string, unknown>): void;
  urlFor?(options: unknown): string;
}

interface PrivateHost extends RedirectingHost {
  raiseOnOpenRedirects?: boolean;
}

interface RedirectToHost extends PrivateHost {
  request: RedirectingHost["request"] & { protocol?: string; hostWithPort?: string };
  readonly performed: boolean;
  location: string;
  responseBody: unknown;
  status: number | string;
}

export function redirectTo(
  this: RedirectToHost,
  options: unknown = {},
  responseOptions: Record<string, unknown> = {},
): void {
  if (options == null || options === false) {
    throw new ActionControllerError("Cannot redirect to nil!");
  }
  if (this.performed) throw new DoubleRenderError();

  const allowOtherHost = Object.hasOwn(responseOptions, "allowOtherHost")
    ? (responseOptions.allowOtherHost as boolean)
    : _allowOtherHost.call(this);
  delete responseOptions.allowOtherHost;

  const proposedStatus = _extractRedirectToStatus.call(this, options, responseOptions);

  const redirectToLocation = _computeRedirectToLocation.call(this, this.request, options);
  _ensureUrlIsHttpHeaderSafe.call(this, redirectToLocation);

  this.location = _enforceOpenRedirectProtection.call(this, redirectToLocation, {
    allowOtherHost,
  });
  this.responseBody = "";
  this.status = proposedStatus;
}

export function redirectBack(
  this: RedirectingHost,
  {
    fallbackLocation,
    allowOtherHost = _allowOtherHost.call(this as PrivateHost),
    ...args
  }: { fallbackLocation: string; allowOtherHost?: boolean } & Record<string, unknown>,
): void {
  redirectBackOrTo.call(this, fallbackLocation, { allowOtherHost, ...args });
}

export function redirectBackOrTo(
  this: RedirectingHost,
  fallbackLocation: string,
  options: { allowOtherHost?: boolean } & Record<string, unknown> = {},
): void {
  const { allowOtherHost: explicitAllow, ...redirectOptions } = options;
  const allowOtherHost = explicitAllow ?? _allowOtherHost.call(this as PrivateHost);
  const referer = this.request.referer;
  if (referer && (allowOtherHost || _urlHostAllowed.call(this, referer))) {
    this.redirectTo(referer, { allowOtherHost, ...redirectOptions });
  } else {
    this.redirectTo(fallbackLocation, redirectOptions);
  }
}

export function urlFrom(this: RedirectingHost, location: string | null | undefined): string | null {
  if (!location || location.trim() === "") return null;
  return _urlHostAllowed.call(this, location) ? location : null;
}

/** @internal */
export function _computeRedirectToLocation(
  this: RedirectingHost | void,
  request: { protocol?: string; hostWithPort?: string },
  options: unknown,
): string {
  let result: string;
  if (typeof options === "string") {
    if (SCHEME_OR_PROTOCOL_RELATIVE_RE.test(options)) {
      result = options;
    } else {
      result = `${request.protocol ?? ""}${request.hostWithPort ?? ""}${options}`;
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
  responseOptions: Record<string, unknown>,
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
  this: RedirectingHost,
  location: string,
  { allowOtherHost }: { allowOtherHost: boolean },
): string {
  if (allowOtherHost || _urlHostAllowed.call(this, location)) {
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
