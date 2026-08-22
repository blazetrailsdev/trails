import { Binary, NodeOrValue } from "./binary.js";

/**
 * Represents a regex match: left ~ right.
 *
 * Mirrors: Arel::Nodes::Regexp
 */
export class Regexp extends Binary {
  caseSensitive: boolean;
  constructor(left: NodeOrValue, right: NodeOrValue, caseSensitive = true) {
    super(left, right);
    this.caseSensitive = caseSensitive;
  }
}

/**
 * Represents a negated regex match: left !~ right.
 *
 * Mirrors: Arel::Nodes::NotRegexp
 */
export class NotRegexp extends Binary {
  caseSensitive: boolean;
  constructor(left: NodeOrValue, right: NodeOrValue, caseSensitive = true) {
    super(left, right);
    this.caseSensitive = caseSensitive;
  }
}
