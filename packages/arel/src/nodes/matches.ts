import { Binary, NodeOrValue } from "./binary.js";
import type { Node } from "./node.js";

export class Matches extends Binary {
  escape: string | Node | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | Node | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape;
    this.caseSensitive = caseSensitive;
  }
}

export class DoesNotMatch extends Binary {
  escape: string | Node | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | Node | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape;
    this.caseSensitive = caseSensitive;
  }
}
