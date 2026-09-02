import { Attribute, FromUser } from "../attribute.js";
import { _setUserProvidedDefaultCtor } from "./user-provided-default-slot.js";
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

  static marshalLoad(values: [string, unknown, Type, Attribute | null]): UserProvidedDefault {
    return new UserProvidedDefault(values[0], values[1], values[2], values[3]);
  }
}

_setUserProvidedDefaultCtor(UserProvidedDefault);
