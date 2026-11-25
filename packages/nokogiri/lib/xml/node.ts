import type { XmlAttribute as LibXmlAttribute, XmlTreeNode } from "libxml2-wasm";
import type { DefaultTreeAdapterMap } from "parse5";
import { ArgumentError, StringIO, include, rbObjClassname } from "@blazetrails/ruby-compat";

import { XML, Nokogiri } from "../namespaces.js";

import type { Node } from "../html5/node.js";
import type { XmlDocument } from "./document.js";
import type { DocumentFragment } from "./document-fragment.js";
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
  xpath(...args: unknown[]): NodeSet;
  atXpath(...args: unknown[]): XmlNode | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class XmlNode {
  static readonly DOCUMENT_NODE = 9;
  static readonly IMPLIED_XPATH_CONTEXTS: readonly string[] = [".//"];
  static readonly SaveOptions = SaveOptions;

  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: XmlTreeNode | DefaultTreeAdapterMap["node"],
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

  set(name: string, value: string): void {
    if (this._node instanceof Nokogiri.LibXml2!.XmlElement) this._node.setAttr(name, value);
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
    return (this.document as XmlDocument).isXml() ? this.toXml() : this.toHtml();
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

  toXml(options: { saveWith?: number; encoding?: string | null } = {}): string {
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
  protected addChildNode(node: XmlNode): void {
    Nokogiri.LibXml2!.xmlUnlinkNode(node.pointerId);
    Nokogiri.LibXml2!.xmlAddChild(this.pointerId, node.pointerId);
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

include(XmlNode, Searchable);
XML.Node = XmlNode;
