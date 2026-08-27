import { ImmutableStringType } from "./immutable-string.js";

export class StringType extends ImmutableStringType {
  readonly name: string = "string";

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

  /** @internal */
  protected castValue(value: unknown): string | null {
    if (typeof value === "boolean") return super.castValue(value);
    return String(value);
  }
}
