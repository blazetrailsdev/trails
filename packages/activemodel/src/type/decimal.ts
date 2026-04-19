import { ValueType } from "./value.js";

export class DecimalType extends ValueType<string> {
  readonly name: string = "decimal";

  // JS has no BigDecimal, so we represent decimals as strings to avoid
  // losing precision through IEEE-754 floats. Rails' `cast_value`:
  //   - Numeric  -> BigDecimal(value)
  //   - String   -> value.to_d  (returns BigDecimal(0) on invalid)
  //   - nil      -> nil
  // We mirror the same shape, returning the string form rather than a
  // BigDecimal wrapper.
  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      // `String(0.1)` -> "0.1" — as precise as JS can represent the
      // input. Callers who need full precision should pass a string.
      return String(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      // Rails' `String#to_d` parses a leading numeric prefix and
      // silently drops everything after, returning `BigDecimal(0)` if
      // no leading number is present. Tests assert, e.g.,
      // `"1ignore" -> BigDecimal("1")`, `"bad" -> BigDecimal("0")`.
      const match = trimmed.match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
      return match ? match[0] : "0";
    }
    return null;
  }

  type(): string {
    return this.name;
  }

  typeCastForSchema(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
  }
}
