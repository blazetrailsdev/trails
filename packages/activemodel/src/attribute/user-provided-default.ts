import { Attribute, FromUser, _registerUserProvidedDefault } from "../attribute.js";
import { Type } from "../type/value.js";

export class UserProvidedDefault extends FromUser {
  /** @internal */
  readonly userProvidedValue: unknown;
  private _memoizedVBTC: unknown;
  private _hasMemoizedVBTC: boolean = false;

  constructor(name: string, value: unknown, type: Type, databaseDefault: Attribute | null = null) {
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

  override withType(type: Type): Attribute {
    return new UserProvidedDefault(this.name, this.userProvidedValue, type, this.originalAttribute);
  }

  marshalDump(): [string, unknown, Type, Attribute | null] {
    return [this.name, this.valueBeforeTypeCast, this.type, this.originalAttribute];
  }

  static marshalLoad(data: [string, unknown, Type, Attribute | null]): UserProvidedDefault {
    return new UserProvidedDefault(data[0], data[1], data[2], data[3]);
  }
}

_registerUserProvidedDefault(UserProvidedDefault);
