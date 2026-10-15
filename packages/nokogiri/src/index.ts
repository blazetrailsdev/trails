import { XmlDocument } from "./xml/document.js";
import { XmlNode } from "./xml/node.js";
import { parseXml } from "./xml/parse.js";
import { SyntaxError } from "./xml/syntax-error.js";
import { SaxDocument } from "./sax/document.js";
import { SaxParser } from "./sax/parser.js";

export const XML = { Document: XmlDocument, Node: XmlNode, SyntaxError };
export const SAX = { Document: SaxDocument, Parser: SaxParser };
export { parseXml, SaxDocument, SaxParser };
export type { XmlNode, XmlDocument };
export type { AttrNode } from "./xml/node.js";
export type { SyntaxError };
export type { Readable } from "./readable.js";
import {
  Document as Html5Document,
  DocumentFragment as Html5DocumentFragment,
  Node as Html5Node,
} from "./html5/document-fragment.js";
export const HTML5 = { Document: Html5Document, DocumentFragment: Html5DocumentFragment };
export type { Html5Document, Html5DocumentFragment, Html5Node };
