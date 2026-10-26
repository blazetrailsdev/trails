import { rbModConstSet } from "@blazetrails/ruby-compat";

import { parse5PointerId } from "../html5/node.js";
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

  get pointerId(): number {
    const ptr = (this._node as { _nodePtr?: number })._nodePtr;
    return ptr ?? parse5PointerId(this._node);
  }

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
