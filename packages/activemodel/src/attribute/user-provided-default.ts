import { Attribute, FromUser } from "../attribute.js";
import { Type } from "../type/value.js";

/**
 * Attribute with a user-provided default value, which may be a function.
 * When the value is a function, it's evaluated eagerly at construction time.
 *
 * Mirrors: ActiveModel::Attribute::UserProvidedDefault
 */
export class UserProvidedDefault extends FromUser {
  /** The original default value (may be a function), preserved for withType/marshal. */
  readonly userProvidedValue: unknown;

  constructor(name: string, value: unknown, type: Type, databaseDefault: Attribute | null = null) {
    const resolvedValue = typeof value === "function" ? value() : value;
    super(name, resolvedValue, type, databaseDefault);
    this.userProvidedValue = value;
  }

  marshalDump(): [string, unknown, Type, Attribute | null] {
    return [this.name, this.userProvidedValue, this.type, this.getOriginalAttribute()];
  }

  static marshalLoad(data: [string, unknown, Type, Attribute | null]): UserProvidedDefault {
    return new UserProvidedDefault(data[0], data[1], data[2], data[3]);
  }
}
