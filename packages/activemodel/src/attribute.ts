import { Type } from "./type/value.js";
import { defaultValue } from "./type.js";
import { MissingAttributeError } from "./attribute-methods.js";
import { RuntimeError } from "./attribute-assignment.js";
import { isDuplicable } from "@blazetrails/activesupport";

/**
 * Ruby `Object#dup` on the memoized cast value — the shallow copy
 * `@value = @value.dup` makes in `Attribute#initialize_dup`
 * (attribute.rb:155-157). Not exported: Ruby gets `dup` from Object, so it is
 * not part of Attribute's surface.
 *
 * Only Ruby's mutable built-ins need a copy here; the scalars are already
 * immutable in JS. The generic-object arm is restricted to a plain object
 * because a built-in carrying internal slots (Temporal) throws on a slot-less
 * clone, and every such value in a cast attribute is immutable anyway, so
 * Ruby's `dup` of it is unobservable.
 */
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

/**
 * Symbol so identity comparisons work across module copies and can't collide with any user value.
 *
 * Mirrors activemodel/lib/active_model/attribute.rb:243, where this sentinel is `Object.new`; a JS Symbol keeps that identity across module copies.
 */
export const UNINITIALIZED_ORIGINAL_VALUE: unique symbol = Symbol.for(
  "@blazetrails/activemodel/UNINITIALIZED_ORIGINAL_VALUE",
);

// Lazy reference to avoid circular import: attribute.ts ↔ user-provided-default.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _UserProvidedDefaultCtor: (new (...args: any[]) => Attribute) | null = null;

/** Called by user-provided-default.ts to register itself after loading. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function _registerUserProvidedDefault(ctor: new (...args: any[]) => Attribute): void {
  _UserProvidedDefaultCtor = ctor;
}

/**
 * Wraps a single attribute value with its type, tracking the original
 * value before type cast and memoizing the cast result.
 *
 * Mirrors: ActiveModel::Attribute
 */
export abstract class Attribute {
  readonly name: string;
  protected _valueBeforeTypeCast: unknown;
  readonly type: Type;
  protected originalAttribute: Attribute | null;
  private _value: unknown;
  private _hasValue: boolean;
  private _cachedValueForDatabase: unknown;
  private _hasValueForDatabase: boolean;

  static fromDatabase(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type,
    value?: unknown,
  ): FromDatabase {
    if (arguments.length >= 4) {
      return new FromDatabase(name, valueBeforeTypeCast, type, null, value);
    }
    return new FromDatabase(name, valueBeforeTypeCast, type, null);
  }

