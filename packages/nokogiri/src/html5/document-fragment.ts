import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

import { Document } from "./document.js";
import { childNodes, type Node } from "./node.js";
import { NodeSet } from "../xml/node-set.js";

type Parse5Parent = DefaultTreeAdapterMap["parentNode"];

export class DocumentFragment {
  private constructor(
    public document: Document,
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: Parse5Parent,
  ) {}

  static parse(tags: string): DocumentFragment {
    const document = new Document();
    document.encoding = "UTF-8";

    return new DocumentFragment(document, parseFragment(tags));
  }

  private _children?: Node[];

  get children(): Node[] {
    return (this._children ??= childNodes(this._node, this.document));
  }

  css(...args: unknown[]): NodeSet {
    if (this.children.length > 0) {
      return new NodeSet(this.document, this.children).css(...args);
    } else {
      return new NodeSet(this.document);
    }
  }

  atCss(...args: unknown[]): Node | undefined {
    return this.css(...args).first();
  }

  toString(): string {
    return this.children.map((child) => child.toString()).join("");
  }
}
