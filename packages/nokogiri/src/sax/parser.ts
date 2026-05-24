import {
  XmlDocument as LibXmlDocument,
  XmlElement,
  XmlText,
  XmlCData,
  XmlTreeNode,
  XmlParseError,
} from "libxml2-wasm";
import { SaxDocument } from "./document.js";

export class SaxParser {
  constructor(private readonly handler: SaxDocument) {}

  parse(data: string): void {
    let doc: LibXmlDocument;
    try {
      doc = LibXmlDocument.fromString(data);
    } catch (e) {
      if (e instanceof XmlParseError) {
        for (const detail of e.details) {
          this.handler.error(detail.message);
        }
        return;
      }
      throw e;
    }
    try {
      this.handler.startDocument();
      this._walk(doc.root);
      this.handler.endDocument();
    } finally {
      doc.dispose();
    }
  }

  private _walk(node: XmlTreeNode): void {
    if (node instanceof XmlElement) {
      const attrs: [string, string][] = node.attrs.map(
        (a) => [a.name, a.value] as [string, string],
      );
      this.handler.startElement(node.name, attrs);
      let child = node.firstChild;
      while (child !== null) {
        this._walk(child);
        child = child.next;
      }
      this.handler.endElement(node.name);
    } else if (node instanceof XmlCData) {
      this.handler.cdataBlock(node.content ?? "");
    } else if (node instanceof XmlText) {
      this.handler.characters(node.content ?? "");
    }
  }
}
