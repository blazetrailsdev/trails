import { Binary, NodeOrValue } from "./binary.js";

export class Matches extends Binary {
  escape: string | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape;
    this.caseSensitive = caseSensitive;
  }
}

export class DoesNotMatch extends Binary {
  escape: string | null;
  caseSensitive: boolean;
  constructor(
    left: NodeOrValue,
    right: NodeOrValue,
    escape: string | null = null,
    caseSensitive = false,
  ) {
    super(left, right);
    this.escape = escape;
    this.caseSensitive = caseSensitive;
  }
}
