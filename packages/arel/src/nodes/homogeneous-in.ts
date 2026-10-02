import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { Attribute } from "../attributes/attribute.js";
import { Attribute as AMAttribute, defaultValue } from "@blazetrails/activemodel";
import type { ArelNode } from "../arel.js";

export class HomogeneousIn extends Node {
  readonly attribute: ArelNode & Pick<Attribute, "quotedArray" | "typeCaster">;
  readonly values: unknown[];
  readonly type: "in" | "notin";

  constructor(values: unknown[], attribute: HomogeneousIn["attribute"], type: "in" | "notin") {
    super();
    this.values = values;
    this.attribute = attribute;
    this.type = type;
  }

  hash(): number {
    return rbHash(this.ivars());
  }

  eql(other: unknown): boolean {
    return (
      this === other ||
      (other instanceof HomogeneousIn &&
        this.constructor === other.constructor &&
        rbEqual(this.ivars(), other.ivars()))
    );
  }

  isEquality(): boolean {
    return this.type === "in";
  }

  invert(): HomogeneousIn {
    return new HomogeneousIn(this.values, this.attribute, this.type === "in" ? "notin" : "in");
  }

  get left(): ArelNode {
    return this.attribute;
  }

  get right(): ArelNode[] {
    return this.attribute.quotedArray(this.values);
  }

  get castedValues(): unknown[] {
    const type = this.attribute.typeCaster as {
      serialize(value: unknown): unknown;
      isSerializable(value: unknown): boolean;
    };

    const castedValues = this.values.map((rawValue) =>
      type.isSerializable(rawValue) ? type.serialize(rawValue) : null,
    );

    return castedValues.filter((value) => value != null);
  }

  get procForBinds(): (value: unknown) => unknown {
    return (value: unknown) =>
      AMAttribute.withCastValue(
        (this.attribute as unknown as { name?: string }).name ?? "",
        value,
        defaultValue(),
      );
  }

  fetchAttribute(block: (attr: HomogeneousIn["attribute"]) => boolean): boolean | undefined {
    if (this.attribute) return block(this.attribute);
    return undefined;
  }

  protected ivars(): [ArelNode, unknown[], HomogeneousIn["type"]] {
    return [this.attribute, this.values, this.type];
  }
}

rbModConstSet(Nodes, "HomogeneousIn", HomogeneousIn);
