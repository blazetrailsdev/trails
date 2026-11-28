import type {
  XmlAttribute as LibXmlAttribute,
  XmlNode as LibXmlNode,
  XmlTreeNode,
} from "libxml2-wasm";
import type { DefaultTreeAdapterMap } from "parse5";
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { StringIO } from "@blazetrails/ruby-compat/string-io";
import { TypeError } from "@blazetrails/ruby-compat/type-error";
import { include } from "@blazetrails/ruby-compat/include";
import { rbObjClassname } from "@blazetrails/ruby-compat/object";

import { XML, Nokogiri } from "../namespaces.js";

import type { Node } from "../html5/node.js";
import type { XmlDocument } from "./document.js";
import type { DocumentFragment } from "./document-fragment.js";
import { Namespace } from "./namespace.js";
import { NodeSet } from "./node-set.js";
import { SaveOptions } from "./node/save-options.js";
import * as Searchable from "./searchable.js";

export interface AttrNode {
  nodeName: string;
  value: string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- TS2425: a `declare css` property here conflicts with HTML5::DocumentFragment#css (html5/document_fragment.rb), a method; a class cannot declare a bodiless method.
export interface XmlNode {
  css(...args: unknown[]): NodeSet;
  atCss(...args: unknown[]): XmlNode | undefined;
  at(...args: unknown[]): XmlNode | undefined;
  search(...args: unknown[]): NodeSet;
  xpath(...args: unknown[]): NodeSet;
  atXpath(...args: unknown[]): XmlNode | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class XmlNode {
  static readonly ELEMENT_NODE = 1;
  static readonly PI_NODE = 7;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_NODE = 9;
  static readonly IMPLIED_XPATH_CONTEXTS: readonly string[] = [".//"];
  static readonly SaveOptions = SaveOptions;

  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: XmlTreeNode | LibXmlNode | DefaultTreeAdapterMap["node"],
    public document: unknown = null,
  ) {}

  get pointerId(): number {
    return (this._node as unknown as { _nodePtr: number })._nodePtr;
  }

  get namespaces(): Record<string, string> {
    if (!(this._node instanceof Nokogiri.LibXml2!.XmlElement)) return {};
    const hash: Record<string, string> = {};
    for (const [prefix, href] of Object.entries(this._node.namespaces)) {
      const key = prefix ? `xmlns:${prefix}` : "xmlns";
      hash[key] = href;
    }
    return hash;
  }

  get type(): number {
    return Nokogiri.LibXml2!.XmlTreeCommonStruct.type(this.pointerId);
  }

  equals(other: unknown): boolean {
    if (other == null) return false;
    if (!(typeof other === "object" && "pointerId" in other)) return false;
    return this.pointerId === (other as XmlNode).pointerId;
  }

  decorateBang(): void {
    (this.document as XmlDocument).decorate(this);
  }

  addChild(nodeOrTags: unknown): XmlNode | NodeSet {
    const coerced = this.coerce(nodeOrTags);
    if (coerced instanceof NodeSet) {
      coerced.each((n) => this.addChildNodeAndReparentAttrs(n));
    } else {
      this.addChildNodeAndReparentAttrs(coerced);
    }
    return coerced;
  }

  get parent(): XmlNode | null {
    const cParent = Nokogiri.LibXml2!.XmlTreeCommonStruct.parent(this.pointerId);
    if (!cParent) return null;
    const document = this.document as XmlNode | null;
    if (document !== null && cParent === document.pointerId) return document;
    return new XmlNode(Nokogiri.LibXml2!.createNode(cParent), this.document);
  }

  set parent(parentNode: XmlNode | DocumentFragment) {
    parentNode.addChild(this);
  }

  get namespace(): Namespace | null {
    const libxml = Nokogiri.LibXml2!;
    if (this.type !== XmlNode.ELEMENT_NODE) return null;
    const cNamespace = libxml.XmlNodeStruct.namespace(this.pointerId);
    if (cNamespace) return nokoXmlNamespaceWrap(cNamespace, this.document);
    return null;
  }

  set namespace(ns: Namespace | null) {
    if (ns == null) {
      this.setNamespace(ns);
      return;
    }

    if (!(ns instanceof Namespace)) {
      throw new TypeError(`${rbObjClassname(ns)} can't be coerced into Nokogiri::XML::Namespace`);
    }
    if (ns.document !== this.document) {
      throw new ArgumentError("namespace must be declared on the same document");
    }

    this.setNamespace(ns);
  }

