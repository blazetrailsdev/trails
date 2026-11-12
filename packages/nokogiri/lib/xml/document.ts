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
import "./xpath-context.js";

export class XmlDocument {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => XmlNode | undefined;
  declare xpath: (...args: unknown[]) => NodeSet;
  declare atXpath: (...args: unknown[]) => XmlNode | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = ["//"] as const;

  errors: SyntaxError[] = [];
  encoding: string | null = null;
  private _doc: LibXmlDocument | null = null;
  private _root: XmlNode | null = null;

  static parse(
    stringOrIo: string | Readable | null,
    url: string | null = null,
    encoding: string | null = null,
    options: ParseOptions | number = ParseOptions.DEFAULT_XML,
    block?: (options: ParseOptions) => void,
  ): XmlDocument {
    if (typeof options === "number") options = new ParseOptions(options);
    if (block !== undefined) block(options);

    url ??=
      stringOrIo !== null && typeof stringOrIo === "object" && "path" in stringOrIo
        ? String(stringOrIo.path)
        : null;

    if (XmlDocument.isEmptyDoc(stringOrIo)) {
      if (options.isStrict()) {
        throw new SyntaxError("Empty document");
      } else {
        const doc = new XmlDocument();
        if (encoding !== null) doc.encoding = encoding;
        return doc;
      }
    }

    const doc =
      typeof stringOrIo === "object" && stringOrIo !== null && "read" in stringOrIo
        ? XmlDocument.readIo(stringOrIo, url, encoding, options.toI())
        : XmlDocument.readMemory(stringOrIo as string, url, encoding, options.toI());

    if (options.isXinclude()) doc.doXinclude(options);

    return doc;
  }

  /** @internal */
  private static isEmptyDoc(stringOrIo: string | Readable | null): boolean {
    return (
      stringOrIo == null ||
      (typeof stringOrIo === "string"
        ? stringOrIo === ""
        : stringOrIo.isEmpty !== undefined && stringOrIo.isEmpty()) ||
      (typeof stringOrIo === "object" && stringOrIo.isEof !== undefined && stringOrIo.isEof())
    );
  }

  /** @missingRailsCall xmlReadIO — CONVERGEABLE nokogiri-libxml2-wasm-xinclude-flags-and-read-io */
  static readIo(
    io: Readable,
    url: string | null,
    encoding: string | null,
    options: number,
  ): XmlDocument {
    return XmlDocument.readMemory(readSource(io), url, encoding, options);
  }

  static readMemory(
    string: string,
    _url: string | null,
    _encoding: string | null,
    options: number,
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
      if (new ParseOptions(options).isStrict()) throw document.errors[0];
    }
    return document;
  }

  doXinclude(
    options: ParseOptions | number = ParseOptions.DEFAULT_XML,
    block?: (options: ParseOptions) => void,
  ): void {
    if (typeof options === "number") options = new ParseOptions(options);
    if (block !== undefined) block(options);

    this.processXincludes(options.toI());
  }

  /**
   * @internal
   * @missingRailsArgs xmlXIncludeProcessTreeFlags — CONVERGEABLE nokogiri-libxml2-wasm-xinclude-flags-and-read-io
   */
  private processXincludes(_options: number): void {
    try {
      this._doc?.processXInclude();
    } catch (e) {
      if (!(e instanceof XmlParseError)) throw e;
      throw new SyntaxError(e.message);
    }
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
