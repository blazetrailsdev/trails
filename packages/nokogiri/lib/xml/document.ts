import { XmlDocument as LibXmlDocument, XmlParseError } from "libxml2-wasm";
import { constSet, include } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

import type { NodeSet } from "./node-set.js";
import * as Searchable from "./searchable.js";
import { XmlNode } from "./node.js";
import { ParseOptions } from "./parse-options.js";
import { type Readable, readSource } from "../readable.js";
import { SyntaxError } from "./syntax-error.js";
import { XPathVisitor } from "../css/xpath-visitor.js";

export class XmlDocument {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => XmlNode | undefined;
  declare xpath: (...args: unknown[]) => NodeSet;
  declare atXpath: (...args: unknown[]) => XmlNode | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = ["//"] as const;

  errors: SyntaxError[] = [];
  private _doc: LibXmlDocument | null = null;
  private _root: XmlNode | null = null;

  static parse(
    stringOrIo: string | Readable | null,
    url: string | null = null,
    encoding: string | null = null,
    options: ParseOptions | number = ParseOptions.DEFAULT_XML,
  ): XmlDocument {
    if (typeof options === "number") options = new ParseOptions(options);

    if (XmlDocument.isEmptyDoc(stringOrIo)) {
      if (options.isStrict()) {
        throw new SyntaxError("Empty document", 3);
      } else {
        return new XmlDocument();
      }
    }

    return XmlDocument.readMemory(readSource(stringOrIo!), url, encoding, options.toI());
  }

  /** @internal */
  private static isEmptyDoc(stringOrIo: string | Readable | null): boolean {
    return stringOrIo == null || stringOrIo === "";
  }

  static readMemory(
    string: string,
    _url: string | null,
    _encoding: string | null,
    _options: number,
  ): XmlDocument {
    const document = new XmlDocument();
    try {
      document._doc = LibXmlDocument.fromString(string);
      document._root = new XmlNode(document._doc.root, document);
    } catch (e) {
      if (!(e instanceof XmlParseError)) throw e;
      for (const detail of e.details) {
        document.errors.push(new SyntaxError(detail.message, 3, detail.line, detail.col));
      }
    }
    return document;
  }

  get document(): XmlDocument {
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  get _node(): LibXmlDocument | null {
    return this._doc;
  }

  get root(): XmlNode {
    if (this._root === null) throw new Error("Document has no root (parse failed or disposed)");
    return this._root;
  }

  xpathDoctype(): XPathVisitor["doctype"] {
    return XPathVisitor.DoctypeConfig.XML;
  }

  dispose(): void {
    this._doc?.dispose();
    this._doc = null;
    this._root = null;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

include(XmlDocument, Searchable);
constSet(XML, "Document", XmlDocument);
