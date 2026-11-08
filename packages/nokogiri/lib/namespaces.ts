import { TopLevel, constSet } from "@blazetrails/ruby-compat";

import type { Node } from "./html5/node.js";
import type { NodeSet } from "./xml/node-set.js";
import type { Attr } from "./xml/attr.js";
import type { Namespace } from "./xml/namespace.js";
import type { XmlNode } from "./xml/node.js";
import type { ParseOptions } from "./xml/parse-options.js";
import type { XPathContext } from "./xml/xpath-context.js";

export const XML = { name: "Nokogiri::XML" } as {
  name: string;
  NodeSet: typeof NodeSet;
  Node: typeof XmlNode;
  XPathContext: typeof XPathContext;
  Attr: typeof Attr;
  Namespace: typeof Namespace;
  ParseOptions: typeof ParseOptions;
};

export const HTML5 = { name: "Nokogiri::HTML5" } as { name: string; Node: typeof Node };

export const XPath = { name: "Nokogiri::XML::XPath" } as { name: string; [name: string]: unknown };
constSet(XML, "XPath", XPath);

export const SAX = { name: "Nokogiri::XML::SAX" } as { name: string; [name: string]: unknown };
constSet(XML, "SAX", SAX);

export const CSS = { name: "Nokogiri::CSS" } as { name: string; [name: string]: unknown };

export const Nokogiri = { name: "Nokogiri", XML, HTML5, CSS };
constSet(TopLevel, "Nokogiri", Nokogiri);

export const Racc = { name: "Racc" } as { name: string; [name: string]: unknown };
constSet(TopLevel, "Racc", Racc);
