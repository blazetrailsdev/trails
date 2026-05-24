import { XmlDocument as LibXmlDocument, XmlParseError } from "libxml2-wasm";
import { XmlNode } from "./node.js";

export interface XmlError {
  level: "warning" | "error" | "fatal";
  message: string;
  line?: number;
  column?: number;
}

export class XmlDocument {
  readonly errors: ReadonlyArray<XmlError>;
  private _doc: LibXmlDocument | null;
  private _root: XmlNode | null;

  private constructor(doc: LibXmlDocument | null, errors: XmlError[]) {
    this._doc = doc;
    this.errors = errors;
    this._root = doc !== null ? new XmlNode(doc.root) : null;
  }

  static parse(data: string): XmlDocument {
    const errors: XmlError[] = [];
    try {
      const doc = LibXmlDocument.fromString(data);
      return new XmlDocument(doc, errors);
    } catch (e) {
      if (e instanceof XmlParseError) {
        for (const detail of e.details) {
          errors.push({ level: "fatal", message: detail.message });
        }
        return new XmlDocument(null, errors);
      }
      throw e;
    }
  }

  get root(): XmlNode {
    if (this._root === null) throw new Error("Document has no root (parse failed or disposed)");
    return this._root;
  }

  dispose(): void {
    this._doc?.dispose();
    this._doc = null;
    this._root = null;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}
