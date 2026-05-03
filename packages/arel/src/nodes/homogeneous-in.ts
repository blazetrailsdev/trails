import { Node, NodeVisitor } from "./node.js";
import { buildQuoted } from "./casted.js";
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

  // Mirrors Arel::Nodes::HomogeneousIn#right (homogeneous_in.rb):
  //   `attribute.quoted_array(values)`
  // which routes through Predications#quoted_array → quoted_node →
  // `Nodes.build_quoted(other, attribute)` — non-Node values become
  // `Casted` (carrying the attribute's type-cast context), not bare
  // Quoted. Use the attribute's own `quotedArray` when present so any
  // host-class override participates; otherwise fall through to the
  // shared buildQuoted with the attribute as the casting context.
  get right(): Node[] {
    const attr = this.attribute as Node & { quotedArray?: (vs: unknown[]) => Node[] };
    if (typeof attr.quotedArray === "function") {
      return attr.quotedArray(this.values);
    }
    return this.values.map((v) => buildQuoted(v, this.attribute));
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

  // Mirrors Arel::Nodes::HomogeneousIn#ivars — protected helper Rails
  // uses to fold this node's identity into hash/eql? comparisons.
  // Trails' `eql()` / `hash()` from Node already walk every own
  // property so this isn't called internally; kept for Rails-fidelity
  // / api:compare privates coverage.
  protected ivars(): [Node, unknown[], HomogeneousIn["type"]] {
    return [this.attribute, this.values, this.type];
  }
}
