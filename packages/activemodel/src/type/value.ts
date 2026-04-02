export abstract class Type<T = unknown> {
  abstract readonly name: string;
  readonly precision?: number;
  readonly scale?: number;
  readonly limit?: number;

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    if (options?.precision !== undefined) this.precision = options.precision;
    if (options?.scale !== undefined) this.scale = options.scale;
    if (options?.limit !== undefined) this.limit = options.limit;
  }

  abstract cast(value: unknown): T | null;

  type(): string {
    return this.name;
  }

  deserialize(value: unknown): T | null {
    return this.cast(value);
  }

  serialize(value: unknown): unknown {
    return value;
  }

  serializeCastValue(value: T | null): unknown {
    return value;
  }

  isSerializable(_value: unknown): boolean {
    return true;
  }

  typeCastForSchema(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
  }

  isBinary(): boolean {
    return false;
  }

  isChanged(oldValue: unknown, newValue: unknown, _newValueBeforeTypeCast?: unknown): boolean {
    return oldValue !== newValue;
  }

  isChangedInPlace(_rawOldValue: unknown, _newValue: unknown): boolean {
    return false;
  }

  isValueConstructedByMassAssignment(_value: unknown): boolean {
    return false;
  }

  isForceEquality(_value: unknown): boolean {
    return false;
  }

  map(value: T | null): T | null {
    return value;
  }

  assertValidValue(_value: unknown): void {}

  isSerialized(): boolean {
    return false;
  }

  isMutable(): boolean {
    return false;
  }

  asJson(): never {
    throw new Error("Unimplemented");
  }
}

export class ValueType extends Type<unknown> {
  readonly name = "value";

  cast(value: unknown): unknown {
    return value;
  }

  equals(other: Type): boolean {
    return this.constructor === other.constructor;
  }
}
