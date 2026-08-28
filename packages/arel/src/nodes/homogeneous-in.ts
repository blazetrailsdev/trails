import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { buildQuoted } from "./casted.js";
import { Attribute as AMAttribute, defaultValue } from "@blazetrails/activemodel";

export class HomogeneousIn extends Node {
  readonly attribute: Node;
  readonly values: unknown[];
  readonly type: "in" | "notin";

  constructor(values: unknown[], attribute: Node, type: "in" | "notin") {
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

  get left(): Node {
    return this.attribute;
  }

  get right(): Node[] {
    const attr = this.attribute as Node & { quotedArray?: (vs: unknown[]) => Node[] };
    if (typeof attr.quotedArray === "function") {
      return attr.quotedArray(this.values);
    }
    return this.values.map((v) => buildQuoted(v, this.attribute));
  }

  get castedValues(): unknown[] {
    const attr = this.attribute as unknown as {
      typeCaster?: {
        serialize?: (v: unknown) => unknown;
        isSerializable?: (v: unknown) => boolean;
      };
    };
    const caster = attr?.typeCaster;
    if (!caster) return this.values;
    const result: unknown[] = [];
    for (const raw of this.values) {
      if (typeof caster.isSerializable === "function" && !caster.isSerializable(raw)) continue;
      if (typeof caster.serialize === "function") {
        const cast = caster.serialize(raw);
        if (cast != null) result.push(cast);
      } else {
        result.push(raw);
      }
    }
    return result;
  }

  get procForBinds(): (value: unknown) => unknown {
    return (value: unknown) =>
      AMAttribute.withCastValue(
        (this.attribute as unknown as { name?: string }).name ?? "",
        value,
        defaultValue(),
      );
  }

  fetchAttribute(block: (attr: Node) => boolean): boolean | undefined {
    if (this.attribute) return block(this.attribute);
    return undefined;
  }

  protected ivars(): [Node, unknown[], HomogeneousIn["type"]] {
    return [this.attribute, this.values, this.type];
  }
}
