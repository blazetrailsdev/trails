/**
 * ActionDispatch::Assertions::ResponseAssertions
 *
 * Functional port of the Rails ResponseAssertions module. Each
 * exported function is `this`-typed — invoke via `fn.call(host, ...)`
 * or assign onto a test class (`Test.prototype.assertResponse =
 * assertResponse`) so the host's `response`/`request`/`controller`
 * resolve from `this` at call time, per the CLAUDE.md mixin pattern.
 */

import { assert, assertEqual, isPlainObject } from "@blazetrails/activesupport";
import { rbEqq } from "@blazetrails/ruby-compat";
import { AssertionResponse } from "../assertion-response.js";
import { _computeRedirectToLocation } from "../../../action-controller/metal/redirecting.js";

export interface AssertionResponseHost {
  response: AssertionResponseLike;
  request?: { env?: Record<string, unknown>; protocol?: string; hostWithPort?(): string };
  controller?: unknown;
}

export interface AssertionResponseLike {
  status: number;
  body?: string;
  location?: string;
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
  message?: string | (() => string),
): void {
  message ??= () => generateResponseMessage(this, type, this.response.status);

  if (Object.hasOwn(RESPONSE_PREDICATES, type)) {
    assert(RESPONSE_PREDICATES[type](this.response.status), message);
  } else {
    assertEqual(parseInt(new AssertionResponse(type).code, 10), this.response.status, message);
  }
}

export function assertRedirectedTo(
  this: AssertionResponseHost,
  urlOptions: unknown = {},
  options: { status?: number | string } | string = {},
  message?: string,
): true {
  if (!isPlainObject(options)) [options, message] = [{}, options];

  const status = (options as { status?: number | string }).status ?? "redirect";
  assertResponse.call(this, status, message);
  if (rbEqq(urlOptions, this.response.location)) return true;

  const redirectIs = normalizeArgumentToRedirection.call(this, this.response.location);
  const redirectExpected = normalizeArgumentToRedirection.call(this, urlOptions);

  message ??= `Expected response to be a redirect to <${redirectExpected}> but was a redirect to <${redirectIs}>`;
  return assert(rbEqq(redirectExpected, redirectIs), message);
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
  const handle = this.controller as
    | { _computeRedirectToLocation?: (req: unknown, frag: unknown) => unknown }
    | undefined;
  if (handle?._computeRedirectToLocation) {
    return handle._computeRedirectToLocation(this.request, fragment);
  }
  return _computeRedirectToLocation(this.request!, fragment);
}

/** @internal */
export function generateResponseMessage(
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

/** @internal */
export function codeWithName(codeOrName: number | string): string {
  return new AssertionResponse(codeOrName).codeAndName();
}

/** @internal */
export function locationIfRedirected(host: AssertionResponseHost): string {
  const status = host.response.status;
  if (status < 300 || status > 399) return "";
  const location = host.response.getHeader?.("location");
  if (!location) return "";
  const normalized = normalizeArgumentToRedirection.call(host, location);
  return ` redirect to <${String(normalized)}>`;
}

/** @internal */
export function exceptionIfPresent(host: AssertionResponseHost): string {
  const ex = host.request?.env?.["action_dispatch.exception"];
  if (!ex) return "";
  const name = ex instanceof Error ? ex.name || "Error" : "Error";
  const message = ex instanceof Error ? ex.message : String(ex);
  return `\n\nException while processing request: ${name}: ${message}\n`;
}

/** @internal */
export function responseBodyIfShort(host: AssertionResponseHost): string {
  const body = host.response.body ?? "";
  if (body.length > 500) return "";
  return `\nResponse body: ${body}`;
}
