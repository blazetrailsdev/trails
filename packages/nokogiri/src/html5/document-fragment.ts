import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

import { childNodes, type Node } from "./node.js";

type Parse5Parent = DefaultTreeAdapterMap["parentNode"];

export class DocumentFragment {
  private constructor(private readonly _fragment: Parse5Parent) {}

  static parse(tags: string): DocumentFragment {
    return new DocumentFragment(parseFragment(tags));
  }

  private _children?: Node[];

  get children(): Node[] {
    return (this._children ??= childNodes(this._fragment));
  }

  toString(): string {
    return this.children.map((child) => child.toString()).join("");
  }
}
