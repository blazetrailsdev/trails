import { parse, parseFragment, serializeOuter, type DefaultTreeAdapterMap } from "parse5";

type Parse5Node = DefaultTreeAdapterMap["childNode"];
type Parse5Parent = DefaultTreeAdapterMap["parentNode"];

/** @noRailsEquivalent PERMANENT */
export interface Attr {
  name: string;
  value: string;
}

/** @noRailsEquivalent PERMANENT */
export class Node {
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;

  constructor(private readonly _node: Parse5Node) {}

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

  get text(): string {
    if (this._node.nodeName === "#text") return (this._node as { value: string }).value;
    if (this._node.nodeName === "#comment") return (this._node as { data: string }).data;
    return this.children.map((child) => child.text).join("");
  }

  private _children?: Node[];

  get children(): Node[] {
    return (this._children ??= childNodes(this._node as Parse5Parent));
  }

  get attributeNodes(): Attr[] {
    const attrs = (this._node as { attrs?: Attr[] }).attrs ?? [];
    return attrs.map(({ name, value }) => ({ name, value }));
  }

  toString(): string {
    return serializeOuter(this._node);
  }
}

function childNodes(parent: Parse5Parent): Node[] {
  const nodes = (parent as { childNodes?: Parse5Node[] }).childNodes ?? [];
  return nodes.map((node) => new Node(node));
}

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

/** @noRailsEquivalent PERMANENT */
export class Document {
  private constructor(private readonly _document: Parse5Parent) {}

  static parse(string: string): Document {
    return new Document(parse(string));
  }

  get root(): Node | null {
    const root = childNodes(this._document).find((node) => node.isElement());
    return root ?? null;
  }
}
