import { ValueType } from "@blazetrails/activemodel";
import { Duration } from "@blazetrails/activesupport";

export class Interval extends ValueType<Duration> {
  readonly name: string = "interval";

  constructor(options?: { precision?: number }) {
    super(options);
  }

  override type(): string {
    return "interval";
  }

  cast(value: unknown): Duration | null {
    return this.castValue(value);
  }

  castValue(value: unknown): Duration | null {
    if (value == null) return null;
    if (value instanceof Duration) return value;
    if (typeof value === "string") {
      try {
        return Duration.parse(value);
      } catch {
        return null;
      }
    }
    if (typeof value === "number") {
      return Duration.build(value);
    }
    return null;
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Duration) {
      return value.iso8601({ precision: this.precision ?? null });
    }
    if (typeof value === "number") {
      return Duration.build(value).iso8601({ precision: this.precision ?? null });
    }
    if (typeof value === "string") return value;
    return null;
  }

  override typeCastForSchema(value: unknown): string {
    const serialized = this.serialize(value);
    if (serialized == null) return "nil";
    return `"${serialized.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
}
