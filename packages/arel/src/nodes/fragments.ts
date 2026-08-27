import { ArgumentError, rbEqual, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
import { objectClone } from "../clone-support.js";
import { Node } from "./node.js";

export class Fragments extends Node {
  values: Node[];

  constructor(values: Node[] = []) {
    super();
    this.values = values;
  }

  hash(): number {
    return rbHash([this.values]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Fragments &&
      this.constructor === other.constructor &&
      rbEqual(this.values, other.values)
    );
  }

  clone(): this {
    const copy = objectClone(this);
    copy.values = [...this.values];
    return copy;
  }

  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([...this.values, other as Node]);
  }
}
