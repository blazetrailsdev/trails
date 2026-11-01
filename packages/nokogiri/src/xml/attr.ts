import { constSet } from "@blazetrails/ruby-compat";

import { parse5PointerId } from "../html5/node.js";
import { XML } from "../namespaces.js";
import { Namespace } from "./namespace.js";

interface AttrStruct {
  readonly name: string;
  value: string;
  readonly prefix?: string;
  readonly namespace?: string;
}

export class Attr {
  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: AttrStruct,
    readonly document: unknown = null,
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _parent: { attrs: AttrStruct[] } | null = null,
  ) {}

  get pointerId(): number {
    const ptr = (this._node as { _nodePtr?: number })._nodePtr;
    return ptr ?? parse5PointerId(this._node);
  }

  get name(): string {
    return this._node.name;
  }

  get nodeName(): string {
    return this._node.name;
  }

  get namespace(): Namespace | null {
    const { prefix, namespace } = this._node;
    if (!prefix) return null;
    return new Namespace({ prefix, href: namespace ?? "" }, this.document);
  }

  get content(): string {
    return this._node.value;
  }

  get value(): string {
    return this.content;
  }

  set value(value: string) {
    this._node.value = value;
  }

  remove(): this {
    const attrs = this._parent?.attrs;
    const index = attrs ? attrs.indexOf(this._node) : -1;
    if (index >= 0) attrs!.splice(index, 1);
    return this;
  }

  toString(): string {
    return this.content;
  }
}

constSet(XML, "Attr", Attr);
