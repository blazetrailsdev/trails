import type { XmlDocument as LibXmlDocument } from "libxml2-wasm";
import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { extend, include } from "@blazetrails/ruby-compat/include";

import { HTML5, XML, Nokogiri } from "../namespaces.js";

import type { DocumentFragment } from "./document-fragment.js";
import { NodeSet } from "./node-set.js";
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

  static readonly NCNAME_START_CHAR = "A-Za-z_";
  static readonly NCNAME_CHAR = XmlDocument.NCNAME_START_CHAR + "\\-\\.0-9";
  static readonly NCNAME_RE = new RegExp(
    `^xmlns(?::([${XmlDocument.NCNAME_START_CHAR}][${XmlDocument.NCNAME_CHAR}]*))?$`,
  );

  static readonly IMPLIED_XPATH_CONTEXTS = ["//"] as const;

  /** @noRailsEquivalent CONVERGEABLE html5-document-extends-xml-document-chain */
  static [Symbol.hasInstance](other: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, other) ||
      (this === XmlDocument && other instanceof HTML5.Document)
    );
  }

  errors: SyntaxError[] = [];
  private _decorators: Map<unknown, object[]> | null = null;
  namespaceInheritance = false;
  url: string | null = null;
  encoding: string | null = null;

  private _doc: LibXmlDocument | null;

  constructor(version: string | null = null, ..._args: unknown[]) {
    let cDocument = _wrappedCDocument;
    _wrappedCDocument = null;
    if (cDocument === null) {
      if (version == null) version = "1.0";
      cDocument = Nokogiri.LibXml2!.xmlNewDoc(version);
    }
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

    if (options.isXinclude()) doc.doXinclude(options, { safeCopy: false });

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

    const document = nokoXmlDocumentWrap(this, cDocument);
    document.url = url;
    document.errors = rbErrors;
    return document;
  }

  /** @missingRailsCall safeProcessXinclude — CONVERGEABLE nokogiri-do-xinclude-safe-copy-arm */
  doXinclude(
    options: ParseOptions | number = ParseOptions.DEFAULT_XML,
    { safeCopy: _safeCopy = true }: { safeCopy?: boolean } = {},
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
    if (this._doc === null) return null;
    const root = Nokogiri.LibXml2!.xmlDocGetRootElement(this.pointerId);
    if (!root) return null;
    return new XmlNode(Nokogiri.LibXml2!.createNode(root), this);
  }

  createElement(name: string, ...contentsOrAttrs: (string | Record<string, unknown>)[]): XmlNode {
    const libxml = Nokogiri.LibXml2!;
    const elm = new XmlNode(libxml.createNode(libxml.xmlNewDocNode(this.pointerId, 0, name)), this);
    for (const arg of contentsOrAttrs) {
      if (arg !== null && typeof arg === "object") {
        for (const [k, v] of Object.entries(arg)) {
          const key = String(k);
          const match = XmlDocument.NCNAME_RE.exec(key);
          if (match) {
            const nsName = match[1] ?? null;
            elm.addNamespaceDefinition(nsName, v as string);
          } else {
            elm.set(String(k), String(v));
          }
        }
      } else {
        elm.content = arg;
      }
    }
    const ns = elm.namespaceDefinitions.find((n) => n.prefix == null || n.prefix === "");
    if (ns !== undefined) {
      elm.namespace = ns;
    }
    return elm;
  }

  createTextNode(string: unknown): XmlNode {
    const libxml = Nokogiri.LibXml2!;
    return new XmlNode(
      libxml.createNode(libxml.xmlNewDocText(this.pointerId, String(string))),
      this,
    );
  }

  createCdata(string: unknown): XmlNode {
    const libxml = Nokogiri.LibXml2!;
    return new XmlNode(
      libxml.createNode(libxml.xmlNewCDataBlock(this.pointerId, String(string))),
      this,
    );
  }

  createComment(string: unknown): XmlNode {
    const libxml = Nokogiri.LibXml2!;
    return new XmlNode(
      libxml.createNode(libxml.xmlNewDocComment(this.pointerId, String(string))),
      this,
    );
  }

  decorators(key: unknown): object[] {
    this._decorators ??= new Map();
    if (!this._decorators.has(key)) this._decorators.set(key, []);
    return this._decorators.get(key)!;
  }

  decorate(node: XmlNode): void {
    if (this._decorators === null) return;

    for (const [klass, list] of this._decorators) {
      if (!(node instanceof (klass as typeof XmlNode))) continue;

      for (const mod of list) extend(node, mod);
    }
  }

  override addChild(nodeOrTags: unknown): XmlNode | NodeSet {
    const root = this.root;
    if (
      root &&
      root.name !== "nokogiri_text_wrapper" &&
      !(
        nodeOrTags instanceof XmlNode &&
        (nodeOrTags.isComment() || nodeOrTags.isProcessingInstruction())
      )
    ) {
      throw new RuntimeError("A document may not have multiple root nodes.");
    }

    const coerced = this.coerce(nodeOrTags);
    if (coerced instanceof NodeSet) {
      if (coerced.size > 1) throw new RuntimeError("A document may not have multiple root nodes.");

      return super.addChild(coerced.first());
    } else {
      return super.addChild(coerced);
    }
  }

  fragment(tags: string | null = null): DocumentFragment {
    return new XML.DocumentFragment(this, tags, this.root);
  }

  xpathDoctype(): XPathVisitor["doctype"] {
    return XPathVisitor.DoctypeConfig.XML;
  }

  dispose(): void {
    this._doc?.dispose();
    this._doc = null;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

include(XmlDocument, Searchable);
XML.Document = XmlDocument;

/** @internal */
/** @noRailsEquivalent PERMANENT */
let _wrappedCDocument: number | null = null;

/** @internal */
function nokoXmlDocumentWrap(
  klass: typeof XmlDocument,
  cDocument: number,
  ...args: [version?: string | null, ...args: unknown[]]
): XmlDocument {
  _wrappedCDocument = cDocument;
  try {
    return new klass(...args);
  } finally {
    _wrappedCDocument = null;
  }
}
