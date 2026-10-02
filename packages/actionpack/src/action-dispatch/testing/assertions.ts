import { Concern } from "@blazetrails/activesupport";
import { XML, type XmlDocument } from "@blazetrails/nokogiri";
import { extend, Module } from "@blazetrails/ruby-compat";
import { ResponseAssertions } from "./assertions/response.js";
import { RoutingAssertions } from "./assertions/routing.js";

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

export type Assertions = ResponseAssertions &
  RoutingAssertions & {
    /** @internal */
    _htmlDocument?: XmlDocument;
    readonly htmlDocument: XmlDocument;
  };

export const Assertions = new Module((mod) => {
  extend(mod, Concern);

  mod.include(ResponseAssertions);
  mod.include(RoutingAssertions);

  mod.moduleEval((m) => {
    Object.defineProperty(m, "htmlDocument", { get: htmlDocument, configurable: true });
  });
});
