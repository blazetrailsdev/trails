import { Metal } from "../metal.js";
import { urlOptions as _urlOptions, type UrlForHost } from "./url-for.js";

export function urlOptions(this: UrlForHost): Record<string, unknown> {
  return _urlOptions.call(this);
}

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
    return Metal.resolveStatus(status as number | string);
  }
  if (Object.hasOwn(responseOptions, "status")) {
    return Metal.resolveStatus(responseOptions.status as number | string);
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
