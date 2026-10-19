import { Concern } from "@blazetrails/activesupport";
import { XML, type Html5Document, type XmlDocument } from "@blazetrails/nokogiri";
import { Testing } from "@blazetrails/actionview/testing";
import { Assertions as DomTestingAssertions } from "@blazetrails/actionview/testing/assertions";
import type * as SelectorAssertions from "@blazetrails/actionview/testing/selector-assertions";
import { extend, Module, rbModConstSet } from "@blazetrails/ruby-compat";
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
    assertSelect: OmitThisParameter<typeof SelectorAssertions.assertSelect>;
    /** @internal */
    _htmlDocument?: XmlDocument | Html5Document | null;
    readonly htmlDocument: XmlDocument | Html5Document;
  };

export const Assertions = new Module((mod) => {
  extend(mod, Concern);

  mod.include(ResponseAssertions);
  mod.include(RoutingAssertions);
  mod.include(DomTestingAssertions);

  mod.moduleEval((m) => {
    Object.defineProperty(m, "htmlDocument", { get: htmlDocument, configurable: true });
  });
}) as Module & {
  ResponseAssertions: typeof ResponseAssertions;
  RoutingAssertions: typeof RoutingAssertions;
};

rbModConstSet(ActionDispatch, "Assertions", Assertions);
rbModConstSet(Assertions, "ResponseAssertions", ResponseAssertions);
rbModConstSet(Assertions, "RoutingAssertions", RoutingAssertions);
