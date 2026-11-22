import { Nokogiri } from "@blazetrails/nokogiri";
import { ArgumentError } from "@blazetrails/ruby-compat";
import type { XmlDocument, XmlTreeNode } from "libxml2-wasm";
import { Context, type IO } from "./parser/context.js";
import { Error } from "./error.js";
import { Callbacks, type SaxCallbacks } from "./sax-callbacks.js";

export class SaxParser {
  static Callbacks = Callbacks;

  readonly context: Context;
  callbacks: SaxCallbacks | null = null;

  constructor(context: Context | null = null) {
    if (context == null) {
      throw new ArgumentError(
        "An instance of a XML::Parser::Context must be passed to XML::SaxParser.new",
      );
    }
    this.context = context;
  }

  static io(io: IO, options: { encoding?: string } = {}): SaxParser {
    const context = Context.io(io);
    if (options.encoding != null) context.encoding = options.encoding;
    return new this(context);
  }

  static string(string: string | null): SaxParser {
    const context = Context.string(string);
    return new this(context);
  }

  parse(): boolean {
    const LibXml2 = Nokogiri.LibXml2!;
    const handler = this.callbacks;
    let xdoc: XmlDocument;
    try {
      xdoc = LibXml2.XmlDocument.fromString(this.context._source);
    } catch (e) {
      if (e instanceof LibXml2.XmlParseError) {
        const errors = e.details.map((detail) => new Error(detail.message.trim()));
        for (const error of errors) handler?.onError(error);
        throw errors[0] ?? new Error(e.message);
      }
      throw e;
    }
    try {
      if (handler != null) {
        handler.onStartDocument();
        this._walk(handler, xdoc.root);
        handler.onEndDocument();
      }
    } finally {
      xdoc.dispose();
    }
    return true;
  }

  private _walk(handler: SaxCallbacks, xnode: XmlTreeNode): void {
    const LibXml2 = Nokogiri.LibXml2!;
    if (xnode instanceof LibXml2.XmlElement) {
      const attributes: Record<string, string> = {};
      for (const xattr of xnode.attrs) attributes[xattr.name] = xattr.value;
      const xprefix = xnode.namespacePrefix || null;
      const xuri = xnode.namespaceUri || null;
      const name = xprefix ? `${xprefix}:${xnode.name}` : xnode.name;
      if (typeof handler.onStartElement === "function") handler.onStartElement(name, attributes);
      handler.onStartElementNs(xnode.name, attributes, xprefix, xuri, {});
      let xcurrent = xnode.firstChild;
      while (xcurrent !== null) {
        this._walk(handler, xcurrent);
        xcurrent = xcurrent.next;
      }
      if (typeof handler.onEndElement === "function") handler.onEndElement(name);
      handler.onEndElementNs(xnode.name, xprefix, xuri);
    } else if (xnode instanceof LibXml2.XmlCData) {
      handler.onCdataBlock(xnode.content);
    } else if (xnode instanceof LibXml2.XmlText) {
      handler.onCharacters(xnode.content);
    } else if (xnode instanceof LibXml2.XmlComment) {
      handler.onComment(xnode.content);
    }
  }
}
