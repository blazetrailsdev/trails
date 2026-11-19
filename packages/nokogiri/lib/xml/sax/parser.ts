import type { XmlDocument as LibXmlDocument, XmlTreeNode } from "libxml2-wasm";
import { SaxDocument } from "./document.js";
import { SAX, Nokogiri } from "../../namespaces.js";
import { type Readable, readSource } from "../../readable.js";

export class SaxParser {
  constructor(private readonly handler: SaxDocument) {}

  parse(data: string | Readable): void {
    let doc: LibXmlDocument;
    try {
      doc = Nokogiri.LibXml2!.XmlDocument.fromString(readSource(data));
    } catch (e) {
      if (e instanceof Nokogiri.LibXml2!.XmlParseError) {
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
    if (node instanceof Nokogiri.LibXml2!.XmlElement) {
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
    } else if (node instanceof Nokogiri.LibXml2!.XmlCData) {
      this.handler.cdataBlock(node.content ?? "");
    } else if (node instanceof Nokogiri.LibXml2!.XmlText) {
      this.handler.characters(node.content ?? "");
    }
  }
}

SAX.Parser = SaxParser;
