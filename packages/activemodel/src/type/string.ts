import { ImmutableStringType } from "./immutable-string.js";

export class StringType extends ImmutableStringType {
  readonly name: string = "string";

  /** @internal Rails-private helper. */
  protected castValue(value: unknown): string | null {
    // Rails type/string.rb subclasses immutable_string.rb, so the
    // boolean `true -> "t"` / `false -> "f"` mapping lives in the
    // superclass. Freezing is a no-op on primitive strings, so there's
    // no behavior lost by delegating the bool branch.
    if (typeof value === "boolean") return super.castValue(value);
    return String(value);
  }

  // Return type stays `unknown` so subclass overrides (e.g. PG OID's
  // Xml which wraps the cast result in a Data node) can widen the
  // output type the way Rails' loosely-typed `serialize` does.
  serialize(value: unknown): unknown {
    return this.cast(value);
  }

  isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    if (rawOldValue === null || rawOldValue === undefined)
      return newValue !== null && newValue !== undefined;
    return String(rawOldValue) !== String(newValue);
  }

  toImmutableString(): ImmutableStringType {
    return new ImmutableStringType({
      precision: this.precision,
      scale: this.scale,
      limit: this.limit,
    });
  }
}
