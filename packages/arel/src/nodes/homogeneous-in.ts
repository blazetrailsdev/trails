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

  // Mirrors Arel::Nodes::HomogeneousIn#hash / #eql? / #== (homogeneous_in.rb:13-21).
  // `super` there is `Object#eql?` — identity — since Node defines none.
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

  // Mirrors Arel::Nodes::HomogeneousIn#casted_values (homogeneous_in.rb:39-47):
  //   type = attribute.type_caster
  //   values.map { |raw| type.serialize(raw) if type.serializable?(raw) }.compact
  // The `isSerializable` guard drops out-of-range / non-serializable values
  // (e.g. a bignum id past the column's range) before they can reach a bind,
  // and `compact` drops any that serialize to null — so `id IN [1, 2**63]`
  // collapses to `IN (1)` and `id IN [2**63]` to an empty list (`1=0`).
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
    // Rails: -> value { ActiveModel::Attribute.with_cast_value(
    //   attribute.name, value, ActiveModel::Type.default_value) }
    return (value: unknown) =>
      AMAttribute.withCastValue(
        (this.attribute as unknown as { name?: string }).name ?? "",
        value,
        defaultValue(),
      );
  }

  fetchAttribute(block: (attr: Node) => unknown): unknown {
    if (this.attribute) return block(this.attribute);
    return undefined;
  }

  // Mirrors Arel::Nodes::HomogeneousIn#ivars — protected helper Rails
  // uses to fold this node's identity into hash/eql? comparisons.
  // `hash` / `eql?` above both fold through it, as Rails does.
  protected ivars(): [Node, unknown[], HomogeneousIn["type"]] {
    return [this.attribute, this.values, this.type];
  }
}
