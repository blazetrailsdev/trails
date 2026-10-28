import {
  Enumerable,
  include,
  rbModConstSet,
  toEnum,
  type Enumerator,
} from "@blazetrails/ruby-compat";

import { XML } from "../namespaces.js";
import { Namespace } from "./namespace.js";

import type { Node } from "../html5/node.js";
import * as Searchable from "./searchable.js";
import type { SearchableHost } from "./searchable.js";

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
    const self = this as unknown as SearchableHost;
    const [rules, handler, ns] = self.extractParams(args);
    const paths = self.cssRulesToXpath(rules, ns);

    return this._list.reduce(
      (set, node) =>
        set.plus(self.xpathInternal(node as unknown as SearchableHost, paths, handler, ns, null)),
      new NodeSet(this.document),
    );
  }

  plus(nodeSet: NodeSet): NodeSet {
    const list = [...this._list];
    for (const n2 of nodeSet) {
      const skip = this._list.some((n1) =>
        n1 instanceof Namespace && n2 instanceof Namespace
          ? n1._node.owner === n2._node.owner && n1.prefix === n2.prefix
          : n1.pointerId === n2.pointerId,
      );
      if (!skip) list.push(n2);
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