  get namespaceDefinitions(): Namespace[] {
    const libxml = Nokogiri.LibXml2!;
    const definitions: Namespace[] = [];
    if (this.type !== XmlNode.ELEMENT_NODE) return definitions;

    let cNamespace = libxml.XmlNodeStruct.nsDef(this.pointerId);
    if (!cNamespace) return definitions;

    while (cNamespace) {
      definitions.push(nokoXmlNamespaceWrap(cNamespace, this.document));
      cNamespace = libxml.XmlNsStruct.next(cNamespace);
    }

    return definitions;
  }

  addNamespaceDefinition(prefix: string | null, href: string): Namespace | null {
    const libxml = Nokogiri.LibXml2!;
    const cNode = this.pointerId;
    let element = cNode;

    let cNamespace = libxml.xmlSearchNs(libxml.XmlTreeCommonStruct.doc(cNode), cNode, prefix);

    if (!cNamespace) {
      if (this.type !== XmlNode.ELEMENT_NODE) {
        element = libxml.XmlTreeCommonStruct.parent(cNode);
      }
      cNamespace = libxml.xmlNewNs(element, href, prefix ?? undefined);
    }

    if (!cNamespace) return null;

    if (prefix == null || cNode !== element) {
      libxml.xmlSetNs(cNode, cNamespace);
    }

    return nokoXmlNamespaceWrap(cNamespace, this.document);
  }

  ancestors(selector: string | null = null): NodeSet {
    if (!("parent" in (this as object))) return new NodeSet(this.document);
    if (!this.parent) return new NodeSet(this.document);

    const parents: XmlNode[] = [this.parent];

    while ("parent" in parents.at(-1)!) {
      const ctxParent = parents.at(-1)!.parent;
      if (!ctxParent) break;

      parents.push(ctxParent);
    }

    if (selector === null) return new NodeSet(this.document, parents as Node[]);

    const root = parents.at(-1)!;
    const searchResults = root.search(selector);

    return new NodeSet(
      this.document,
      parents.filter((parent) =>
        searchResults.toA().some((result) => (result as XmlNode).equals(parent)),
      ) as Node[],
    );
  }

  /** @missingRailsCall get — PERMANENT */
  get(name: string): string | null {
    if (!(this._node instanceof Nokogiri.LibXml2!.XmlElement)) return null;
    return this._node.attr(String(name))?.value ?? null;
  }

  isComment(): boolean {
    return this.type === XmlNode.COMMENT_NODE;
  }

  isProcessingInstruction(): boolean {
    return this.type === XmlNode.PI_NODE;
  }

  isXml(): boolean {
    return this.type === XmlNode.DOCUMENT_NODE;
  }

  get name(): string {
    if (this._node instanceof Nokogiri.LibXml2!.XmlElement) return this._node.name;
    if (this._node instanceof Nokogiri.LibXml2!.XmlText) return "#text";
    if (this._node instanceof Nokogiri.LibXml2!.XmlCData) return "#cdata-section";
    return "#node";
  }

  isElement(): boolean {
    return this._node instanceof Nokogiri.LibXml2!.XmlElement;
  }

  isText(): boolean {
    return this._node instanceof Nokogiri.LibXml2!.XmlText;
  }

  isCdata(): boolean {
    return this._node instanceof Nokogiri.LibXml2!.XmlCData;
  }

  isBlank(): boolean {
    if (
      !(
        this._node instanceof Nokogiri.LibXml2!.XmlText ||
        this._node instanceof Nokogiri.LibXml2!.XmlCData
      )
    )
      return false;
    return /^[ \t\n\r]*$/.test(this.content);
  }

  get content(): string {
    return (this._node as XmlTreeNode).content ?? "";
  }

  set content(string: unknown) {
    this.nativeContent = this.encodeSpecialChars(String(string));
  }

  set nativeContent(content: string) {
    const libxml = Nokogiri.LibXml2!;
    let child = libxml.XmlTreeCommonStruct.children(this.pointerId);
    while (child) {
      const next = libxml.XmlTreeCommonStruct.next(child);
      libxml.xmlUnlinkNode(child);
      child = next;
    }

    libxml.xmlNodeSetContent(this.pointerId, content);
  }

  /** @missingRailsCall xmlEncodeSpecialChars — CONVERGEABLE nokogiri-libxml2-wasm-encode-special-chars */
  encodeSpecialChars(string: string): string {
    return string
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\r/g, "&#13;");
  }

