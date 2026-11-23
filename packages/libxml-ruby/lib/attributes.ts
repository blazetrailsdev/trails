import { Attr } from "./attr.js";
import type { XmlElement } from "libxml2-wasm";

export class Attributes {
  constructor(readonly _xnode: XmlElement | null) {}

  get length(): number {
    return this._xnode?.attrs.length ?? 0;
  }

  each(block: (attr: Attr) => void): this {
    for (const xattr of this._xnode?.attrs ?? []) block(new Attr(xattr));
    return this;
  }

  toH(): Record<string, string> {
    const hash: Record<string, string> = {};
    this.each((attr) => {
      hash[attr.name] = attr.value;
    });
    return hash;
  }
}
