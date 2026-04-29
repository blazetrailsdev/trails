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

  export interface DefaultImplementation {
    serializeCastValue(value: unknown): unknown;
  }

  export function serializeCastValue(value: unknown): unknown {
    return value;
  }
}

/**
 * Standalone equivalents of `Type#itselfIfSerializeCastValueCompatible`
 * and `Type.serializeCastValueCompatible`. Both delegate to the
 * Rails-faithful ancestor-depth check on `Type` so a single source of
 * truth governs compatibility — see `type/value.ts`. Direct method/
 * static access on a `Type` instance is preferred; these wrappers
 * exist for callers that hold a structurally-typed reference rather
 * than a `Type` subclass.
 */
type CompatibleType<T> = {
  itselfIfSerializeCastValueCompatible?: () => T | null;
};

type CompatibleCtor = {
  serializeCastValueCompatible?: () => boolean;
};

export function itselfIfSerializeCastValueCompatible<T>(type: CompatibleType<T>): T | null {
  return typeof type.itselfIfSerializeCastValueCompatible === "function"
    ? type.itselfIfSerializeCastValueCompatible()
    : null;
}

export function serializeCastValueCompatible(typeCtor: CompatibleCtor): boolean {
  return typeof typeCtor.serializeCastValueCompatible === "function"
    ? typeCtor.serializeCastValueCompatible()
    : false;
}
