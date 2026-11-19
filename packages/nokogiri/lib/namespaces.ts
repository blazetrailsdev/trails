import { TopLevel, constSet } from "@blazetrails/ruby-compat";

import type { Node } from "./html5/node.js";
import type { Document as Html5Document } from "./html5/document.js";
import type { DocumentFragment as Html5DocumentFragment } from "./html5/document-fragment.js";
import type { NodeSet } from "./xml/node-set.js";
import type { Attr } from "./xml/attr.js";
import type { Namespace } from "./xml/namespace.js";
import type { XmlNode } from "./xml/node.js";
import type { XmlDocument } from "./xml/document.js";
import type { DocumentFragment } from "./xml/document-fragment.js";
import type { ParseOptions } from "./xml/parse-options.js";
import type { XPathContext } from "./xml/xpath-context.js";
import type { SyntaxError as XmlSyntaxError } from "./xml/syntax-error.js";
import type { SaxDocument } from "./xml/sax/document.js";
import type { SaxParser } from "./xml/sax/parser.js";
import type { Node as CssNode } from "./css/node.js";
import type { Parser as CssParser } from "./css/parser.js";
import type { SelectorCache } from "./css/selector-cache.js";
import type { SyntaxError as CssSyntaxError } from "./css/syntax-error.js";
import type { XPathVisitor } from "./css/xpath-visitor.js";
import type { Tokenizer } from "./css/tokenizer.js";

export const XML = { name: "Nokogiri::XML" } as {
  name: string;
  NodeSet: typeof NodeSet;
  Node: typeof XmlNode;
  XPathContext: typeof XPathContext;
  Attr: typeof Attr;
  Namespace: typeof Namespace;
  ParseOptions: typeof ParseOptions;
  Document: typeof XmlDocument;
  DocumentFragment: typeof DocumentFragment;
  SyntaxError: typeof XmlSyntaxError;
};

export const HTML5 = { name: "Nokogiri::HTML5" } as {
  name: string;
  Node: typeof Node;
  DocumentFragment: typeof Html5DocumentFragment;
  Document: typeof Html5Document;
};

export const XPath = { name: "Nokogiri::XML::XPath" } as { name: string; [name: string]: unknown };
constSet(XML, "XPath", XPath);

export const SAX = { name: "Nokogiri::XML::SAX" } as {
  name: string;
  Document: typeof SaxDocument;
  Parser: typeof SaxParser;
};
constSet(XML, "SAX", SAX);

export const CSS = { name: "Nokogiri::CSS" } as {
  name: string;
  Node: typeof CssNode;
  Parser: typeof CssParser;
  SelectorCache: typeof SelectorCache;
  SyntaxError: typeof CssSyntaxError;
  XPathVisitor: typeof XPathVisitor;
  Tokenizer: typeof Tokenizer;
};

export const Nokogiri = { name: "Nokogiri", XML, HTML5, CSS };
constSet(TopLevel, "Nokogiri", Nokogiri);
