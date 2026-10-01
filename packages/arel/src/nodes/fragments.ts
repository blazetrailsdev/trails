import { rbObjClone, rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { ArgumentError, rbEqual, rbHash } from "@blazetrails/activesupport";
import { arelNode } from "../arel.js";
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

rbSetClassPathString(Fragments, Nodes, "Fragments");
Nodes.Fragments = Fragments;
