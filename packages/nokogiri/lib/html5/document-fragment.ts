import { defaultTreeAdapter, html, parseFragment, type DefaultTreeAdapterMap } from "parse5";

import { Document } from "./document.js";
import { childNodes, Node } from "./node.js";
import { NodeSet } from "../xml/node-set.js";

type Parse5Parent = DefaultTreeAdapterMap["parentNode"];

export class DocumentFragment {
  errors: unknown[];
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  readonly _node: Parse5Parent;

  /** @missingRailsCall fragment — CONVERGEABLE nokogiri-html5-document-fragment-gumbo-fragment */
  constructor(
    public document: Document,
    input: string | null = null,
    context: Node | string | null = null,
    _options: Record<string, unknown> = {},
  ) {
    this.errors = [];
    this._node = defaultTreeAdapter.createDocumentFragment();
    if (input == null) return;

    if (typeof context === "string") {
      context = new Node(defaultTreeAdapter.createElement(context, html.NS.HTML, []), document);
    }
    this._node =
      context !== null && context.isElement()
        ? parseFragment(context._node as DefaultTreeAdapterMap["element"], input, {})
        : parseFragment(input);
  }

  static parse(
    input: string,
    _encoding: string | null = null,
    options: { context?: Node | string | null } = {},
  ): DocumentFragment {
    const { context = null, ...rest } = options;

    const document = new Document();
    document.encoding = "UTF-8";

    return new DocumentFragment(document, input, context, rest);
  }

  dup(): DocumentFragment {
    const newDocument = this.document.dup();
    const newFragment = new (this.constructor as typeof DocumentFragment)(newDocument);
    for (const child of this.children) {
      child.dup(1, newDocument).parent = newFragment;
    }
    return newFragment;
  }

  addChild(nodeOrTags: Node): Node {
    defaultTreeAdapter.detachNode(nodeOrTags._node);
    defaultTreeAdapter.appendChild(this._node, nodeOrTags._node);
    return nodeOrTags;
  }

  toHtml(options: { saveWith?: number } = {}): string {
    return new NodeSet(this.document, this.children).toHtml(options);
  }

  get children(): Node[] {
    return childNodes(this._node, this.document);
  }

  get elementChildren(): NodeSet {
    return new NodeSet(
      this.document,
      this.children.filter((child) => child.isElement()),
    );
  }

  get elements(): NodeSet {
    return this.elementChildren;
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
