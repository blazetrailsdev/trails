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
    // If value is a function (proc), evaluate it for the initial valueBeforeTypeCast
    const resolvedValue = typeof value === "function" ? value() : value;
    super(name, resolvedValue, type, databaseDefault);
    this.userProvidedValue = value;
  }
}
