import { TopLevel, constSet, rbObjAsString, rbObjRespondTo } from "@blazetrails/ruby-compat";

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

export const XML = {
  name: "Nokogiri::XML",
  fragment(...args: Parameters<typeof DocumentFragment.parse>): DocumentFragment {
    return XML.DocumentFragment.parse(...args);
  },
} as {
  name: string;
  fragment(...args: Parameters<typeof DocumentFragment.parse>): DocumentFragment;
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

export const HTML5 = {
  name: "Nokogiri::HTML5",
  parse(...args: Parameters<typeof Html5Document.parse>): Html5Document {
    return HTML5.Document.parse(...args);
  },
  fragment(...args: Parameters<typeof Html5DocumentFragment.parse>): Html5DocumentFragment {
    return HTML5.DocumentFragment.parse(...args);
  },
} as {
  name: string;
  parse(...args: Parameters<typeof Html5Document.parse>): Html5Document;
  fragment(...args: Parameters<typeof Html5DocumentFragment.parse>): Html5DocumentFragment;
  Node: typeof Node;
  DocumentFragment: typeof Html5DocumentFragment;
  Document: typeof Html5Document;
  QuirksMode: { NO_QUIRKS: number; QUIRKS: number; LIMITED_QUIRKS: number };
  readAndEncode(string: unknown, encoding: string | null): string;
};

HTML5.readAndEncode = function readAndEncode(string: unknown, encoding: string | null): string {
  if (rbObjRespondTo(string, "read")) {
    const io = string as { read(options?: { encoding: string }): string };
    return encoding == null ? io.read() : io.read({ encoding });
  } else {
    return rbObjAsString(string);
  }
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

export type LibXml2 = typeof import("libxml2-wasm") & {
  XmlDocument: { getInstance(ptr: number): import("libxml2-wasm").XmlDocument };
} & Pick<
    typeof import("libxml2-wasm/lib/libxml2.mjs"),
    | "xmlAddChild"
    | "xmlUnlinkNode"
    | "xmlNewParserCtxt"
    | "xmlCtxtSetErrorHandler"
    | "xmlReadString"
    | "xmlFreeParserCtxt"
    | "error"
    | "XmlTreeCommonStruct"
    | "xmlSaveToIO"
    | "xmlSaveSetIndentString"
    | "xmlSaveTree"
    | "xmlSaveClose"
  > & {
    xmlNewDoc(version: string): number;
    createNode(nodePtr: number): import("libxml2-wasm").XmlNode;
  };

const loadPath: Record<string, () => Promise<unknown>> = {
  "nokogiri/extension": () => import("./extension.js"),
};

export const Nokogiri = { name: "Nokogiri", loadPath, XML, HTML5, CSS } as {
  name: string;
  loadPath: Record<string, () => Promise<unknown>>;
  /** @noRailsEquivalent PERMANENT */
  LibXml2?: LibXml2;
  XML: typeof XML;
  HTML5: typeof HTML5;
  CSS: typeof CSS;
};
constSet(TopLevel, "Nokogiri", Nokogiri);
