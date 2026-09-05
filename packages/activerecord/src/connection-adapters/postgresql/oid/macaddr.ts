import { StringType } from "@blazetrails/activemodel";

export class Macaddr extends StringType {
  override type(): string {
    return "macaddr";
  }

  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    if (oldValue?.constructor !== newValue?.constructor) return true;
    if (typeof oldValue === "string" && typeof newValue === "string") {
      return oldValue.toLowerCase() !== newValue.toLowerCase();
    }
    return oldValue !== newValue;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    if (rawOldValue?.constructor !== newValue?.constructor) return true;
    if (typeof rawOldValue === "string" && typeof newValue === "string") {
      return rawOldValue.toLowerCase() !== newValue.toLowerCase();
    }
    return rawOldValue !== newValue;
  }
}
