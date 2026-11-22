import type { XmlDocument } from "libxml2-wasm";
import { Node } from "./node.js";

export class Document {
  constructor(readonly _xdoc: XmlDocument) {}

  /** @noRailsEquivalent PERMANENT */
  dispose(): void {
    this._xdoc.dispose();
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.dispose](): void {
    this.dispose();
  }

  get root(): Node | null {
    const xroot = this._xdoc.root;
    return xroot == null ? null : new Node(xroot);
  }
}
