import {
  XmlAttribute as LibXmlAttribute,
  XmlCData as LibXmlCData,
  XmlElement as LibXmlElement,
  XmlText as LibXmlText,
  XmlTreeNode,
} from "libxml2-wasm";
import { include, rbModConstSet } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

import type { NodeSet } from "./node-set.js";
import "./node-set.js";
import { Searchable } from "./searchable.js";

export interface AttrNode {
  nodeName: string;
  value: string;
}

export class XmlNode {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => XmlNode | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = [".//"] as const;

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

  get attributeNodes(): AttrNode[] {
    if (!(this._node instanceof LibXmlElement)) return [];
    return this._node.attrs.map((a: LibXmlAttribute) => ({
      nodeName: a.name,
      value: a.value,
    }));
  }
}

include(XmlNode, Searchable);
rbModConstSet(XML, "Node", XmlNode);