  get text(): string {
    return this.content;
  }

  get children(): NodeSet {
    if (!(this._node instanceof Nokogiri.LibXml2!.XmlElement)) return new NodeSet(this.document);
    const result: XmlNode[] = [];
    let child = this._node.firstChild;
    while (child !== null) {
      result.push(new XmlNode(child, this.document));
      child = child.next;
    }
    return new NodeSet(this.document, result as Node[]);
  }

  get elementChildren(): XmlNode[] {
    return this.children.toA().filter((child) => child.isElement());
  }

  set children(nodeOrTags: XmlNode | NodeSet | DocumentFragment | string) {
    const coerced = this.coerce(nodeOrTags);
    this.children.unlink();
    if (coerced instanceof NodeSet) {
      coerced.each((n) => this.addChildNodeAndReparentAttrs(n));
    } else {
      this.addChildNodeAndReparentAttrs(coerced);
    }
  }

  unlink(): this {
    Nokogiri.LibXml2!.xmlUnlinkNode(this.pointerId);
    return this;
  }

  set(name: unknown, value: unknown): void {
    if (this._node instanceof Nokogiri.LibXml2!.XmlElement)
      this._node.setAttr(String(name), String(value));
  }

  values(): string[] {
    return this.attributeNodes.map((a) => a.value);
  }

  isValue(value: string): boolean {
    return this.values().includes(value);
  }

  get attributeNodes(): AttrNode[] {
    if (!(this._node instanceof Nokogiri.LibXml2!.XmlElement)) return [];
    return this._node.attrs.map((a: LibXmlAttribute) => ({
      nodeName: a.name,
      value: a.value,
    }));
  }

  fragment(tags: string): DocumentFragment {
    return new XML.DocumentFragment(this.document as XmlDocument, tags, this);
  }

  toString(): string {
    return (this.document as XmlNode).isXml() ? this.toXml() : this.toHtml();
  }

  /** @missingRailsArgs join — PERMANENT */
  innerHtml(...args: unknown[]): string {
    return this.children.map((x) => x.toHtml(...(args as [{ saveWith?: number }?]))).join("");
  }

  /** @missingRailsArgs new — PERMANENT */
  serialize(...args: unknown[]): string {
    const block =
      typeof args.at(-1) === "function" ? (args.pop() as (config: SaveOptions) => void) : undefined;
    const options = (
      args[0] !== null && typeof args[0] === "object"
        ? args.shift()
        : { encoding: args[0], saveWith: args[1] }
    ) as { encoding?: string | null; saveWith?: number };

    options.encoding ||= (this.document as { encoding?: string | null } | null)?.encoding;

    const io = new StringIO("");

    this.writeTo(io, options, block);
    return io.string();
  }

  toHtml(options: { saveWith?: number } = {}): string {
    return this.toFormat(SaveOptions.DEFAULT_HTML, options);
  }

  toXml(options: { saveWith?: number; encoding?: string | null; indent?: number } = {}): string {
    options.saveWith ||= SaveOptions.DEFAULT_XML;
    return this.serialize(options);
  }

  toXhtml(options: { saveWith?: number } = {}): string {
    return this.toFormat(SaveOptions.DEFAULT_XHTML, options);
  }

  writeTo(io: StringIO, ...options: unknown[]): void {
    const block =
      typeof options.at(-1) === "function"
        ? (options.pop() as (config: SaveOptions) => void)
        : undefined;
    const opts = (options[0] !== null && typeof options[0] === "object" ? options.shift() : {}) as {
      0?: string | null;
      1?: number;
      encoding?: string | null;
      saveWith?: number;
      indent?: number;
      indentText?: string;
    };
    const encoding =
      opts.encoding || opts[0] || (this.document as { encoding?: string | null } | null)?.encoding;
    const saveOptions = opts.saveWith || opts[1] || SaveOptions.FORMAT;
    const indentTimes = opts.indent ?? 2;
    const indentText = opts.indentText || " ";

    const indentation = indentTimes === 0 ? "" : indentText.repeat(indentTimes);

    const config = new SaveOptions(Number(saveOptions));
    if (block) block(config);

    this.nativeWriteTo(io, encoding ?? null, indentation, config.options);
  }

