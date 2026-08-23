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
export { SyntaxError };
export type { Readable } from "./readable.js";
