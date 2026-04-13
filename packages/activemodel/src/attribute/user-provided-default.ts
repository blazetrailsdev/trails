import { Attribute, FromUser, _registerUserProvidedDefault } from "../attribute.js";
import { Type } from "../type/value.js";

/**
 * Attribute with a user-provided default value, which may be a function (Proc).
 *
 * Mirrors: ActiveModel::Attribute::UserProvidedDefault
 *
 * Rails stores the raw Proc in @user_provided_value and lazily evaluates it
 * via value_before_type_cast. The class-level _default_attributes cache holds
 * unevaluated UserProvidedDefault instances; each deep_dup creates a fresh
 * copy that re-evaluates the Proc, giving each model instance its own default.
 *
 * We pass a sentinel to the super constructor so valueBeforeTypeCast is never
 * read from the base class — all access goes through our override.
 */
export class UserProvidedDefault extends FromUser {
  readonly userProvidedValue: unknown;
  private _memoizedVBTC: unknown;
  private _hasMemoizedVBTC: boolean = false;

  constructor(name: string, value: unknown, type: Type, databaseDefault: Attribute | null = null) {
    // Pass undefined to super — we override valueBeforeTypeCast below
    super(name, undefined, type, databaseDefault);
    this.userProvidedValue = value;
  }

  /**
   * Lazily evaluate function defaults, memoize scalar defaults.
   * Matches Rails: value_before_type_cast calls @user_provided_value.call
   * for Procs and memoizes the result.
   */
  override get valueBeforeTypeCast(): unknown {
    if (typeof this.userProvidedValue === "function") {
      if (!this._hasMemoizedVBTC) {
        this._memoizedVBTC = this.userProvidedValue();
        this._hasMemoizedVBTC = true;
      }
      return this._memoizedVBTC;
    }
    return this.userProvidedValue;
  }

  /**
   * Create a fresh instance from the original function/value so function
   * defaults re-evaluate — called by AttributeSet.deepDup.
   */
  dupForDeepClone(): UserProvidedDefault {
    // Functions re-evaluate on each construction. Non-function objects need
    // cloning to prevent cross-instance mutation (JS has no Ruby-style dup
    // that copies value semantics for built-in types).
    const val = this.userProvidedValue;
    const clonedVal =
      typeof val === "function" || val === null || typeof val !== "object"
        ? val
        : structuredClone(val);
    return new UserProvidedDefault(this.name, clonedVal, this.type, this.getOriginalAttribute());
  }

  marshalDump(): [string, unknown, Type, Attribute | null] {
    return [this.name, this.valueBeforeTypeCast, this.type, this.getOriginalAttribute()];
  }

  static marshalLoad(data: [string, unknown, Type, Attribute | null]): UserProvidedDefault {
    return new UserProvidedDefault(data[0], data[1], data[2], data[3]);
  }
}

// Register with Attribute to resolve circular dependency for withUserDefault
_registerUserProvidedDefault(UserProvidedDefault);
