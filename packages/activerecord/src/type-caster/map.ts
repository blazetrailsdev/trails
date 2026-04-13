import { Type, ValueType } from "@blazetrails/activemodel";

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
      return klass.typeForAttribute(name) ?? new ValueType();
    }

    return new ValueType();
  }
}
