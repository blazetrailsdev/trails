import { Type, ValueType } from "@blazetrails/activemodel";
import { enumTypeOf } from "../enum.js";

/**
 * Casts attribute values for database operations using the model's
 * attribute type registry (attribute API).
 *
 * Mirrors: ActiveRecord::TypeCaster::Map
 */
export class Map {
  private _klass: any;

  constructor(klass: any) {
    this._klass = klass;
  }

  typeCastForDatabase(attrName: string, value: unknown): unknown {
    // Rails' `model.type_caster` (TypeCaster::Map → `klass.type_for_attribute`)
    // is EnumType-aware: an enum attribute serializes the label → its stored
    // database value. Resolve the enum through `enumTypeOf` (the replayed
    // AttributeSet) rather than the local `_attributeDefinitions` O(1) cache:
    // that cache keeps the pre-reflection EnumType, whose subtype was inferred
    // from the mapping shape, whereas the AttributeSet carries the EnumType
    // built from the reflected column type. `whereValuesHash` / `scopeForCreate`
    // round-trip the label through the same reflected type.
    const enumType = enumTypeOf(this._klass, attrName);
    if (enumType) return enumType.serialize(value);
    const type = this.typeForAttribute(attrName);
    return type.serialize(value);
  }

  typeForAttribute(name: string): Type {
    // The resolved type already carries every decoration (NormalizedValueType,
    // Serialized, EncryptedAttributeType): `_baseTypeForAttribute` delegates to
    // `klass.typeForAttribute`, which resolves through the decorated default
    // attribute set, so no query-side re-wrap is needed.
    return this._baseTypeForAttribute(name);
  }

  private _baseTypeForAttribute(name: string): Type {
    const klass = this._klass;

    // Rails' `TypeCaster::Map#type_for_attribute` is a one-line delegation to
    // `klass.type_for_attribute(name)` (type_caster/map.rb:15-16). Delegating gets
    // alias resolution, the enum `assertEnumTypeDeclared` guard, and the decorated
    // default attribute set (`attribute_types`) for free — so pending decorators
    // (serialize/normalizes/encrypts) are honored on the query side without a
    // per-feature post-reflection replay onto `_attributeDefinitions`. `ValueType`
    // is the fallback for non-model `klass` shapes lacking `typeForAttribute`.
    if (typeof klass.typeForAttribute === "function") {
      return klass.typeForAttribute(name) as Type;
    }

    return new ValueType();
  }

  /** @internal */
  get klass(): any {
    return this._klass;
  }
}
