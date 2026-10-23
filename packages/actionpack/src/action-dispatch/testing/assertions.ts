import { Concern } from "@blazetrails/activesupport";
import { XML, type Html5Document, type XmlDocument } from "@blazetrails/nokogiri";
import { Testing } from "@blazetrails/actionview/testing";
import { Assertions as DomTestingAssertions } from "@blazetrails/actionview/testing/assertions";
import type * as DomAssertions from "@blazetrails/actionview/testing/dom-assertions";
import type * as SelectorAssertions from "@blazetrails/actionview/testing/selector-assertions";
import { extend, include, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActionDispatch } from "../../namespaces.js";
import { ResponseAssertions } from "./assertions/response.js";
import { RoutingAssertions } from "./assertions/routing.js";

export interface HtmlDocumentHost {
  _htmlDocument?: XmlDocument | Html5Document | null;
  response: { mediaType: string | undefined; body: string };
}

export function htmlDocument(this: HtmlDocumentHost): XmlDocument | Html5Document {
  return (this._htmlDocument ??= this.response.mediaType?.endsWith("xml")
    ? XML.Document.parse(this.response.body)
    : Testing.htmlDocument().parse(this.response.body));
}

export type Assertions = ResponseAssertions &
  RoutingAssertions & {
    assertDomEqual: OmitThisParameter<typeof DomAssertions.assertDomEqual>;
    assertDomNotEqual: OmitThisParameter<typeof DomAssertions.assertDomNotEqual>;
    cssSelect: OmitThisParameter<typeof SelectorAssertions.cssSelect>;
    assertDom: OmitThisParameter<typeof SelectorAssertions.assertDom>;
    assertSelect: OmitThisParameter<typeof SelectorAssertions.assertSelect>;
    assertDomEncoded: OmitThisParameter<typeof SelectorAssertions.assertDomEncoded>;
    assertSelectEncoded: OmitThisParameter<typeof SelectorAssertions.assertSelectEncoded>;
    /** @internal */
    _htmlDocument?: XmlDocument | Html5Document | null;
    readonly htmlDocument: XmlDocument | Html5Document;
  };

export const Assertions = {} as {
  ResponseAssertions: typeof ResponseAssertions;
  RoutingAssertions: typeof RoutingAssertions;
};
extend(Assertions, Concern);
include(Assertions, ResponseAssertions);
include(Assertions, RoutingAssertions);
include(Assertions, DomTestingAssertions);
Object.defineProperty(Assertions, "htmlDocument", {
  get: htmlDocument,
  enumerable: true,
  configurable: true,
});

rbModConstSet(ActionDispatch, "Assertions", Assertions);
rbModConstSet(Assertions, "ResponseAssertions", ResponseAssertions);
rbModConstSet(Assertions, "RoutingAssertions", RoutingAssertions);
