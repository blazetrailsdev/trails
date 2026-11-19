import {
  XmlAttribute as LibXmlAttribute,
  XmlCData as LibXmlCData,
  XmlElement as LibXmlElement,
  XmlText as LibXmlText,
  XmlTreeNode,
} from "libxml2-wasm";
import { xmlAddChild, xmlUnlinkNode } from "libxml2-wasm/lib/libxml2.mjs";
import type { DefaultTreeAdapterMap } from "parse5";
import { ArgumentError, StringIO, include, rbObjClassname } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

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
    if (!(this._node instanceof LibXmlElement)) return {};
    const hash: Record<string, string> = {};
    for (const [prefix, href] of Object.entries(this._node.namespaces)) {
      const key = prefix ? `xmlns:${prefix}` : "xmlns";
      hash[key] = href;
    }
    return hash;
  }

  get name(): string {
    if (this._node instanceof LibXmlElement) return this._node.name;
    if (this._node instanceof LibXmlText) return "#text";
    if (this._node instanceof LibXmlCData) return "#cdata-section";
    return "#node";
  }

  isElement(): boolean {
    return this._node instanceof LibXmlElement;
  }

  isText(): boolean {
    return this._node instanceof LibXmlText;
  }

  isCdata(): boolean {
    return this._node instanceof LibXmlCData;
  }

  isBlank(): boolean {
    if (!(this._node instanceof LibXmlText || this._node instanceof LibXmlCData)) return false;
    return /^[ \t\n\r]*$/.test(this.content);
  }

  get content(): string {
    return (this._node as XmlTreeNode).content ?? "";
  }

  get children(): XmlNode[] {
    if (!(this._node instanceof LibXmlElement)) return [];
    const result: XmlNode[] = [];
    let child = this._node.firstChild;
    while (child !== null) {
      result.push(new XmlNode(child, this.document));
      child = child.next;
    }
    return result;
  }

  get elementChildren(): XmlNode[] {
    return this.children.filter((child) => child.isElement());
  }

  set children(nodeOrTags: XmlNode | NodeSet | DocumentFragment | string) {
    const coerced = this.coerce(nodeOrTags);
    new NodeSet(this.document, this.children as unknown as Node[]).unlink();
    if (coerced instanceof NodeSet) {
      coerced.each((n) => this.addChildNodeAndReparentAttrs(n as unknown as XmlNode));
    } else {
      this.addChildNodeAndReparentAttrs(coerced);
    }
  }

  unlink(): this {
    xmlUnlinkNode(this.pointerId);
    return this;
  }

  set(name: string, value: string): void {
    if (this._node instanceof LibXmlElement) this._node.setAttr(name, value);
  }

  values(): string[] {
    return this.attributeNodes.map((a) => a.value);
  }

  isValue(value: string): boolean {
    return this.values().includes(value);
  }

  get attributeNodes(): AttrNode[] {
    if (!(this._node instanceof LibXmlElement)) return [];
    return this._node.attrs.map((a: LibXmlAttribute) => ({
      nodeName: a.name,
      value: a.value,
    }));
  }

  fragment(tags: string): DocumentFragment {
    return new XML.DocumentFragment(this.document as XmlDocument, tags, this);
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
    _encoding: string | null,
    indentString: string,
    options: number,
  ): StringIO {
    io.write(
      this._node instanceof LibXmlElement
        ? this._node.toString({
            format: (options & SaveOptions.FORMAT) !== 0,
            noEmptyTags: (options & SaveOptions.NO_EMPTY_TAGS) !== 0,
            indentString,
          })
        : (this._node as XmlTreeNode).toString(),
    );
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
      return new NodeSet(this.document, data.children as unknown as Node[]);
    } else if (typeof data === "string") {
      return new NodeSet(this.document, this.fragment(data).children as unknown as Node[]);
    } else if (!(data instanceof XML.Document) && data instanceof XmlNode) {
      return data;
    }

    throw new ArgumentError(
      `Requires a Node, NodeSet or String argument, and cannot accept a ${rbObjClassname(data)}.\n(You probably want to select a node from the Document with at() or search(), or create a new Node via Node.new().)\n`,
    );
  }

  /** @internal */
  protected addChildNode(node: XmlNode): void {
    xmlUnlinkNode(node.pointerId);
    xmlAddChild(this.pointerId, node.pointerId);
  }

  /** @internal */
  protected addChildNodeAndReparentAttrs(node: XmlNode): void {
    this.addChildNode(node);
    if (!(node._node instanceof LibXmlElement)) return;
    for (const attrNode of node._node.attrs.filter((a) => a.name.includes(":"))) {
      const { name, value } = attrNode;
      attrNode.remove();
      node.set(name, value);
    }
  }
}

include(XmlNode, Searchable);
XML.Node = XmlNode;
