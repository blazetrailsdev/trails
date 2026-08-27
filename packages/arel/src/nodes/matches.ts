import { Binary, NodeOrValue } from "./binary.js";
import type { Node } from "./node.js";
import { buildQuoted } from "./casted.js";

export class Matches extends Binary {
  readonly escape: Node | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | Node | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape == null ? null : buildQuoted(escape);
    this.caseSensitive = caseSensitive;
  }
}

export class DoesNotMatch extends Matches {}
