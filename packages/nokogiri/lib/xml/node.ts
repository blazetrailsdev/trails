import {
  XmlAttribute as LibXmlAttribute,
  XmlCData as LibXmlCData,
  XmlElement as LibXmlElement,
  XmlText as LibXmlText,
  XmlTreeNode,
} from "libxml2-wasm";
import { xmlAddChild, xmlUnlinkNode } from "libxml2-wasm/lib/libxml2.mjs";
import { ArgumentError, include, rbObjClassname } from "@blazetrails/ruby-compat";

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

export class XmlNode {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => XmlNode | undefined;
  declare xpath: (...args: unknown[]) => NodeSet;
  declare atXpath: (...args: unknown[]) => XmlNode | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = [".//"] as const;
  static readonly SaveOptions = SaveOptions;

  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: XmlTreeNode,
    readonly document: unknown,
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
    return this._node.content ?? "";
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
  private addChildNode(node: XmlNode): void {
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
