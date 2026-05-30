import { Type, ValueType } from "@blazetrails/activemodel";
import { getEnumDefinitions } from "../enum.js";

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
    // Rails splits type casting across two casters: `model.type_caster`
    // (TypeCaster::Map → `klass.type_for_attribute`, EnumType-aware, used by
    // `in_order_of`) and the predicate builder's `TypeCaster::Connection`
    // (raw schema column type, enum-unaware). We share one Map class across
    // both because our `arelTable` predicate builder relies on Map to serialize
    // e.g. EncryptedAttributeType. Enums aren't decorated onto
    // `_attributeDefinitions` (our enum stores the raw subtype in memory and
    // presents labels via accessors), so to reproduce Rails' Map/Connection
    // behavioral split we resolve EnumType only on the serialize path here —
    // mapping keys → integers for the database form, mirroring
    // `type_caster.type_cast_for_database`. The `typeForAttribute` cast path
    // (used by the predicate builder) stays the raw subtype, so
    // `whereValuesHash` / `scopeForCreate` round-trip the raw value our
    // accessors expect.
    const enumType = getEnumDefinitions(this._klass).get(attrName)?.type;
    if (enumType) return enumType.serialize(value);
    const type = this.typeForAttribute(attrName);
    return type.serialize(value);
  }

  typeForAttribute(name: string): Type {
    const klass = this._klass;

    // Prefer O(1) lookup via _attributeDefinitions (avoids building full attributeTypes object)
    const attributeDefinitions = klass._attributeDefinitions;
    if (attributeDefinitions) {
      const definition =
        attributeDefinitions instanceof globalThis.Map
          ? attributeDefinitions.get(name)
          : attributeDefinitions?.[name];
      if (definition) {
        const type =
          typeof definition === "object" && definition !== null && "type" in definition
            ? (definition as any).type
            : definition;
        if (type) return type as Type;
      }
    }

    // Fallback to attributeTypes (builds full object, O(n))
    const attributeTypes =
      typeof klass.attributeTypes === "function" ? klass.attributeTypes() : klass.attributeTypes;
    if (attributeTypes) {
      const type =
        attributeTypes instanceof globalThis.Map ? attributeTypes.get(name) : attributeTypes[name];
      if (type) return type as Type;
    }

    // Instance-level lookup fallback
    if (typeof klass.typeForAttribute === "function") {
      return klass.typeForAttribute(name);
    }

    return new ValueType();
  }

  /** @internal */
  get klass(): any {
    return this._klass;
  }
}
