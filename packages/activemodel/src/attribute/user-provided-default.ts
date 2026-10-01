import { registerConstant } from "@blazetrails/activesupport";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Attribute, FromUser } from "../attribute.js";
import { ValueType } from "../type/value.js";

export class UserProvidedDefault extends FromUser {
  /** @internal */
  readonly userProvidedValue: unknown;
  private _memoizedVBTC: unknown;
  private _hasMemoizedVBTC: boolean = false;

  constructor(
    name: string | null,
    value: unknown,
    type: ValueType | null,
    databaseDefault: Attribute | null = null,
  ) {
    super(name, undefined, type, databaseDefault);
    this.userProvidedValue = value;
  }

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

  override withType(type: ValueType | null): Attribute {
    return new UserProvidedDefault(this.name, this.userProvidedValue, type, this.originalAttribute);
  }

  marshalDump(): unknown[] {
    const result = [this.name, this.valueBeforeTypeCast, this.type, this.originalAttribute];
    if (this._hasValue) result.push(this.value());
    return result;
  }

  static marshalLoad(
    values:
      | [string | null, unknown, ValueType | null, Attribute | null]
      | [string | null, unknown, ValueType | null, Attribute | null, unknown],
  ): UserProvidedDefault {
    const [name, userProvidedValue, type, originalAttribute, value] = values;
    const attribute = new UserProvidedDefault(name, userProvidedValue, type, originalAttribute);
    if (values.length === 5) {
      attribute._value = value;
      attribute._hasValue = true;
    }
    return attribute;
  }
}

rbSetClassPathString(UserProvidedDefault, Attribute, "UserProvidedDefault");
Attribute.UserProvidedDefault = UserProvidedDefault;
registerConstant("ActiveModel::Attribute::UserProvidedDefault", UserProvidedDefault);
