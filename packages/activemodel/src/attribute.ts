import { Type } from "./type/value.js";
import { defaultValue } from "./type.js";
import { MissingAttributeError } from "./attribute-methods.js";
import { isDuplicable } from "@blazetrails/activesupport";
import { _UserProvidedDefaultCtor } from "./attribute/user-provided-default-slot.js";

function dupValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice();
  if (value instanceof Map) return new Map(value);
  if (value instanceof Set) return new Set(value);
  if (typeof value === "object" && value !== null) {
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto === Object.prototype || proto === null) return { ...value };
  }
  return value;
}

export const UNINITIALIZED_ORIGINAL_VALUE: unique symbol = Symbol.for(
  "@blazetrails/activemodel/UNINITIALIZED_ORIGINAL_VALUE",
);

const rubyNamespace: unique symbol = Symbol.for("@blazetrails:rubyNamespace");

export abstract class Attribute {
  /** @noRailsEquivalent PERMANENT */
  static readonly [rubyNamespace]: string = "ActiveModel";

  readonly name: string;
  protected _valueBeforeTypeCast: unknown;
  readonly type: Type | null;
  /** @internal */
  originalAttribute: Attribute | null;
  private _value: unknown;
  private _hasValue: boolean;
  private _cachedValueForDatabase: unknown;
  private _hasValueForDatabase: boolean;

  static fromDatabase(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type | null,
    value?: unknown,
  ): FromDatabase {
    return new FromDatabase(name, valueBeforeTypeCast, type, null, value);
  }

  static fromUser(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type | null,
    originalAttribute: Attribute | null = null,
  ): FromUser {
    return new FromUser(name, valueBeforeTypeCast, type, originalAttribute);
  }

  static withCastValue(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type | null,
  ): WithCastValue {
    return new WithCastValue(name, valueBeforeTypeCast, type);
  }

  static null(name: string): Null {
    return new Null(name);
  }

  static uninitialized(name: string, type: Type | null): Uninitialized {
    return new Uninitialized(name, type);
  }

  get valueBeforeTypeCast(): unknown {
    return this._valueBeforeTypeCast;
  }

  constructor(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type | null,
    originalAttribute: Attribute | null = null,
    value?: unknown,
  ) {
    this.name = name;
    this._valueBeforeTypeCast = valueBeforeTypeCast;
    this.type = type;
    this.originalAttribute = originalAttribute;

    if (value != null) {
      this._value = value;
      this._hasValue = true;
    } else {
      this._value = undefined;
      this._hasValue = false;
    }
    this._cachedValueForDatabase = undefined;
    this._hasValueForDatabase = false;
  }

  get value(): unknown {
    if (!this._hasValue) {
      this._value = this.typeCast(this.valueBeforeTypeCast);
      this._hasValue = true;
    }
    return this._value;
  }

  get originalValue(): unknown {
    if (this.isAssigned()) {
      return this.originalAttribute!.originalValue;
    }
    return this.typeCast(this.valueBeforeTypeCast);
  }

  /** @missingRailsArgs changed_in_place? — PERMANENT */
  get valueForDatabase(): unknown {
    if (
      !this._hasValueForDatabase ||
      this.type!.isChangedInPlace(this._cachedValueForDatabase, this.value)
    ) {
      this._cachedValueForDatabase = this._valueForDatabase();
      this._hasValueForDatabase = true;
    }
    return this._cachedValueForDatabase;
  }

  /** @internal */
  protected _valueForDatabase(): unknown {
    return this.type!.serialize(this.value);
  }

  isSerializable(block?: (castValue: unknown) => void): boolean {
    return this.type!.isSerializable(this.value, block);
  }

  isChanged(): boolean {
    return this.changedFromAssignment() || this.changedInPlace();
  }

  changedInPlace(): boolean {
    return (
      this.hasBeenRead() && this.type!.isChangedInPlace(this.originalValueForDatabase(), this.value)
    );
  }

  forgettingAssignment(): Attribute {
    return this.withValueFromDatabase(this.valueForDatabase);
  }

  withValueFromUser(value: unknown): Attribute {
    this.type!.assertValidValue(value);
    return Attribute.fromUser(this.name, value, this.type, this.originalAttribute ?? this);
  }

  withValueFromDatabase(value: unknown): Attribute {
    return Attribute.fromDatabase(this.name, value, this.type);
  }

  withCastValue(value: unknown): Attribute {
    return (this.constructor as typeof Attribute).withCastValue(this.name, value, this.type);
  }

  withType(type: Type | null): Attribute {
    if (this.changedInPlace()) {
      return this.withValueFromUser(this.value).withType(type);
    }
    const Ctor = this.constructor as new (
      name: string,
      valueBeforeTypeCast: unknown,
      type: Type | null,
      originalAttribute: Attribute | null,
    ) => Attribute;
    return new Ctor(this.name, this.valueBeforeTypeCast, type, this.originalAttribute);
  }

