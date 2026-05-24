import {
  XmlAttribute as LibXmlAttribute,
  XmlCData as LibXmlCData,
  XmlElement as LibXmlElement,
  XmlText as LibXmlText,
  XmlTreeNode,
} from "libxml2-wasm";

export interface AttrNode {
  nodeName: string;
  value: string;
}

export class XmlNode {
  constructor(protected readonly _node: XmlTreeNode) {}

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

  get content(): string {
    return this._node.content ?? "";
  }

  get children(): XmlNode[] {
    if (!(this._node instanceof LibXmlElement)) return [];
    const result: XmlNode[] = [];
    let child = this._node.firstChild;
    while (child !== null) {
      result.push(new XmlNode(child));
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
