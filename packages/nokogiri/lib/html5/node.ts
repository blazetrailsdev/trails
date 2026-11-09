import {
  defaultTreeAdapter,
  html,
  parseFragment,
  serializeOuter,
  type DefaultTreeAdapterMap,
} from "parse5";

import { Attr } from "../xml/attr.js";
import { NodeSet } from "../xml/node-set.js";
import {
  ArgumentError,
  RuntimeError,
  StringIO,
  include,
  rbObjRespondTo,
  constSet,
  rbObjClassname,
} from "@blazetrails/ruby-compat";
import { DocumentFragment } from "./document-fragment.js";
import { HTML5 } from "../namespaces.js";
import * as Searchable from "../xml/searchable.js";
import { SaveOptions } from "../xml/node/save-options.js";

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
  declare xpath: (...args: unknown[]) => NodeSet;
  declare atXpath: (...args: unknown[]) => Node | undefined;
  declare search: (...args: unknown[]) => NodeSet;

  static readonly IMPLIED_XPATH_CONTEXTS = [".//"] as const;
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly CDATA_SECTION_NODE = 4;
  static readonly COMMENT_NODE = 8;
  static readonly SaveOptions = SaveOptions;

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

  set content(string: unknown) {
    for (const child of [...(this._node as Parse5Parent).childNodes]) {
      defaultTreeAdapter.detachNode(child);
    }
    defaultTreeAdapter.insertText(this._node as Parse5Parent, String(string));
  }

  get text(): string {
    return this.content;
  }

  get children(): Node[] {
    return childNodes(this._node as Parse5Parent, this.document);
  }

  set children(nodeOrTags: Node | DocumentFragment | NodeSet | string) {
    const coerced = this.coerce(nodeOrTags);
    new NodeSet(this.document, this.children).unlink();
    if (coerced instanceof NodeSet) {
      coerced.each((n) => this.addChildNodeAndReparentAttrs(n));
    } else {
      this.addChildNodeAndReparentAttrs(coerced);
    }
  }

  dup(level = 1, newParentDoc: unknown = this.document): Node {
    return new Node(_cloneNode(this._node, level), newParentDoc);
  }

  addChild(nodeOrTags: Node | DocumentFragment | NodeSet | string): Node | NodeSet {
    const coerced = this.coerce(nodeOrTags);
    if (coerced instanceof NodeSet) {
      coerced.each((n) => this.addChildNodeAndReparentAttrs(n));
    } else {
      this.addChildNodeAndReparentAttrs(coerced);
    }
    return coerced;
  }

  setInnerHtml(nodeOrTags: Node | DocumentFragment | NodeSet | string): typeof nodeOrTags {
    this.children = nodeOrTags;
    return nodeOrTags;
  }

  replace(nodeOrTags: Node | DocumentFragment | NodeSet | string): Node | NodeSet {
    if (!this.parent) throw new RuntimeError("Cannot replace a node with no parent");

    if (this.isText()) {
      const replacee = new Node(
        defaultTreeAdapter.createElement("dummy", html.NS.HTML, []),
        this.document,
      );
      this.addPreviousSiblingNode(replacee);
      this.unlink();
      return replacee.replace(nodeOrTags);
    }

    const coerced = this.parent.coerce(nodeOrTags);

    if (coerced instanceof NodeSet) {
      coerced.each((n) => this.addPreviousSibling(n));
      this.unlink();
    } else {
      this.replaceNode(coerced);
    }
    return coerced;
  }

  get(name: string): string | null {
    const attrs = (this._node as { attrs?: Parse5Attr[] }).attrs ?? [];
    return attrs.find((attr) => attr.name === name)?.value ?? null;
  }

  set(name: unknown, value: unknown): void {
    const attrs = (this._node as { attrs: Parse5Attr[] }).attrs;
    const attr = attrs.find((a) => a.name === String(name));
    if (attr) attr.value = String(value);
    else attrs.push({ name: String(name), value: String(value) });
  }

  isKey(attribute: string): boolean {
    return this.get(attribute) !== null;
  }

  isMatches(selector: string): boolean {
    return this.ancestors().last()!.search(selector).isInclude(this);
  }

  /** @missingRailsArgs join — PERMANENT */
  innerHtml(options: { preserveNewline?: boolean; saveWith?: number } = {}): string {
    let result = options.preserveNewline && this.isPrependNewline() ? "\n" : "";
    result += this.children.map((child) => child.toHtml(options)).join("");
    return result;
  }

  ancestors(selector: string | null = null): NodeSet {
    if (!rbObjRespondTo(this, "parent")) return new NodeSet(this.document);
    if (!this.parent) return new NodeSet(this.document);

    const parents = [this.parent];

    while (rbObjRespondTo(parents.at(-1), "parent")) {
      const ctxParent = parents.at(-1)!.parent;
      if (!ctxParent) break;

      parents.push(ctxParent);
    }

    if (!selector) return new NodeSet(this.document, parents);

    const root = parents.at(-1)!;
    const searchResults = root.search(selector);

    return new NodeSet(
      this.document,
      parents.filter((parent) => searchResults.isInclude(parent)),
    );
  }

  equals(other: unknown): boolean {
    if (other == null || other === false) return false;
    if (!rbObjRespondTo(other, "pointerId")) return false;

    return this.pointerId === (other as Node).pointerId;
  }

  serialize(...args: unknown[]): string {
    const block =
      typeof args.at(-1) === "function" ? (args.pop() as (config: SaveOptions) => void) : undefined;
    const options = (
      args[0] !== null && typeof args[0] === "object"
        ? args.shift()
        : { encoding: args[0], saveWith: args[1] }
    ) as { encoding?: string | null; saveWith?: number };

    options.encoding ||= (this.document as { encoding?: string | null } | null)?.encoding;

    const io = new StringIO();

    this.writeTo(io, options, block);
    return io.string();
  }

  toHtml(options: { saveWith?: number } = {}): string {
    return this.toFormat(SaveOptions.DEFAULT_HTML, options);
  }

  writeTo(io: StringIO, ...options: unknown[]): void {
    const block =
      typeof options.at(-1) === "function"
        ? (options.pop() as (config: SaveOptions) => void)
        : undefined;
    const opts = (options[0] !== null && typeof options[0] === "object" ? options.shift() : {}) as {
      saveWith?: number;
      indent?: number;
      indentText?: string;
      preserveNewline?: boolean;
    };
    const saveOptions = opts.saveWith || (options[1] as number | undefined) || SaveOptions.FORMAT;

    const config = new SaveOptions(Number(saveOptions));
    if (block) block(config);

    const configOptions = config.options;
    if ((configOptions & (SaveOptions.AS_XML | SaveOptions.AS_XHTML)) !== 0) {
      io.write(this.toString());
    } else {
      const html = this.htmlStandardSerialize(opts.preserveNewline || false);
      io.write(html);
    }
  }

  /** @internal */
  private htmlStandardSerialize(preserveNewline: boolean): string {
    const html = serializeOuter(this._node);
    if (!preserveNewline || !this.isPrependNewline()) return html;
    const start = html.indexOf(">") + 1;
    return `${html.slice(0, start)}\n${html.slice(start)}`;
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

  set parent(parentNode: Node | DocumentFragment) {
    parentNode.addChild(this);
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

  /** @internal */
  protected coerce(data: Node | DocumentFragment | NodeSet | string): Node | NodeSet {
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
      `Requires a Node, NodeSet or String argument, and cannot accept a ${rbObjClassname(data)}.\n(You probably want to select a node from the Document with at() or search(), or create a new Node via Node.new().)\n`,
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

  /** @internal */
  private toFormat(saveOption: number, options: { saveWith?: number }): string {
    if (!options.saveWith) options.saveWith = saveOption;
    return this.serialize(options);
  }

  /** @internal */
  private isPrependNewline(): boolean {
    if (!["pre", "textarea", "listing"].includes(this.name)) return false;
    const first = this.children[0];
    return first !== undefined && first.isText() && first.content.startsWith("\n");
  }

  /** @internal */
  private addChildNodeAndReparentAttrs(node: Node): void {
    this.addChildNode(node);
  }

  /** @internal */
  private addChildNode(node: Node): void {
    defaultTreeAdapter.detachNode(node._node);
    defaultTreeAdapter.appendChild(this._node as Parse5Parent, node._node);
  }

  /** @internal */
  private addPreviousSiblingNode(node: Node): void {
    defaultTreeAdapter.detachNode(node._node);
    defaultTreeAdapter.insertBefore(this._node.parentNode as Parse5Parent, node._node, this._node);
  }

  /** @internal */
  private replaceNode(node: Node): void {
    this.addPreviousSiblingNode(node);
    this.unlink();
  }

  unlink(): this {
    defaultTreeAdapter.detachNode(this._node);
    return this;
  }

  remove(): this {
    return this.unlink();
  }

  toString(): string {
    return serializeOuter(this._node, { treeAdapter: _cdataTreeAdapter });
  }
}

include(Node, Searchable);

function _cloneNode<T extends object>(node: T, level: number): T {
  const copy: Record<string, unknown> = { ...node, parentNode: null };
  if ("attrs" in node) copy.attrs = (node.attrs as Parse5Attr[]).map((a) => ({ ...a }));
  if ("childNodes" in node) {
    copy.childNodes =
      level > 0
        ? (node.childNodes as Parse5Node[]).map((child) => {
            const c = _cloneNode(child, level);
            (c as { parentNode: unknown }).parentNode = copy;
            return c;
          })
        : [];
  }
  if ("content" in node && node.content && level > 0)
    copy.content = _cloneNode(node.content as object, level);
  return copy as T;
}

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
constSet(HTML5, "Node", Node);

/** @noRailsEquivalent PERMANENT */
export function childNodes(parent: Parse5Parent, document: unknown = null): Node[] {
  const nodes = (parent as { childNodes?: Parse5Node[] }).childNodes ?? [];
  return nodes.map((node) => new Node(node, document));
}
