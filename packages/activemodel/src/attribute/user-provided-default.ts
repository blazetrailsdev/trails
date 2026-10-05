import { rbModConstSet, registerConstant, rtest } from "@blazetrails/ruby-compat";
import { Attribute, FromUser } from "../attribute.js";
import { ValueType } from "../type/value.js";

export class UserProvidedDefault extends FromUser {
  /** @internal */
  readonly userProvidedValue: unknown;
  private memoizedValueBeforeTypeCast: unknown;

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
      return rtest(this.memoizedValueBeforeTypeCast)
        ? this.memoizedValueBeforeTypeCast
        : (this.memoizedValueBeforeTypeCast = this.userProvidedValue());
    } else {
      return this.userProvidedValue;
    }
  }

  override withType(type: ValueType | null): Attribute {
    return new UserProvidedDefault(this.name, this.userProvidedValue, type, this.originalAttribute);
  }

  marshalDump(): unknown[] {
    const result = [this.name, this.valueBeforeTypeCast, this.type, this.originalAttribute];
    if (this._hasValue) result.push(this.value());
    return result;
  }

  marshalLoad(
    values:
      | [string | null, unknown, ValueType | null, Attribute | null]
      | [string | null, unknown, ValueType | null, Attribute | null, unknown],
  ): void {
    const [name, userProvidedValue, type, originalAttribute, value] = values;
    const self = this as {
      name: string | null;
      userProvidedValue: unknown;
      type: ValueType | null;
    };
    self.name = name;
    self.userProvidedValue = userProvidedValue;
    self.type = type;
    this.originalAttribute = originalAttribute;
    if (values.length === 5) {
      this._value = value;
      this._hasValue = true;
    }
  }
}

rbModConstSet(Attribute, "UserProvidedDefault", UserProvidedDefault);
registerConstant("ActiveModel::Attribute::UserProvidedDefault", UserProvidedDefault);
