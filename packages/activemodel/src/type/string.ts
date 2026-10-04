import {
  rbEqual,
  rbObjAsString as toS,
  rbStrSNew,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ImmutableStringType } from "./immutable-string.js";

export class StringType extends ImmutableStringType {
  isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean | undefined {
    if (typeof newValue === "string") {
      return !rbEqual(rawOldValue, newValue);
    }
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

  /** @internal */
  protected castValue(value: unknown): string | null {
    if (typeof value === "string") return rbStrSNew(value);
    else if (value === true) return this.true;
    else if (value === false) return this.false;
    else return toS(value);
  }
}

registerConstant("ActiveModel::Type::String", StringType);
