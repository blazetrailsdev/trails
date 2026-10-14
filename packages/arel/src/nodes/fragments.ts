import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { ArgumentError, rbEqual, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
import { Node } from "./node.js";
import type { ArelNode } from "../arel.js";

export class Fragments extends Node {
  values: ArelNode[];

  constructor(values: ArelNode[] = []) {
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

  initializeCopy(_other: Fragments): void {
    this.values = rbObjClone(this.values);
  }

  plus(other: unknown): Fragments {
    if (!arelNode(other)) {
      throw new ArgumentError("Expected Arel node");
    }
    return new Fragments([...this.values, other as Node]);
  }
}

rbModConstSet(Nodes, "Fragments", Fragments);
