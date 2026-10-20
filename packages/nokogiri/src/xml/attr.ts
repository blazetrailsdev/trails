import { rbModConstSet } from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

export class Attr {
  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: { readonly name: string; readonly value: string },
    readonly document: unknown = null,
  ) {}

  get name(): string {
    return this._node.name;
  }

  get content(): string {
    return this._node.value;
  }

  get value(): string {
    return this.content;
  }

  toString(): string {
    return this.content;
  }
}

rbModConstSet(XML, "Attr", Attr);
