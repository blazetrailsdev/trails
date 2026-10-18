import { serializeOuter, type DefaultTreeAdapterMap } from "parse5";

import type { Attr } from "../xml/attr.js";
import type { NodeSet } from "../xml/node-set.js";
import { include, rbModConstSet } from "@blazetrails/ruby-compat";
import { HTML5 } from "../namespaces.js";
import "../xml/node-set.js";
import { Searchable } from "../xml/searchable.js";

type Parse5Node = DefaultTreeAdapterMap["childNode"];
type Parse5Parent = DefaultTreeAdapterMap["parentNode"];

export class Node {
  declare css: (...args: unknown[]) => NodeSet;
  declare atCss: (...args: unknown[]) => Node | undefined;

  static readonly IMPLIED_XPATH_CONTEXTS = [".//"] as const;
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly CDATA_SECTION_NODE = 4;
  static readonly COMMENT_NODE = 8;

  constructor(
    /**
     * @internal
     * @noRailsEquivalent PERMANENT
     */
    readonly _node: Parse5Node,
    readonly document: unknown = null,
  ) {}

  get type(): number {
    if (this._node.nodeName === "#text") return Node.TEXT_NODE;
    if (this._node.nodeName === "#comment") return Node.COMMENT_NODE;
    if ("tagName" in this._node) return Node.ELEMENT_NODE;
    return 0;
  }

  get name(): string {
    if (this._node.nodeName === "#text") return "text";
    if (this._node.nodeName === "#comment") return "comment";
    return this._node.nodeName;
  }

  isElement(): boolean {
    return this.type === Node.ELEMENT_NODE;
  }

  isText(): boolean {
    return this.type === Node.TEXT_NODE;
  }

  isCdata(): boolean {
    return this.type === Node.CDATA_SECTION_NODE;
  }

  isBlank(): boolean {
    if (this.type !== Node.TEXT_NODE && this.type !== Node.CDATA_SECTION_NODE) return false;
    return /^[ \t\n\r]*$/.test(this.content);
  }

  get content(): string {
    if (this._node.nodeName === "#text") return (this._node as { value: string }).value;
    if (this._node.nodeName === "#comment") return (this._node as { data: string }).data;
    return this.children.map((child) => child.content).join("");
  }

  get text(): string {
    return this.content;
  }

  private _children?: Node[];

  get children(): Node[] {
    return (this._children ??= childNodes(this._node as Parse5Parent, this.document));
  }

  get(name: string): string | null {
    const attrs = (this._node as { attrs?: Attr[] }).attrs ?? [];
    return attrs.find((attr) => attr.name === name)?.value ?? null;
  }

  get attributeNodes(): Attr[] {
    const attrs = (this._node as { attrs?: Attr[] }).attrs ?? [];
    return attrs.map(({ name, value }) => ({ name, value }));
  }

  toString(): string {
    return serializeOuter(this._node);
  }
}

include(Node, Searchable);
rbModConstSet(HTML5, "Node", Node);

/** @noRailsEquivalent PERMANENT */
export function childNodes(parent: Parse5Parent, document: unknown = null): Node[] {
  const nodes = (parent as { childNodes?: Parse5Node[] }).childNodes ?? [];
  return nodes.map((node) => new Node(node, document));
}
