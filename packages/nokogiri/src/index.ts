import { XmlDocument } from "./xml/document.js";
import { XmlNode } from "./xml/node.js";
import { parseXml } from "./xml/parse.js";
import { SyntaxError } from "./xml/syntax-error.js";
import { SaxDocument } from "./sax/document.js";
import { SaxParser } from "./sax/parser.js";

export const XML = { Document: XmlDocument, Node: XmlNode, NodeSet, SyntaxError };
export const SAX = { Document: SaxDocument, Parser: SaxParser };
export { parseXml, SaxDocument, SaxParser };
export type { XmlNode, XmlDocument };
export type { AttrNode } from "./xml/node.js";
export type { SyntaxError };
export type { Readable } from "./readable.js";
import { Document as Html5Document } from "./html5/document.js";
import { DocumentFragment as Html5DocumentFragment } from "./html5/document-fragment.js";
import type { Node as Html5Node } from "./html5/node.js";
import { NodeSet } from "./xml/node-set.js";
import { SyntaxError as CssSyntaxError } from "./css/syntax-error.js";
import { Node as CssNode } from "./css/node.js";
import { Parser as CssParser } from "./css/parser.js";
import { SelectorCache } from "./css/selector-cache.js";
import { Tokenizer as CssTokenizer } from "./css/tokenizer.js";
import { XPathVisitor } from "./css/xpath-visitor.js";
import { xpathFor } from "./css.js";
export const HTML5 = { Document: Html5Document, DocumentFragment: Html5DocumentFragment };
export type { Html5Document, Html5DocumentFragment, Html5Node };
export type { NodeSet };
export const CSS = {
  Node: CssNode,
  Parser: CssParser,
  SelectorCache,
  SyntaxError: CssSyntaxError,
  Tokenizer: CssTokenizer,
  XPathVisitor,
  xpathFor,
};
