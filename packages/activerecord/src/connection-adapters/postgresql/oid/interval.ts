import { ValueType } from "@blazetrails/activemodel";
import { Duration } from "@blazetrails/activesupport";
import { rbInspect, registerConstant } from "@blazetrails/ruby-compat";

export class Interval extends ValueType<Duration> {
  override type(): string {
    return "interval";
  }

  castValue(value: unknown): Duration | null {
    if (value instanceof Duration) {
      return value;
    } else if (typeof value === "string") {
      try {
        return Duration.parse(value);
      } catch (error) {
        if (error instanceof Duration.ISO8601Parser.ParsingError) return null;
        throw error;
      }
    } else {
      return super.castValue(value);
    }
  }

  override serialize(value: unknown): unknown {
    if (value instanceof Duration) {
      return value.iso8601({ precision: this.precision });
    } else if (typeof value === "number") {
      return Duration.build(value).iso8601({ precision: this.precision });
    } else {
      return super.serialize(value);
    }
  }

  override typeCastForSchema(value: unknown): string {
    return rbInspect(this.serialize(value));
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Interval", Interval);
