import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { MissingAttributeError } from "./attribute-methods.js";

/**
 * Wraps a single attribute value with its type, tracking the original
 * value before type cast and memoizing the cast result.
 *
 * Mirrors: ActiveModel::Attribute
 */
export abstract class Attribute {
  readonly name: string;
  readonly valueBeforeTypeCast: unknown;
  readonly type: Type;
  private originalAttribute: Attribute | null;
  private _value: unknown;
  private _hasValue: boolean;
  private _valueForDatabase: unknown;
  private _hasValueForDatabase: boolean;

  constructor(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type,
    originalAttribute: Attribute | null = null,
    value?: unknown,
  ) {
    this.name = name;
    this.valueBeforeTypeCast = valueBeforeTypeCast;
    this.type = type;
    this.originalAttribute = originalAttribute;

    if (arguments.length >= 5) {
      this._value = value;
      this._hasValue = true;
    } else {
      this._value = undefined;
      this._hasValue = false;
    }
    this._valueForDatabase = undefined;
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
    return this.value;
  }

  get valueForDatabase(): unknown {
    if (!this._hasValueForDatabase) {
      this._valueForDatabase = this.type.serialize(this.value);
      this._hasValueForDatabase = true;
    }
    return this._valueForDatabase;
  }

  isChanged(): boolean {
    return this.changedFromAssignment() || this.changedInPlace();
  }

  changedInPlace(): boolean {
    return false;
  }

  withValueFromUser(value: unknown): Attribute {
    return Attribute.fromUser(this.name, value, this.type, this.originalAttribute ?? this);
  }

  withValueFromDatabase(value: unknown): Attribute {
    return Attribute.fromDatabase(this.name, value, this.type);
  }

  withCastValue(value: unknown): Attribute {
    return new WithCastValue(this.name, value, this.type);
  }

  withType(type: Type): Attribute {
    return Attribute.withCastValue(this.name, this.value, type);
  }

  isInitialized(): boolean {
    return true;
  }

  cameFromUser(): boolean {
    return false;
  }

  hasBeenRead(): boolean {
    return this._hasValue;
  }

  forgettingAssignment(): Attribute {
    return this.withValueFromDatabase(this.valueForDatabase);
  }

  /**
   * Force-set the memoized cast value without replacing the Attribute or
   * losing valueBeforeTypeCast. Used for post-cast transformations like
   * normalization and nullifyBlanks.
   */
  overrideCastValue(value: unknown): void {
    this._value = value;
    this._hasValue = true;
    this._valueForDatabase = undefined;
    this._hasValueForDatabase = false;
  }

  equals(other: Attribute): boolean {
    const typeEqual = this.type === other.type || this.type.constructor === other.type.constructor;
    return (
      this.constructor === other.constructor &&
      this.name === other.name &&
      this.valueBeforeTypeCast === other.valueBeforeTypeCast &&
      typeEqual
    );
  }

  protected abstract typeCast(value: unknown): unknown;

  /** Access the original attribute for cloning. */
  getOriginalAttribute(): Attribute | null {
    return this.originalAttribute;
  }

  /** Set the original attribute (used by deepDup). */
  setOriginalAttribute(attr: Attribute | null): void {
    this.originalAttribute = attr;
  }

  private isAssigned(): boolean {
    return this.originalAttribute !== null;
  }

  private changedFromAssignment(): boolean {
    if (!this.isAssigned()) return false;
    const current = this.value;
    const original = this.originalValue;
    if (current === original) return false;
    if (
      typeof current === "number" &&
      typeof original === "number" &&
      isNaN(current) &&
      isNaN(original)
    )
      return false;
    return true;
  }

  // --- Factory methods ---

  static fromDatabase(name: string, value: unknown, type: Type, castValue?: unknown): FromDatabase {
    if (arguments.length >= 4) {
      return new FromDatabase(name, value, type, null, castValue);
    }
    return new FromDatabase(name, value, type, null);
  }

  static fromUser(
    name: string,
    value: unknown,
    type: Type,
    originalAttribute: Attribute | null = null,
  ): FromUser {
    return new FromUser(name, value, type, originalAttribute);
  }

  static withCastValue(name: string, value: unknown, type: Type): WithCastValue {
    return new WithCastValue(name, value, type);
  }

  static null(name: string): Null {
    return new Null(name);
  }

  static uninitialized(name: string, type: Type): Uninitialized {
    return new Uninitialized(name, type);
  }

  /**
   * Create an attribute where we already have both the raw and cast values.
   * Used in the Model constructor after applying normalization/nullify.
   */
  static fromUserWithValue(
    name: string,
    rawValue: unknown,
    castValue: unknown,
    type: Type,
  ): FromUser {
    return new FromUser(name, rawValue, type, null, castValue);
  }
}

export class FromDatabase extends Attribute {
  protected typeCast(value: unknown): unknown {
    return this.type.deserialize(value);
  }
}

export class FromUser extends Attribute {
  protected typeCast(value: unknown): unknown {
    return this.type.cast(value);
  }

  cameFromUser(): boolean {
    return true;
  }
}

export class WithCastValue extends Attribute {
  protected typeCast(value: unknown): unknown {
    return value;
  }

  changedInPlace(): boolean {
    return false;
  }
}

export class Null extends Attribute {
  constructor(name: string) {
    super(name, null, typeRegistry.lookup("value"));
  }

  protected typeCast(): unknown {
    return null;
  }

  withValueFromDatabase(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name}\``);
  }

  withValueFromUser(_value: unknown): Attribute {
    throw new MissingAttributeError(`can't write unknown attribute \`${this.name}\``);
  }
}

export class Uninitialized extends Attribute {
  constructor(name: string, type: Type) {
    super(name, null, type);
  }

  get value(): unknown {
    return undefined;
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

  protected typeCast(): unknown {
    return undefined;
  }
}
