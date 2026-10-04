import { ValueType } from "./type/value.js";
import { defaultValue } from "./type.js";
import { MissingAttributeError } from "./attribute-methods.js";
import {
  hasKey,
  rbEqual,
  rbHash,
  rbModConstSet,
  rbDeclareIvar,
  rbObjDup,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { isDuplicable } from "@blazetrails/activesupport";
import { ActiveModel } from "./namespaces.js";
import type { UserProvidedDefault } from "./attribute/user-provided-default.js";
import type { Psych } from "@blazetrails/ruby-compat/psych";

export const UNINITIALIZED_ORIGINAL_VALUE: unique symbol = Symbol.for(
  "@blazetrails/activemodel/UNINITIALIZED_ORIGINAL_VALUE",
);

export abstract class Attribute {
  declare static UserProvidedDefault: typeof UserProvidedDefault;
  declare static FromDatabase: typeof FromDatabase;
  declare static FromUser: typeof FromUser;
  declare static WithCastValue: typeof WithCastValue;
  declare static Null: typeof Null;
  declare static Uninitialized: typeof Uninitialized;

  readonly name: string | null;
  protected _valueBeforeTypeCast: unknown;
  readonly type: ValueType | null;
  /** @internal */
  originalAttribute: Attribute | null;
  protected _value: unknown;
  protected _hasValue: boolean;
  declare protected __valueForDatabase: unknown;

  static fromDatabase(
    name: string | null,
    valueBeforeTypeCast: unknown,
    type: ValueType | null,
    value?: unknown,
  ): FromDatabase {
    return new FromDatabase(name, valueBeforeTypeCast, type, null, value);
  }

  static fromUser(
    name: string | null,
    valueBeforeTypeCast: unknown,
    type: ValueType | null,
    originalAttribute: Attribute | null = null,
  ): FromUser {
    return new FromUser(name, valueBeforeTypeCast, type, originalAttribute);
  }

  static withCastValue(
    name: string | null,
    valueBeforeTypeCast: unknown,
    type: ValueType | null,
  ): WithCastValue {
    return new WithCastValue(name, valueBeforeTypeCast, type);
  }

  static null(name: string | null): Null {
    return new Null(name);
  }

  static uninitialized(name: string | null, type: ValueType | null): Uninitialized {
    return new Uninitialized(name, type);
  }

  get valueBeforeTypeCast(): unknown {
    return this._valueBeforeTypeCast;
  }

  constructor(
    name: string | null,
    valueBeforeTypeCast: unknown,
    type: ValueType | null,
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
  }

  value(_?: (name: string) => unknown): unknown {
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

  /** @missingRailsName valueForDatabase — PERMANENT */
  get valueForDatabase(): unknown {
    if (
      !Object.hasOwn(this, "__valueForDatabase") ||
      this.type!.isChangedInPlace(this.__valueForDatabase, this.value())
    ) {
      this.__valueForDatabase = this._valueForDatabase();
    }
    return this.__valueForDatabase;
  }

  /** @internal */
  protected _valueForDatabase(): unknown {
    return this.type!.serialize(this.value());
  }

  isSerializable(block?: (castValue: unknown) => void): boolean {
    return this.type!.isSerializable(this.value(), block);
  }

  isChanged(): boolean {
    return this.changedFromAssignment() || this.changedInPlace();
  }

  changedInPlace(): boolean {
    return (
      this.hasBeenRead() &&
      this.type!.isChangedInPlace(this.originalValueForDatabase(), this.value())
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

  withType(type: ValueType | null): Attribute {
    if (this.changedInPlace()) {
      return this.withValueFromUser(this.value()).withType(type);
    }
    const Ctor = this.constructor as new (
      name: string | null,
      valueBeforeTypeCast: unknown,
      type: ValueType | null,
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
    return (
      this.constructor === other.constructor &&
      this.name === other.name &&
      this.valueBeforeTypeCast === other.valueBeforeTypeCast &&
      rbEqual(this.type, other.type)
    );
  }

  declare eql: Attribute["equals"];

  hash(): number {
    return rbHash([this.constructor, this.name, this.valueBeforeTypeCast, this.type]);
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

  /** @missingRailsName value — PERMANENT */
  private initializeDup(_other: Attribute): void {
    if (isDuplicable(this._value)) {
      this._value = rbObjDup(this._value);
    }
  }

  private changedFromAssignment(): boolean {
    return (
      this.isAssigned() &&
      this.type!.isChanged(this.originalValue, this.value(), this.valueBeforeTypeCast)
    );
  }

  initWith(coder: Psych.Coder): void {
    const self = this as { -readonly [K in "name" | "type"]: Attribute[K] };
    self.name = (coder["name"] ?? null) as string | null;
    this._valueBeforeTypeCast = coder["value_before_type_cast"] ?? null;
    self.type = (coder["type"] ?? null) as ValueType | null;
    this.originalAttribute = (coder["original_attribute"] ?? null) as Attribute | null;
    this._hasValue = hasKey(coder, "value");
    if (this._hasValue) this._value = coder["value"];
  }

  encodeWith(coder: Psych.Coder): void {
    coder["name"] = this.name;
    if (this.valueBeforeTypeCast != null) {
      coder["value_before_type_cast"] = this.valueBeforeTypeCast;
    }
    if (this.type) coder["type"] = this.type;
    if (this.originalAttribute) coder["original_attribute"] = this.originalAttribute;
    if (this._hasValue) coder["value"] = this.value();
  }

  withUserDefault(value: unknown): Attribute {
    return new Attribute.UserProvidedDefault(
      this.name,
      value,
      this.type,
      this instanceof FromDatabase ? this : this.originalAttribute,
    );
  }

  dup(): Attribute {
    return rbObjDup(this);
  }
}

rbDeclareIvar(Attribute, "@value_for_database", "__valueForDatabase");

export class FromDatabase extends Attribute {
  typeCast(value: unknown): unknown {
    return this.type!.deserialize(value);
  }

  override forgettingAssignment(): Attribute {
    if (!Object.hasOwn(this, "__valueForDatabase") && !this.changedInPlace()) {
      return this.withValueFromDatabase(this.valueBeforeTypeCast);
    } else {
      return super.forgettingAssignment();
    }
  }

  /** @internal */
  protected override _originalValueForDatabase(): unknown {
    return this.valueBeforeTypeCast;
  }
}

export class FromUser extends Attribute {
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
      return this.type!.serializeCastValue(this.value());
    }
    return this.type!.serialize(this.value());
  }
}

export class WithCastValue extends Attribute {
  typeCast(value: unknown): unknown {
    return value;
  }

  changedInPlace(): boolean {
    return false;
  }
}

export class Null extends Attribute {
  constructor(name: string | null) {
    super(name, null, defaultValue());
  }

  typeCast(): unknown {
    return null;
  }

  override withType(type: ValueType | null): Attribute {
    return Attribute.withCastValue(this.name, null, type);
  }

  withValueFromDatabase(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name ?? ""}\``);
  }

  withValueFromUser(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name ?? ""}\``);
  }

  withCastValue(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name ?? ""}\``);
  }
}

