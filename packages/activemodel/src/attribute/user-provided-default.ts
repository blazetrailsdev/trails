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

  marshalDump(): [string | null, unknown, ValueType | null, Attribute | null] {
    return [this.name, this.valueBeforeTypeCast, this.type, this.originalAttribute];
  }

  static marshalLoad(
    values: [string | null, unknown, ValueType | null, Attribute | null],
  ): UserProvidedDefault {
    return new UserProvidedDefault(values[0], values[1], values[2], values[3]);
  }
}

Attribute.UserProvidedDefault = UserProvidedDefault;
