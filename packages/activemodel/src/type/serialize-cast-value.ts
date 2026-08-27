export interface SerializeCastValue {
  itselfIfSerializeCastValueCompatible(): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SerializeCastValue {
  export interface ClassMethods {
    serializeCastValueCompatible(): boolean;
  }

  export interface DefaultImplementation {
    serializeCastValue(value: unknown): unknown;
  }

  export function serializeCastValue(value: unknown): unknown {
    return value;
  }

  export function serialize(
    type: {
      serializeCastValue(value: unknown): unknown;
      serialize(value: unknown): unknown;
    } & CompatibleType<unknown>,
    value: unknown,
  ): unknown {
    return itselfIfSerializeCastValueCompatible(type) === type
      ? type.serializeCastValue(value)
      : type.serialize(value);
  }
}

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
