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
    // The resolved type already carries any NormalizedValueType decoration:
    // `normalizes` decorates the attribute's cast type in `_attributeDefinitions`
    // (single read+write decoration path), so no query-side re-wrap is needed.
    return this._baseTypeForAttribute(name);
  }

  private _baseTypeForAttribute(name: string): Type {
    const klass = this._klass;

    // Resolve through the decorated default attribute set (`attribute_types`),
    // mirroring Rails `type_for_attribute` (attribute_registration.rb:43-50): it
    // replays every pending decorator (serialize/normalizes/encrypts) onto the
    // reflected column type, so query-side decorations are honored without a
    // per-feature post-reflection replay onto `_attributeDefinitions`.
    const resolved = klass._attributeAliases?.[name] ?? name;
    const attributeTypes =
      typeof klass.attributeTypes === "function" ? klass.attributeTypes() : klass.attributeTypes;
    if (attributeTypes) {
      const type =
        attributeTypes instanceof globalThis.Map
          ? attributeTypes.get(resolved)
          : attributeTypes[resolved];
      if (type) return type as Type;
    }

    return new ValueType();
  }

  /** @internal */
  get klass(): any {
    return this._klass;
  }
}
