import { Temporal } from "@blazetrails/date";
import { TimeWithZone } from "@blazetrails/activesupport";
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class Value {
  constructor(private readonly obj: Temporal.Instant | TimeWithZone) {}

  getobj(): Temporal.Instant | TimeWithZone {
    return this.obj;
  }
}

export class Time extends ActiveModelTime {
  static Value = Value;

  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }

  override get isUtc(): boolean {
    return isUtc(this._timezone);
  }

  override serialize(value: unknown): Value | null {
    const serialized: unknown = super.serialize(value);
    return serialized instanceof Temporal.Instant || serialized instanceof TimeWithZone
      ? new Value(serialized)
      : (serialized as Value | null);
  }

  override serializeCastValue(value: Temporal.Instant | null): Value | null {
    const serialized: unknown = super.serializeCastValue(value);
    return value != null ? new Value(serialized as Temporal.Instant | TimeWithZone) : null;
  }

  protected override castValue(value: unknown): Temporal.Instant | null {
    const cast: unknown = super.castValue(value);
    return cast instanceof Value
      ? (cast.getobj() as Temporal.Instant)
      : (cast as Temporal.Instant | null);
  }
}
