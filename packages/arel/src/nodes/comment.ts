import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";

export class Comment extends Node {
  readonly values: string[];

  constructor(values: string[]) {
    super();
    this.values = values;
  }

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
