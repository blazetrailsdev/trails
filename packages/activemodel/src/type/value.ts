export abstract class Type<T = unknown> {
  abstract readonly name: string;
  abstract cast(value: unknown): T | null;

  deserialize(value: unknown): T | null {
    return this.cast(value);
  }

  serialize(value: unknown): unknown {
    return this.cast(value);
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
