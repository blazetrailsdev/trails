import { registerConstant } from "@blazetrails/ruby-compat";
import { ImmutableStringType } from "./immutable-string.js";

export class StringType extends ImmutableStringType {
  isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    if (typeof newValue !== "string") return false;
    if (rawOldValue === null || rawOldValue === undefined) return true;
    return rawOldValue !== newValue;
  }

  toImmutableString(): ImmutableStringType {
    return new ImmutableStringType({
      true: this.true,
      false: this.false,
      limit: this.limit,
      precision: this.precision,
      scale: this.scale,
    });
  }

  /**
   * @internal
   * @missingRailsCall new — PERMANENT
   */
  protected castValue(value: unknown): string | null {
    if (typeof value === "string") return String(value);
    else if (value === true) return this.true;
    else if (value === false) return this.false;
    else return String(value);
  }
}

registerConstant("ActiveModel::Type::String", StringType);
