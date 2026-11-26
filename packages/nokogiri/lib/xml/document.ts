import type { XmlDocument as LibXmlDocument } from "libxml2-wasm";
import { Pathname, RuntimeError, include } from "@blazetrails/ruby-compat";

import { HTML5, XML, Nokogiri } from "../namespaces.js";

import type { DocumentFragment } from "./document-fragment.js";
import type { NodeSet } from "./node-set.js";
import * as Searchable from "./searchable.js";
import { XmlNode } from "./node.js";
import { ParseOptions } from "./parse-options.js";
import { type Readable, readSource } from "../readable.js";
import { SyntaxError } from "./syntax-error.js";
import { XPathVisitor } from "../css/xpath-visitor.js";

export class XmlDocument extends XmlNode {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => XmlNode | undefined;
  declare xpath: (...args: unknown[]) => NodeSet;
  declare atXpath: (...args: unknown[]) => XmlNode | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = ["//"] as const;

  /** @noRailsEquivalent CONVERGEABLE html5-document-extends-xml-document-chain */
  static [Symbol.hasInstance](other: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, other) ||
      (this === XmlDocument && other instanceof HTML5.Document)
    );
  }

  errors: SyntaxError[] = [];
  url: string | null = null;
  encoding: string | null = null;
  private _root: XmlNode | null = null;

  private _doc: LibXmlDocument | null;

  /** @missingRailsArgs xmlNewDoc — CONVERGEABLE nokogiri-xml-document-new-version-and-wrap */
  constructor(cDocument: number = Nokogiri.LibXml2!.xmlNewDoc()) {
    super(Nokogiri.LibXml2!.createNode(cDocument));
    this._doc = Nokogiri.LibXml2!.XmlDocument.getInstance(cDocument);
    this.document = this;
  }

  static parse(
    stringOrIo: string | Readable | Pathname | null,
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

    let doc: XmlDocument;
    if (typeof stringOrIo === "object" && stringOrIo !== null && "read" in stringOrIo) {
      if (stringOrIo instanceof Pathname) {
        const file = stringOrIo.expandPath().open();
        stringOrIo = file as unknown as Readable;
        url ??= file.path();
      }

      doc = XmlDocument.readIo(stringOrIo, url, encoding, options.toI());
    } else {
      doc = XmlDocument.readMemory(stringOrIo as string, url, encoding, options.toI());
    }

    if (options.isXinclude()) doc.doXinclude(options);

    return doc;
  }

  /** @internal */
  private static isEmptyDoc(stringOrIo: string | Readable | Pathname | null): boolean {
    return (
      stringOrIo == null ||
      (typeof stringOrIo === "string"
        ? stringOrIo === ""
        : stringOrIo.isEmpty !== undefined && stringOrIo.isEmpty()) ||
      (typeof stringOrIo === "object" &&
        "isEof" in stringOrIo &&
        stringOrIo.isEof !== undefined &&
        stringOrIo.isEof())
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
    url: string | null,
    encoding: string | null,
    options: number,
  ): XmlDocument {
    const libxml = Nokogiri.LibXml2!;
    const ctxt = libxml.xmlNewParserCtxt();
    const errIndex = libxml.error.storage.allocate([]);
    let cDocument: number;
    let rbErrors: SyntaxError[];
    try {
      libxml.xmlCtxtSetErrorHandler(ctxt, libxml.error.errorCollector, errIndex);
      cDocument = libxml.xmlReadString(ctxt, string, url, encoding, options);
      rbErrors = libxml.error.storage
        .get(errIndex)
        .map((detail) => new SyntaxError(detail.message, 3, detail.line, detail.col));
    } finally {
      libxml.error.storage.free(errIndex);
      libxml.xmlFreeParserCtxt(ctxt);
    }

    if (!cDocument) {
      const exception = SyntaxError.aggregate(rbErrors);
      if (exception !== null) {
        throw exception;
      } else {
        throw new RuntimeError("Could not parse document");
      }
    }

    const document = new XmlDocument(cDocument);
    document._root = new XmlNode(document._doc!.root, document);
    document.url = url;
    document.errors = rbErrors;
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
      if (!(e instanceof Nokogiri.LibXml2!.XmlParseError)) throw e;
      throw new SyntaxError(e.message);
    }
  }

  get root(): XmlNode | null {
    return this._root;
  }

  fragment(tags: string | null = null): DocumentFragment {
    return new XML.DocumentFragment(this, tags, this._root);
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
XML.Document = XmlDocument;