  abstract typeCast(value: unknown): unknown;

  isInitialized(): boolean {
    return true;
  }

  cameFromUser(): boolean {
    return false;
  }

  hasBeenRead(): boolean {
    return this._hasValue;
  }

  equals(other: Attribute): boolean {
    const typeEqual =
      this.type === other.type || this.type!.constructor === other.type!.constructor;
    return (
      this.constructor === other.constructor &&
      this.name === other.name &&
      this.valueBeforeTypeCast === other.valueBeforeTypeCast &&
      typeEqual
    );
  }

  originalValueForDatabase(): unknown {
    if (this.originalAttribute !== null) {
      return this.originalAttribute.originalValueForDatabase();
    }
    return this._originalValueForDatabase();
  }

  /** @internal */
  protected _originalValueForDatabase(): unknown {
    return this.type!.serialize(this.originalValue);
  }

  private isAssigned(): boolean {
    return this.originalAttribute !== null;
  }

  private changedFromAssignment(): boolean {
    if (!this.isAssigned()) return false;
    return this.type!.isChanged(this.originalValue, this.value, this.valueBeforeTypeCast);
  }

  deepDup(): Attribute {
    return this.dup();
  }

  private initializeDup(_other: Attribute): void {
    if (isDuplicable(this._value)) {
      this._value = dupValue(this._value);
    }
  }

  withUserDefault(value: unknown): Attribute {
    return new _UserProvidedDefaultCtor!(
      this.name,
      value,
      this.type,
      this instanceof FromDatabase ? this : this.originalAttribute,
    );
  }

  dup(): Attribute {
    const dup = Object.assign(Object.create(Object.getPrototypeOf(this) as object), this) as this;
    dup.initializeDup(this);
    return dup;
  }
}

export class FromDatabase extends Attribute {
  /** @noRailsEquivalent PERMANENT */
  static readonly [rubyNamespace]: string = "ActiveModel::Attribute";
  typeCast(value: unknown): unknown {
    return this.type!.deserialize(value);
  }

  override forgettingAssignment(): Attribute {
    if (!this.changedInPlace()) return this;
    return super.forgettingAssignment();
  }

  /** @internal */
  protected override _originalValueForDatabase(): unknown {
    return this.valueBeforeTypeCast;
  }
}

export class FromUser extends Attribute {
  /** @noRailsEquivalent PERMANENT */
  static readonly [rubyNamespace]: string = "ActiveModel::Attribute";
  typeCast(value: unknown): unknown {
    return this.type!.cast(value);
  }

  cameFromUser(): boolean {
    return !this.type!.isValueConstructedByMassAssignment(this.valueBeforeTypeCast);
  }

  /** @internal */
  protected override _valueForDatabase(): unknown {
    const compatible = this.type!.itselfIfSerializeCastValueCompatible();
    if (compatible === this.type) {
      return this.type!.serializeCastValue(this.value);
    }
    return this.type!.serialize(this.value);
  }
}

export class WithCastValue extends Attribute {
  /** @noRailsEquivalent PERMANENT */
  static readonly [rubyNamespace]: string = "ActiveModel::Attribute";
  typeCast(value: unknown): unknown {
    return value;
  }

  changedInPlace(): boolean {
    return false;
  }
}

export class Null extends Attribute {
  /** @noRailsEquivalent PERMANENT */
  static readonly [rubyNamespace]: string = "ActiveModel::Attribute";
  constructor(name: string) {
    super(name, null, defaultValue());
  }

  typeCast(): unknown {
    return null;
  }

  override withType(type: Type | null): Attribute {
    return Attribute.withCastValue(this.name, null, type);
  }

  withValueFromDatabase(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name ?? ""}\``);
  }

  withValueFromUser(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name ?? ""}\``);
  }
}

export class Uninitialized extends Attribute {
  /** @noRailsEquivalent PERMANENT */
  static readonly [rubyNamespace]: string = "ActiveModel::Attribute";
  constructor(name: string, type: Type | null) {
    super(name, null, type);
  }

  get value(): unknown {
    return undefined;
  }

  override get originalValue(): unknown {
    return UNINITIALIZED_ORIGINAL_VALUE;
  }

  get valueForDatabase(): unknown {
    return undefined;
  }

  isInitialized(): boolean {
    return false;
  }

  forgettingAssignment(): Attribute {
    return new Uninitialized(this.name, this.type);
  }

  override withType(type: Type | null): Attribute {
    return new Uninitialized(this.name, type);
  }

  typeCast(): unknown {
    return undefined;
  }
}
