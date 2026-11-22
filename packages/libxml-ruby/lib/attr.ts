import type { XmlAttribute } from "libxml2-wasm";

export class Attr {
  constructor(readonly _xattr: XmlAttribute) {}

  get name(): string {
    return this._xattr.name;
  }

  get value(): string {
    return this._xattr.value;
  }
}
