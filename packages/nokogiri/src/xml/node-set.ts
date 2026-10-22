import {
  Enumerable,
  include,
  rbModConstSet,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";

import type { Node } from "../html5/node.js";
import {
  Searchable,
  cssRulesToXpath,
  extractParams,
  xpathInternal,
  type SearchableHost,
} from "./searchable.js";

export class NodeSet implements Iterable<Node> {
  declare atCss: (...args: unknown[]) => Node | undefined;
  declare findAll: (block?: (node: Node) => unknown) => Node[];

  static readonly IMPLIED_XPATH_CONTEXTS = [".//", "self::"] as const;

  private readonly _list: Node[] = [];

  constructor(
    readonly document: unknown,
    list: Node[] = [],
  ) {
    for (const x of list) this._list.push(x);
  }

  first(): Node | undefined {
    return this._list[0];
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  css(...args: unknown[]): NodeSet {
    const [rules, handler, ns] = extractParams.call(this as unknown as SearchableHost, args);
    const paths = cssRulesToXpath(this as unknown as SearchableHost, rules, ns);

    return this._list.reduce(
      (set, node) =>
        set.plus(xpathInternal(node as unknown as SearchableHost, paths, handler, ns, null)),
      new NodeSet(this.document),
    );
  }

  plus(nodeSet: NodeSet): NodeSet {
    const list = [...this._list];
    for (const node of nodeSet) {
      if (!list.some((x) => x.pointerId === node.pointerId)) list.push(node);
    }
    return new NodeSet(this.document, list);
  }

  each(block?: (node: Node) => void): this | Enumerator<Node> {
    if (block === undefined) return toEnum(this, "each");

    for (let x = 0; x <= this.length - 1; x++) {
      block(this._list[x]);
    }
    return this;
  }

  get length(): number {
    return this._list.length;
  }

  get size(): number {
    return this.length;
  }

  map<T>(fn: (node: Node) => T): T[] {
    return this._list.map(fn);
  }

  [Symbol.iterator](): Iterator<Node> {
    return this._list[Symbol.iterator]();
  }

  get text(): string {
    return this.map((node) => node.text).join("");
  }

  toString(): string {
    return this.map((node) => node.toString()).join("");
  }
}

include(NodeSet, Enumerable);
include(NodeSet, Searchable);
rbModConstSet(XML, "NodeSet", NodeSet);
