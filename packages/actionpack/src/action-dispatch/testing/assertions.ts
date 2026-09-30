import { XML, type XmlDocument } from "@blazetrails/nokogiri";
import * as response from "./assertions/response.js";
import * as routing from "./assertions/routing.js";

export interface HtmlDocumentHost {
  _htmlDocument?: XmlDocument;
  response: { mediaType: string | undefined; body: string };
}

export function htmlDocument(this: HtmlDocumentHost): XmlDocument {
  if (this._htmlDocument) return this._htmlDocument;
  if (this.response.mediaType?.endsWith("xml")) {
    return (this._htmlDocument = XML.Document.parse(this.response.body));
  }
  throw new Error(
    `htmlDocument: HTML parsing (rails-dom-testing) is not yet implemented; got mime type "${this.response.mediaType}"`,
  );
}

export type { AssertionResponseHost, AssertionResponseLike } from "./assertions/response.js";

export type { RoutingAssertionsHost, PathWithMethod } from "./assertions/routing.js";

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
