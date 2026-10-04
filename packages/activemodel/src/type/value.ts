import {
  type Included,
  include,
  initializeIncludedModules,
  rbDeclareIvar,
  rbInspect as inspect,
  rbEqual,
  rbHash,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { NoMethodError } from "../attribute-assignment.js";
import { SerializeCastValue } from "./serialize-cast-value.js";

export interface ValueType<T = unknown> extends Included<typeof SerializeCastValue> {
  serializeCastValue(value: T | null): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ValueType<T = unknown> {
  declare static serializeCastValueCompatible: () => boolean;

  private _precision: number | null;
  private _scale: number | null;
  private __limit: number | null;

  get precision(): number | null {
    return this._precision;
  }

  get scale(): number | null {
    return this._scale;
  }

  get limit(): number | null {
    return this.__limit;
  }

  constructor({
    precision = null,
    limit = null,
    scale = null,
  }: {
    precision?: number | null;
    limit?: number | null;
    scale?: number | null;
  } = {}) {
    initializeIncludedModules(this);
    this._precision = precision;
    this._scale = scale;
    this.__limit = limit;
  }

  isSerializable(value: unknown, _block?: (castValue: unknown) => void): boolean {
    return true;
  }

  type(): string | undefined {
    return undefined;
  }

  deserialize(value: unknown): T | null {
    return this.cast(value);
  }

  cast(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    return this.castValue(value);
  }

  serialize(value: unknown): unknown {
    return value;
  }

  typeCastForSchema(value: unknown): unknown {
    return inspect(value);
  }

  isBinary(): boolean {
    return false;
  }

  isChanged(oldValue: unknown, newValue: unknown, _newValueBeforeTypeCast?: unknown): boolean {
    return !rbEqual(oldValue, newValue);
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

  map(value: T | null, _block: (value: unknown) => unknown): T | null {
    return value;
  }

  equals(other: ValueType): boolean {
    return (
      this.constructor === other.constructor &&
      this.precision === other.precision &&
      this.scale === other.scale &&
      this.limit === other.limit
    );
  }

  eql(other: ValueType): boolean {
    return this.equals(other);
  }

  hash(): number {
    return rbHash([this.constructor, this.precision, this.scale, this.limit]);
  }

  assertValidValue(_: unknown): void {}

  isSerialized(): boolean {
    return false;
  }

  isMutable(): boolean {
    return false;
  }

  asJson(): never {
    throw new NoMethodError("Unimplemented");
  }

  /** @internal */
  protected castValue(value: unknown): T | null {
    return value as T | null;
  }
}

include(ValueType, SerializeCastValue);

rbDeclareIvar(ValueType, "@precision", "_precision");
rbDeclareIvar(ValueType, "@scale", "_scale");
rbDeclareIvar(ValueType, "@limit", "__limit");

registerConstant("ActiveModel::Type::Value", ValueType);
