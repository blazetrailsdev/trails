import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";

/**
 * SQL comment: appended as `/* ... *\/` to a query.
 *
 * Mirrors: Arel::Nodes::Comment
 */
export class Comment extends Node {
  readonly values: string[];

  constructor(values: string[]) {
    super();
    this.values = values;
  }

  // Mirrors Arel::Nodes::Comment#hash / #eql? / #== (comment.rb:17-26).
  hash(): number {
    return rbHash([this.values]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Comment &&
      this.constructor === other.constructor &&
      rbEqual(this.values, other.values)
    );
  }
}
