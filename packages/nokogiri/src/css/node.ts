/* eslint-disable @typescript-eslint/no-explicit-any -- a racc value stack holds tokens, Nodes and arrays untyped, as Ruby's does. */
import type { XPathVisitor } from "./xpath-visitor.js";

export class Node {
  static readonly ALLOW_COMBINATOR_ON_SELF = [
    "DIRECT_ADJACENT_SELECTOR",
    "FOLLOWING_SELECTOR",
    "CHILD_SELECTOR",
  ];

  type: string;
  value: any[];

  constructor(type: string, value: any[]) {
    this.type = type;
    this.value = value;
  }

  accept(visitor: XPathVisitor): string {
    const msg = `visit${this.type
      .toLowerCase()
      .split("_")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join("")}`;
    return (visitor as unknown as Record<string, (node: Node) => string>)[msg](this);
  }

  toXpath(visitor: XPathVisitor): string {
    const prefix =
      Node.ALLOW_COMBINATOR_ON_SELF.includes(this.type) && this.value[0] == null
        ? "."
        : visitor.prefix;
    return prefix + visitor.accept(this);
  }

  findByType(types: unknown[]): Node[] {
    let matches: Node[] = [];
    if (JSON.stringify(this.toType()) === JSON.stringify(types)) matches.push(this);
    for (const v of this.value) {
      if (v instanceof Node) matches = matches.concat(v.findByType(types));
    }
    return matches;
  }

  toType(): unknown[] {
    return [this.type, ...this.value.filter((n) => n instanceof Node).map((n: Node) => n.toType())];
  }

  toA(): unknown[] {
    return [this.type, ...this.value.map((n) => (n instanceof Node ? n.toA() : [n]))];
  }
}
