/**
 * ActionDispatch::Assertions — aggregator mirroring
 * `action_dispatch/testing/assertions.rb`. Rails includes
 * ResponseAssertions + RoutingAssertions + Rails::Dom::Testing::Assertions
 * into the host test class; trails re-exports their helpers here as
 * `this`-typed functions so api:compare sees the full mixed-in surface
 * on this file.
 *
 * The HTML branch of `htmlDocument` (rails-dom-testing) remains deferred.
 * The XML branch is wired via `@blazetrails/nokogiri`.
 */

import { XML } from "@blazetrails/nokogiri";
import * as response from "./assertions/response.js";
import * as routing from "./assertions/routing.js";

/** @internal */
export function htmlDocument(body: string, mimeType?: string) {
  const mediaType = mimeType?.split(";")[0].trim();
  if (mediaType === undefined || mediaType.endsWith("xml")) {
    return XML.Document.parse(body);
  }
  throw new Error(
    `htmlDocument: HTML parsing (rails-dom-testing) is not yet implemented; got mime type "${mediaType}"`,
  );
}

export type { AssertionResponseHost, AssertionResponseLike } from "./assertions/response.js";

export type { RoutingAssertionsHost, PathWithMethod } from "./assertions/routing.js";

// Response assertions
export const assertResponse = response.assertResponse;
export const assertRedirectedTo = response.assertRedirectedTo;
/** @internal */
export const parameterize = response.parameterize;
/** @internal */
export const normalizeArgumentToRedirection = response.normalizeArgumentToRedirection;
/** @internal */
export const generateResponseMessage = response.generateResponseMessage;
/** @internal */
export const responseBodyIfShort = response.responseBodyIfShort;
/** @internal */
export const exceptionIfPresent = response.exceptionIfPresent;
/** @internal */
export const locationIfRedirected = response.locationIfRedirected;
/** @internal */
export const codeWithName = response.codeWithName;

// Routing assertions
export const setup = routing.setup;
export const withRouting = routing.withRouting;
export const assertRecognizes = routing.assertRecognizes;
export const assertGenerates = routing.assertGenerates;
export const assertRouting = routing.assertRouting;
/** @internal */
export const recognizedRequestFor = routing.recognizedRequestFor;
/** @internal */
export const createRoutes = routing.createRoutes;
/** @internal */
export const resetRoutes = routing.resetRoutes;
/** @internal */
export const failOn = routing.failOn;
