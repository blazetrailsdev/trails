import { XmlDocument as LibXmlDocument, XmlParseError } from "libxml2-wasm";
import { include } from "@blazetrails/ruby-compat";

import type { NodeSet } from "./node-set.js";
import { Searchable } from "./searchable.js";
import { XmlNode } from "./node.js";
import { type Readable, readSource } from "../readable.js";
import { SyntaxError } from "./syntax-error.js";
import { XPathVisitor } from "../css/xpath-visitor.js";

export class XmlDocument {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => XmlNode | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = ["//"] as const;

  readonly errors: ReadonlyArray<SyntaxError>;
  private _doc: LibXmlDocument | null;
  private _root: XmlNode | null;

  private constructor(doc: LibXmlDocument | null, errors: SyntaxError[]) {
    this._doc = doc;
    this.errors = errors;
    this._root = doc !== null ? new XmlNode(doc.root, this) : null;
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

  get document(): XmlDocument {
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  get _node(): LibXmlDocument | null {
    return this._doc;
  }

  get root(): XmlNode {
    if (this._root === null) throw new Error("Document has no root (parse failed or disposed)");
    return this._root;
  }

  xpathDoctype(): XPathVisitor["doctype"] {
    return XPathVisitor.DoctypeConfig.XML;
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

include(XmlDocument, Searchable);