export class Uninitialized extends Attribute {
  constructor(name: string | null, type: ValueType | null) {
    super(name, null, type);
  }

  override value(block?: (name: string) => unknown): unknown {
    if (block !== undefined) {
      return block(this.name!);
    }
    return null;
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

  override withType(type: ValueType | null): Attribute {
    return new Uninitialized(this.name, type);
  }

  typeCast(): unknown {
    return undefined;
  }
}

Attribute.prototype.eql = Attribute.prototype.equals;

rbModConstSet(ActiveModel, "Attribute", Attribute);
rbModConstSet(Attribute, "FromDatabase", FromDatabase);
rbModConstSet(Attribute, "FromUser", FromUser);
rbModConstSet(Attribute, "WithCastValue", WithCastValue);
rbModConstSet(Attribute, "Null", Null);
rbModConstSet(Attribute, "Uninitialized", Uninitialized);

registerConstant("ActiveModel::Attribute", Attribute);
registerConstant("ActiveModel::Attribute::FromDatabase", FromDatabase);
registerConstant("ActiveModel::Attribute::FromUser", FromUser);
registerConstant("ActiveModel::Attribute::WithCastValue", WithCastValue);
registerConstant("ActiveModel::Attribute::Null", Null);
registerConstant("ActiveModel::Attribute::Uninitialized", Uninitialized);