  static fromUser(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type,
    originalAttribute: Attribute | null = null,
  ): FromUser {
    return new FromUser(name, valueBeforeTypeCast, type, originalAttribute);
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

  get valueBeforeTypeCast(): unknown {
    return this._valueBeforeTypeCast;
  }

  constructor(
    name: string,
    valueBeforeTypeCast: unknown,
    type: Type,
    originalAttribute: Attribute | null = null,
    value?: unknown,
  ) {
    this.name = name;
    this._valueBeforeTypeCast = valueBeforeTypeCast;
    this.type = type;
    this.originalAttribute = originalAttribute;

    if (arguments.length >= 5) {
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
    // Re-type-cast from the raw value (mirrors Rails FromDatabase#original_value →
    // type_cast(value_before_type_cast)).  Uses this.typeCast() so that
    // FromDatabase attrs call type.deserialize (not type.cast), matching Rails.
    // For mutable types (Serialized, Array) the cached this.value may have been
    // mutated in-place; re-casting from valueBeforeTypeCast returns the clean
    // original.  For non-mutable types the result equals this.value.
    return this.typeCast(this.valueBeforeTypeCast);
  }

  /**
   * @missingRailsArgs changed_in_place? — PERMANENT: Rails passes the ivar
   *   `@value_for_database` (attribute.rb:56), whose trails spelling is
   *   `_valueForDatabase` — already taken by the port of the `_value_for_database`
   *   method (attribute.rb:207). A TS class cannot carry a field and a method of
   *   the same name, so the memo field keeps the `_cached` prefix.
   */
  get valueForDatabase(): unknown {
    if (
      !this._hasValueForDatabase ||
      this.type.isChangedInPlace(this._cachedValueForDatabase, this.value)
    ) {
      this._cachedValueForDatabase = this._valueForDatabase();
      this._hasValueForDatabase = true;
    }
    return this._cachedValueForDatabase;
  }

  /** @internal */
  protected _valueForDatabase(): unknown {
    return this.type.serialize(this.value);
  }

  isSerializable(block?: (castValue: unknown) => void): boolean {
    return this.type.isSerializable(this.value, block);
  }

  isChanged(): boolean {
    return this.changedFromAssignment() || this.changedInPlace();
  }

  changedInPlace(): boolean {
    return (
      this.hasBeenRead() && this.type.isChangedInPlace(this.originalValueForDatabase(), this.value)
    );
  }

  forgettingAssignment(): Attribute {
    return this.withValueFromDatabase(this.valueForDatabase);
  }

  withValueFromUser(value: unknown): Attribute {
    this.type.assertValidValue(value);
    return Attribute.fromUser(this.name, value, this.type, this.originalAttribute ?? this);
  }

  withValueFromDatabase(value: unknown): Attribute {
    return Attribute.fromDatabase(this.name, value, this.type);
  }

  withCastValue(value: unknown): Attribute {
    return new WithCastValue(this.name, value, this.type);
  }

  withType(type: Type): Attribute {
    if (this.changedInPlace()) {
      return this.withValueFromUser(this.value).withType(type);
    }
    const Ctor = this.constructor as new (
      name: string,
      valueBeforeTypeCast: unknown,
      type: Type,
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
    const typeEqual = this.type === other.type || this.type.constructor === other.type.constructor;
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
    return this.type.serialize(this.originalValue);
  }

  private isAssigned(): boolean {
    return this.originalAttribute !== null;
  }

  private changedFromAssignment(): boolean {
    if (!this.isAssigned()) return false;
    return this.type.isChanged(this.originalValue, this.value, this.valueBeforeTypeCast);
  }

  /**
   * `Object#deep_dup` for an Attribute — `duplicable? ? dup : self`
   * (activesupport/lib/active_support/core_ext/object/deep_dup.rb:16), which is
   * what `attributes.transform_values(&:deep_dup)` reaches
   * (attribute_set.rb:72-74). Ruby's `dup` shallow-copies every ivar and then
   * runs {@link initializeDup}, so `@original_attribute` is carried into the
   * copy by reference.
   */
  deepDup(): Attribute {
    const dup = Object.assign(Object.create(Object.getPrototypeOf(this) as object), this) as this;
    dup.initializeDup(this);
    return dup;
  }

  /**
   * Mirrors: `def initialize_dup(other)` (attribute.rb:155-157). The guard
   * reads the memo field rather than the `value` getter, because Ruby's
   * `@value&.duplicable?` reads the ivar — nil until something forces the cast.
   */
  private initializeDup(_other: Attribute): void {
    if (isDuplicable(this._value)) {
      this._value = dupValue(this._value);
    }
  }

  /**
   * Force-set the memoized cast value without replacing the Attribute or
   * losing valueBeforeTypeCast. Used for post-cast transformations like
   * normalization.
   */
  overrideCastValue(value: unknown): void {
    this._value = value;
    this._hasValue = true;
    this._cachedValueForDatabase = undefined;
    this._hasValueForDatabase = false;
  }

  withUserDefault(value: unknown): Attribute {
    if (!_UserProvidedDefaultCtor) {
      throw new RuntimeError(
        "UserProvidedDefault not loaded. Import '@blazetrails/activemodel' " +
          "or './attribute/user-provided-default.js' before calling withUserDefault().",
      );
    }
    return new _UserProvidedDefaultCtor(
      this.name,
      value,
      this.type,
      this instanceof FromDatabase ? this : this.originalAttribute,
    );
  }

  /**
   * Ruby `Object#dup` for one Attribute — the call `LazyAttributeHash#deep_dup`
   * and `#assign_default_value` make (`builder.rb:120`, `builder.rb:175`). A
   * shallow copy that keeps the prototype and shares the `original_attribute`
   * graph, exactly as Ruby's `dup` does. `initialize_dup` (attribute.rb:155-159)
   * additionally re-dups a duplicable `@value`; this copy does not, so two
   * Attributes off one `dup()` share a mutable cast value (a `Date`, an array)
   * where Ruby would have separated them. That gap predates this method — both
   * spellings it replaces had it — and is tracked by the RFC 0115 story
   * `attribute-dup-must-redup-mutable-value`.
   */
  dup(): Attribute {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object), this) as Attribute;
  }

  /** Access the original attribute for cloning. */
  getOriginalAttribute(): Attribute | null {
    return this.originalAttribute;
  }

  /** Set the original attribute (used by deepDup). */
  setOriginalAttribute(attr: Attribute | null): void {
    this.originalAttribute = attr;
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
  typeCast(value: unknown): unknown {
    return this.type.deserialize(value);
  }

  override forgettingAssignment(): Attribute {
    // Rails condition: `!defined?(@value_for_database) && !changed_in_place?`
    // → fast-path creates a new FromDatabase using the existing value_before_type_cast.
    // We simplify: if nothing changed in place, `this` is already a correct baseline
    // (valueBeforeTypeCast is the serialized DB value), so return self.
    // If changed in place, delegate to base which serializes the current value into
    // a new FromDatabase, resetting the baseline to the post-mutation state.
    if (!this.changedInPlace()) return this;
    return super.forgettingAssignment();
  }

  /** @internal */
  protected override _originalValueForDatabase(): unknown {
    return this.valueBeforeTypeCast;
  }
}

export class FromUser extends Attribute {
  typeCast(value: unknown): unknown {
    return this.type.cast(value);
  }

  cameFromUser(): boolean {
    return !this.type.isValueConstructedByMassAssignment(this.valueBeforeTypeCast);
  }

  /** @internal */
  protected override _valueForDatabase(): unknown {
    const compatible = this.type.itselfIfSerializeCastValueCompatible();
    if (compatible === this.type) {
      return this.type.serializeCastValue(this.value);
    }
    return this.type.serialize(this.value);
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
  constructor(name: string) {
    super(name, null, defaultValue());
  }

  typeCast(): unknown {
    return null;
  }

  override withType(type: Type): Attribute {
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
  constructor(name: string, type: Type) {
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

  override withType(type: Type): Attribute {
    return new Uninitialized(this.name, type);
  }

  typeCast(): unknown {
    return undefined;
  }
}
