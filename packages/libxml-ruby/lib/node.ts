import { Nokogiri } from "@blazetrails/nokogiri";
import type { XmlTreeNode } from "libxml2-wasm";
import { Attributes } from "./attributes.js";
import type { Attr } from "./attr.js";

export class Node {
  static readonly ELEMENT_NODE = 1;
  static readonly ATTRIBUTE_NODE = 2;
  static readonly TEXT_NODE = 3;
  static readonly CDATA_SECTION_NODE = 4;
  static readonly ENTITY_REF_NODE = 5;
  static readonly PI_NODE = 7;
  static readonly COMMENT_NODE = 8;

  constructor(readonly _xnode: XmlTreeNode) {}

  get name(): string | null {
    const xnode = this._xnode;
    return "name" in xnode && typeof xnode.name === "string" ? xnode.name : null;
  }

  get content(): string | null {
    return this._xnode.content ?? null;
  }

  get nodeType(): number | null {
    const LibXml2 = Nokogiri.LibXml2!;
    const xnode = this._xnode;
    if (xnode instanceof LibXml2.XmlElement) return Node.ELEMENT_NODE;
    if (xnode instanceof LibXml2.XmlCData) return Node.CDATA_SECTION_NODE;
    if (xnode instanceof LibXml2.XmlText) return Node.TEXT_NODE;
    if (xnode instanceof LibXml2.XmlComment) return Node.COMMENT_NODE;
    if (xnode instanceof LibXml2.XmlEntityReference) return Node.ENTITY_REF_NODE;
    return null;
  }

  isAttributes(): boolean {
    return this.attributes.length > 0;
  }

  get attributes(): Attributes {
    const xnode = this._xnode;
    return new Attributes(xnode instanceof Nokogiri.LibXml2!.XmlElement ? xnode : null);
  }

  each(block: (node: Node) => void): null {
    const xnode = this._xnode;
    let xcurrent = xnode instanceof Nokogiri.LibXml2!.XmlElement ? xnode.firstChild : null;
    while (xcurrent !== null) {
      const xnext = xcurrent.next;
      block(new Node(xcurrent));
      xcurrent = xnext;
    }
    return null;
  }

  eachChild(block: (node: Node) => void): null {
    return this.each(block);
  }

  eachAttr(block: (attr: Attr) => void): void {
    this.attributes.each((attr) => {
      block(attr);
    });
  }

  isAttribute(): boolean {
    return this.nodeType === Node.ATTRIBUTE_NODE;
  }

  isCdata(): boolean {
    return this.nodeType === Node.CDATA_SECTION_NODE;
  }

  isComment(): boolean {
    return this.nodeType === Node.COMMENT_NODE;
  }

  isElement(): boolean {
    return this.nodeType === Node.ELEMENT_NODE;
  }

  isEntityRef(): boolean {
    return this.nodeType === Node.ENTITY_REF_NODE;
  }

  isText(): boolean {
    return this.nodeType === Node.TEXT_NODE;
  }
}
