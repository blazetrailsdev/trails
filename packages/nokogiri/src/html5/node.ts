import {
  defaultTreeAdapter,
  parseFragment,
  serializeOuter,
  type DefaultTreeAdapterMap,
} from "parse5";

import { Attr } from "../xml/attr.js";
import { NodeSet } from "../xml/node-set.js";
import { ArgumentError, RuntimeError, include, rbModConstSet } from "@blazetrails/ruby-compat";
import { DocumentFragment } from "./document-fragment.js";
import { HTML5 } from "../namespaces.js";
import * as Searchable from "../xml/searchable.js";

type Parse5Node = DefaultTreeAdapterMap["childNode"];
type Parse5Parent = DefaultTreeAdapterMap["parentNode"];
type Parse5Attr = DefaultTreeAdapterMap["element"]["attrs"][number];

const pointerIds = new WeakMap<object, number>();
let lastPointerId = 0;

/** @noRailsEquivalent PERMANENT */
export function parse5PointerId(node: object): number {
  let id = pointerIds.get(node);
  if (id === undefined) pointerIds.set(node, (id = ++lastPointerId));
  return id;
}

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

  get pointerId(): number {
    return parse5PointerId(this._node);
  }

  get type(): number {
    if (this._node.nodeName === "#text") return Node.TEXT_NODE;
    if (this._node.nodeName === "#comment") return Node.COMMENT_NODE;
    if (this._node.nodeName === "#cdata-section") return Node.CDATA_SECTION_NODE;
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
    if (this._node.nodeName === "#text") return (this._node as unknown as { value: string }).value;
    if (this._node.nodeName === "#comment") return (this._node as { data: string }).data;
    if (this._node.nodeName === "#cdata-section")
      return (this._node as unknown as { value: string }).value;
    return this.children.map((child) => child.content).join("");
  }

  get text(): string {
    return this.content;
  }

  get children(): Node[] {
    return childNodes(this._node as Parse5Parent, this.document);
  }

  get(name: string): string | null {
    const attrs = (this._node as { attrs?: Parse5Attr[] }).attrs ?? [];
    return attrs.find((attr) => attr.name === name)?.value ?? null;
  }

  get attributes(): Record<string, Attr> {
    return Object.fromEntries(this.attributeNodes.map((attr) => [attr.nodeName, attr]));
  }

  get attributeNodes(): Attr[] {
    const attrs = (this._node as { attrs?: Parse5Attr[] }).attrs ?? [];
    return attrs.map(
      (attr) => new Attr(attr, this.document, this._node as { attrs: Parse5Attr[] }),
    );
  }

  removeAttribute(name: string): Attr | undefined {
    const attr = this.attributes[name];
    attr?.remove();
    return attr;
  }

  get parent(): Node | null {
    const parent = this._node.parentNode;
    return parent ? new Node(parent as unknown as Parse5Node, this.document) : null;
  }

  addPreviousSibling(
    nodeOrTags: Node | DocumentFragment | NodeSet | string,
  ): Node | DocumentFragment | NodeSet | string {
    if (
      this.parent?._node.nodeName === "#document" &&
      !(nodeOrTags instanceof Node && nodeOrTags.type === Node.COMMENT_NODE)
    ) {
      throw new ArgumentError("A document may not have multiple root nodes.");
    }

    return this.addSibling("previous", nodeOrTags);
  }

  before(nodeOrTags: Node | DocumentFragment | NodeSet | string): this {
    this.addPreviousSibling(nodeOrTags);
    return this;
  }

  coerce(data: Node | DocumentFragment | NodeSet | string): Node | NodeSet {
    if (data instanceof NodeSet) return data;
    if (data instanceof DocumentFragment) return new NodeSet(data.document, data.children);
    if (typeof data === "string") {
      return new NodeSet(
        this.document,
        childNodes(
          this.isElement()
            ? parseFragment(this._node as DefaultTreeAdapterMap["element"], data, {})
            : parseFragment(data),
          this.document,
        ),
      );
    }
    if (data instanceof Node) return data;

    throw new ArgumentError(
      `Requires a Node, NodeSet or String argument, and cannot accept a ${(data as object).constructor.name}.\n(You probably want to select a node from the Document with at() or search(), or create a new Node via Node.new().)\n`,
    );
  }

  /** @internal */
  private addSibling(
    nextOrPrevious: "next" | "previous",
    nodeOrTags: Node | DocumentFragment | NodeSet | string,
  ): Node | NodeSet {
    if (!this.parent) throw new RuntimeError("Cannot add sibling to a node with no parent");

    const parent = this._node.parentNode as Parse5Parent;
    const ref = nextOrPrevious === "next" ? _nextSibling(this._node) : this._node;

    const coerced = this.parent.coerce(nodeOrTags);
    const nodes = coerced instanceof NodeSet ? [...coerced] : [coerced];
    for (const n of nodes) {
      defaultTreeAdapter.detachNode(n._node);
      defaultTreeAdapter.insertBefore(parent, n._node, ref as Parse5Node);
    }
    return coerced;
  }

  remove(): this {
    defaultTreeAdapter.detachNode(this._node);
    return this;
  }

  toString(): string {
    return serializeOuter(this._node, { treeAdapter: _cdataTreeAdapter });
  }
}

include(Node, Searchable);

function _nextSibling(node: Parse5Node): Parse5Node | null {
  const siblings = (node.parentNode as Parse5Parent).childNodes;
  return siblings[siblings.indexOf(node) + 1] ?? null;
}

const _cdataRawTextParent = { tagName: "style", namespaceURI: "http://www.w3.org/1999/xhtml" };

const _cdataTreeAdapter: typeof defaultTreeAdapter = {
  ...defaultTreeAdapter,
  isTextNode: (node): node is DefaultTreeAdapterMap["textNode"] =>
    defaultTreeAdapter.isTextNode(node) || node.nodeName === ("#cdata-section" as string),
  getTextNodeContent: (node) =>
    node.nodeName === ("#cdata-section" as string) ? `<![CDATA[${node.value}]]>` : node.value,
  getParentNode: (node) =>
    node.nodeName === ("#cdata-section" as string)
      ? (_cdataRawTextParent as unknown as Parse5Parent)
      : defaultTreeAdapter.getParentNode(node),
};
rbModConstSet(HTML5, "Node", Node);

/** @noRailsEquivalent PERMANENT */
export function childNodes(parent: Parse5Parent, document: unknown = null): Node[] {
  const nodes = (parent as { childNodes?: Parse5Node[] }).childNodes ?? [];
  return nodes.map((node) => new Node(node, document));
}
