/**
 * SerializeCastValue — optimization for skipping redundant casts during serialization.
 *
 * Mirrors: ActiveModel::Type::SerializeCastValue
 *
 * In Rails, when a type's serialize method just calls cast then
 * serializes, SerializeCastValue lets the system skip the cast step
 * if the value is already cast. This avoids double-casting on save.
 */

export interface SerializeCastValue {
  itselfIfSerializeCastValueCompatible(): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SerializeCastValue {
  /**
   * Mirrors: ActiveModel::Type::SerializeCastValue::ClassMethods
   *
   * Provides serialize_cast_value_compatible? which checks if a type
   * has overridden serialize_cast_value.
   */
  export interface ClassMethods {
    serializeCastValueCompatible(): boolean;
  }

  /**
   * Mirrors: ActiveModel::Type::SerializeCastValue::DefaultImplementation
   *
   * Fallback serialize_cast_value that delegates to serialize.
   */
  export interface DefaultImplementation {
    serializeCastValue(value: unknown): unknown;
  }
}

export function itselfIfSerializeCastValueCompatible(type: {
  serialize(value: unknown): unknown;
  serializeCastValue?(value: unknown): unknown;
}): typeof type | null {
  if (typeof type.serializeCastValue === "function") {
    return type;
  }
  return null;
}

export function serializeCastValueCompatible(typeCtor: {
  prototype: { serializeCastValue?(value: unknown): unknown };
}): boolean {
  return typeof typeCtor.prototype.serializeCastValue === "function";
}
