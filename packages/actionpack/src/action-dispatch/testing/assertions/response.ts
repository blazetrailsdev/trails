import {
  assert,
  assertEqual,
  isPlainObject,
  isPresent,
  UnexpectedError,
} from "@blazetrails/activesupport";
import { Module, rbEqq } from "@blazetrails/ruby-compat";
import { AssertionResponse } from "../assertion-response.js";
import { Redirecting, type RedirectingHost } from "../../../action-controller/metal/redirecting.js";

export interface AssertionResponseHost {
  response: AssertionResponseLike;
  request?: { env?: Record<string, unknown>; protocol?: string; hostWithPort?(): string };
  controller?: unknown;
}

export interface AssertionResponseLike {
  status: number;
  body?: string;
  location?: string;
  isRedirection?: boolean;
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
  message ??= generateResponseMessage.call(this, type);

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
  if (fragment instanceof RegExp) {
    return fragment;
  } else {
    const handle = (this.controller as typeof Redirecting | undefined) || Redirecting;
    return handle._computeRedirectToLocation(this.request as RedirectingHost["request"], fragment);
  }
}

/** @internal */
export function generateResponseMessage(
  this: AssertionResponseHost,
  expected: number | string,
  actual: number = this.response.status,
): () => string {
  return () =>
    `Expected response to be a <${codeWithName(expected)}>, but was a <${codeWithName(actual)}>`
      .concat(locationIfRedirected.call(this))
      .concat(exceptionIfPresent.call(this))
      .concat(responseBodyIfShort.call(this));
}

/** @internal */
export function codeWithName(codeOrName: number | string): string {
  return new AssertionResponse(codeOrName).codeAndName();
}

/** @internal */
export function locationIfRedirected(this: AssertionResponseHost): string {
  if (!(this.response.isRedirection && isPresent(this.response.location))) return "";
  const location = normalizeArgumentToRedirection.call(this, this.response.location);
  return ` redirect to <${location}>`;
}

/** @internal */
export function exceptionIfPresent(this: AssertionResponseHost): string {
  const ex = this.request?.env?.["action_dispatch.exception"];
  if (ex == null || ex === false) return "";
  return `\n\nException while processing request: ${new UnexpectedError(ex as Error).message}\n`;
}

/** @internal */
export function responseBodyIfShort(this: AssertionResponseHost): string {
  const body = this.response.body ?? "";
  if (body.length > 500) return "";
  return `\nResponse body: ${body}`;
}

export type ResponseAssertions = {
  assertResponse: typeof assertResponse;
  assertRedirectedTo: typeof assertRedirectedTo;
  /** @internal */
  parameterize: typeof parameterize;
  /** @internal */
  normalizeArgumentToRedirection: typeof normalizeArgumentToRedirection;
  /** @internal */
  generateResponseMessage: typeof generateResponseMessage;
  /** @internal */
  responseBodyIfShort: typeof responseBodyIfShort;
  /** @internal */
  exceptionIfPresent: typeof exceptionIfPresent;
  /** @internal */
  locationIfRedirected: typeof locationIfRedirected;
  /** @internal */
  codeWithName: typeof codeWithName;
};

export const ResponseAssertions = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, {
      assertResponse,
      assertRedirectedTo,
      parameterize,
      normalizeArgumentToRedirection,
      generateResponseMessage,
      responseBodyIfShort,
      exceptionIfPresent,
      locationIfRedirected,
      codeWithName,
    });
  });
});
