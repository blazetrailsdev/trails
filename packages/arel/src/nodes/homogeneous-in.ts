import { Node, NodeVisitor } from "./node.js";
import { Quoted } from "./casted.js";
import { Attribute as AMAttribute, ValueType } from "@blazetrails/activemodel";

// Rails memoizes ActiveModel::Type.default_value as `@default_value ||= Value.new`.
// Mirror that here so we don't allocate a fresh ValueType for every bind.
let _defaultType: ValueType | null = null;
function defaultType(): ValueType {
  return (_defaultType ??= new ValueType());
}

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
    return this.values.map((v) => (v instanceof Node ? v : new Quoted(v)));
  }

  get castedValues(): unknown[] {
    const attr = this.attribute as unknown as {
      typeCaster?: { serialize?: (v: unknown) => unknown; serializable?: (v: unknown) => boolean };
    };
    if (!attr?.typeCaster) return this.values;
    const caster = attr.typeCaster;
    const result: unknown[] = [];
    for (const raw of this.values) {
      if (typeof caster.serializable === "function" && !caster.serializable(raw)) continue;
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
    // Rails: -> value { ActiveModel::Attribute.with_cast_value(
    //   attribute.name, value, ActiveModel::Type.default_value) }
    const attrName = (this.attribute as unknown as { name?: string }).name ?? "";
    return (value: unknown) => AMAttribute.withCastValue(attrName, value, defaultType());
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    if (this.attribute) return block(this.attribute);
    return undefined;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
