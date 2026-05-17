/**
 * ActionDispatch::Assertions::ResponseAssertions
 *
 * Functional port of the Rails ResponseAssertions module. Each
 * exported function is `this`-typed — invoke via `fn.call(host, ...)`
 * or assign onto a test class (`Test.prototype.assertResponse =
 * assertResponse`) so the host's `response`/`request`/`controller`
 * resolve from `this` at call time, per the CLAUDE.md mixin pattern.
 */

import { AssertionResponse } from "../assertion-response.js";

export interface AssertionResponseHost {
  response: AssertionResponseLike;
  request?: { env?: Record<string, unknown> };
  controller?: unknown;
}

export interface AssertionResponseLike {
  status: number;
  body?: string;
  getHeader?: (key: string) => string | undefined;
}

const RESPONSE_PREDICATES: Record<string, (status: number) => boolean> = {
  success: (s) => s >= 200 && s <= 299,
  missing: (s) => s === 404,
  redirect: (s) => s >= 300 && s <= 399,
  error: (s) => s >= 500 && s <= 599,
};

export function assertResponse(
  this: AssertionResponseHost,
  type: number | string,
  message?: string,
): void {
  const status = this.response.status;
  const predicate =
    typeof type === "string" && Object.hasOwn(RESPONSE_PREDICATES, type)
      ? RESPONSE_PREDICATES[type]
      : undefined;

  if (predicate) {
    if (!predicate(status)) {
      throw new Error(message ?? generateResponseMessage(this, type, status));
    }
    return;
  }

  const expectedCode = parseInt(new AssertionResponse(type).code, 10);
  if (status !== expectedCode) {
    throw new Error(message ?? generateResponseMessage(this, type, status));
  }
}

export function assertRedirectedTo(
  this: AssertionResponseHost,
  urlOptions: string | RegExp,
  options: { status?: number | string } | string = {},
  message?: string,
): void {
  let opts: { status?: number | string } = {};
  if (typeof options === "string") {
    if (!message) message = options;
  } else {
    opts = options;
  }

  const status = opts.status ?? "redirect";
  assertResponse.call(this, status, message);

  const location = this.response.getHeader?.("location") ?? "";
  const redirectIs = normalizeArgumentToRedirection.call(this, location);
  const redirectExpected = normalizeArgumentToRedirection.call(this, urlOptions);

  if (redirectExpected instanceof RegExp) {
    // Ruby's `Regexp#===` is stateless (match?-equivalent). Clone the
    // pattern so a /g or /y caller doesn't carry `lastIndex` between
    // assertions.
    const probe = new RegExp(redirectExpected.source, redirectExpected.flags);
    if (probe.test(String(redirectIs))) return;
  } else if (redirectExpected === redirectIs) {
    return;
  }

  const expectedStr =
    redirectExpected instanceof RegExp ? redirectExpected.toString() : String(redirectExpected);
  throw new Error(
    message ??
      `Expected response to be a redirect to <${expectedStr}> but was a redirect to <${redirectIs}>`,
  );
}

/** @internal */
export function parameterize(this: AssertionResponseHost, value: unknown): unknown {
  if (value != null && typeof (value as { toParam?: () => unknown }).toParam === "function") {
    return (value as { toParam: () => unknown }).toParam();
  }
  return value;
}

/** @internal */
export function normalizeArgumentToRedirection(
  this: AssertionResponseHost,
  fragment: unknown,
): unknown {
  if (fragment instanceof RegExp) return fragment;
  // Rails routes non-Regexp fragments through
  // `(@controller || ActionController::Redirecting)._compute_redirect_to_location(@request, fragment)`.
  // Until Redirecting is ported, fall back to the controller hook if present
  // and otherwise return the fragment unchanged.
  const handle = this.controller as
    | { _computeRedirectToLocation?: (req: unknown, frag: unknown) => unknown }
    | undefined;
  if (handle?._computeRedirectToLocation) {
    return handle._computeRedirectToLocation(this.request, fragment);
  }
  return fragment;
}

function generateResponseMessage(
  host: AssertionResponseHost,
  expected: number | string,
  actual: number,
): string {
  const parts = [
    `Expected response to be a <${codeWithName(expected)}>, but was a <${codeWithName(actual)}>`,
  ];
  parts.push(locationIfRedirected(host));
  parts.push(exceptionIfPresent(host));
  parts.push(responseBodyIfShort(host));
  return parts.join("");
}

function codeWithName(codeOrName: number | string): string {
  return new AssertionResponse(codeOrName).codeAndName();
}

function locationIfRedirected(host: AssertionResponseHost): string {
  const status = host.response.status;
  if (status < 300 || status > 399) return "";
  const location = host.response.getHeader?.("location");
  if (!location) return "";
  const normalized = normalizeArgumentToRedirection.call(host, location);
  return ` redirect to <${String(normalized)}>`;
}

function exceptionIfPresent(host: AssertionResponseHost): string {
  const ex = host.request?.env?.["action_dispatch.exception"];
  if (!ex) return "";
  const name = ex instanceof Error ? ex.name || "Error" : "Error";
  const message = ex instanceof Error ? ex.message : String(ex);
  return `\n\nException while processing request: ${name}: ${message}\n`;
}

function responseBodyIfShort(host: AssertionResponseHost): string {
  const body = host.response.body ?? "";
  if (body.length > 500) return "";
  return `\nResponse body: ${body}`;
}
