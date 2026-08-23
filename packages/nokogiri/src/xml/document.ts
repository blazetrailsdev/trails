import { XmlDocument as LibXmlDocument, XmlParseError } from "libxml2-wasm";
import { XmlNode } from "./node.js";
import { type Readable, readSource } from "../readable.js";
import { SyntaxError } from "./syntax-error.js";

export class XmlDocument {
  readonly errors: ReadonlyArray<SyntaxError>;
  private _doc: LibXmlDocument | null;
  private _root: XmlNode | null;

  private constructor(doc: LibXmlDocument | null, errors: SyntaxError[]) {
    this._doc = doc;
    this.errors = errors;
    this._root = doc !== null ? new XmlNode(doc.root) : null;
  }

  static parse(data: string | Readable): XmlDocument {
    const errors: SyntaxError[] = [];
    try {
      const doc = LibXmlDocument.fromString(readSource(data));
      return new XmlDocument(doc, errors);
    } catch (e) {
      if (e instanceof XmlParseError) {
        for (const detail of e.details) {
          errors.push(new SyntaxError(detail.message, "fatal", detail.line, detail.col));
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
