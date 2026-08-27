import { Binary, NodeOrValue } from "./binary.js";

export class Regexp extends Binary {
  caseSensitive: boolean;
  constructor(left: NodeOrValue, right: NodeOrValue, caseSensitive = true) {
    super(left, right);
    this.caseSensitive = caseSensitive;
  }
}

export class NotRegexp extends Binary {
  caseSensitive: boolean;
  constructor(left: NodeOrValue, right: NodeOrValue, caseSensitive = true) {
    super(left, right);
    this.caseSensitive = caseSensitive;
  }
}