  /** @internal */
  protected nativeWriteTo(
    io: StringIO,
    encoding: string | null,
    indentString: string,
    options: number,
  ): StringIO {
    const libxml = Nokogiri.LibXml2!;
    const handler = new libxml.XmlStringOutputBufferHandler();
    const savectx = libxml.xmlSaveToIO(handler, encoding, options);
    libxml.xmlSaveSetIndentString(savectx, indentString);
    libxml.xmlSaveTree(savectx, this.pointerId);
    libxml.xmlSaveClose(savectx);
    io.write(handler.result);
    return io;
  }

  /** @internal */
  protected toFormat(saveOption: number, options: { saveWith?: number }): string {
    if (!options.saveWith) options.saveWith = saveOption;
    return this.serialize(options);
  }

  /** @internal */
  protected coerce(data: unknown): XmlNode | NodeSet {
    if (data instanceof NodeSet) {
      return data;
    } else if (data instanceof XML.DocumentFragment) {
      return data.children;
    } else if (typeof data === "string") {
      return this.fragment(data).children;
    } else if (!(data instanceof XML.Document) && data instanceof XmlNode) {
      return data;
    }

    throw new ArgumentError(
      `Requires a Node, NodeSet or String argument, and cannot accept a ${rbObjClassname(data)}.\n(You probably want to select a node from the Document with at() or search(), or create a new Node via Node.new().)\n`,
    );
  }

  /** @internal */
  protected setNamespace(namespace: Namespace | null): void {
    const libxml = Nokogiri.LibXml2!;
    const node = this.pointerId;
    const ns = namespace === null ? 0 : namespace._node.nsPtr!;

    libxml.xmlSetNs(node, ns);

    if (
      ns &&
      this.type === XmlNode.ELEMENT_NODE &&
      !libxml.xmlSearchNs(libxml.XmlTreeCommonStruct.doc(node), node, namespace!.prefix)
    ) {
      const definition = libxml.xmlNewNs(node, namespace!.href, namespace!.prefix ?? undefined);
      if (definition) libxml.xmlSetNs(node, definition);
    }
  }

  /** @internal */
  protected addChildNode(node: XmlNode): void {
    Nokogiri.LibXml2!.xmlUnlinkNode(node.pointerId);
    Nokogiri.LibXml2!.xmlAddChild(this.pointerId, node.pointerId);
    relinkNamespace(node);
  }

  /** @internal */
  protected addChildNodeAndReparentAttrs(node: XmlNode): void {
    this.addChildNode(node);
    if (!(node._node instanceof Nokogiri.LibXml2!.XmlElement)) return;
    for (const attrNode of node._node.attrs.filter((a) => a.name.includes(":"))) {
      const { name, value } = attrNode;
      attrNode.remove();
      node.set(name, value);
    }
  }
}

/**
 * @internal
 * @missingRailsCall xmlSplitQName2 — CONVERGEABLE nokogiri-relink-namespace-qname-and-nsdef-arms
 */
function relinkNamespace(reparented: XmlNode): void {
  const libxml = Nokogiri.LibXml2!;
  const cReparented = reparented.pointerId;

  if (reparented.type !== XmlNode.ELEMENT_NODE) return;

  const cNs = libxml.XmlNodeStruct.namespace(cReparented);
  if (!cNs || !libxml.XmlNsStruct.prefix(cNs)) {
    if (!reparented.name.includes(":")) {
      const ns = libxml.xmlSearchNs(libxml.XmlTreeCommonStruct.doc(cReparented), cReparented, null);

      if (ns) libxml.xmlSetNs(cReparented, ns);
    }
  }

  if (!libxml.XmlTreeCommonStruct.parent(cReparented)) return;

  const cDoc = libxml.XmlTreeCommonStruct.doc(cReparented);
  const cParent = libxml.XmlTreeCommonStruct.parent(cReparented);
  if (
    !libxml.XmlNodeStruct.namespace(cReparented) &&
    cDoc !== cParent &&
    (reparented.document as XmlDocument | null)?.namespaceInheritance === true
  ) {
    libxml.xmlSetNs(cReparented, libxml.XmlNodeStruct.namespace(cParent));
  }
}

/** @internal */
function nokoXmlNamespaceWrap(cNamespace: number, cDocument: unknown): Namespace {
  const libxml = Nokogiri.LibXml2!;
  return new Namespace(
    {
      prefix: libxml.XmlNsStruct.prefix(cNamespace) || null,
      href: libxml.XmlNsStruct.href(cNamespace),
      nsPtr: cNamespace,
    },
    cDocument,
  );
}

include(XmlNode, Searchable);
XML.Node = XmlNode;
