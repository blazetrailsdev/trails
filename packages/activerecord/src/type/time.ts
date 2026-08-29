import { Temporal } from "@blazetrails/date";
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

export class Value {
  constructor(private readonly obj: Temporal.Instant) {}

  getobj(): Temporal.Instant {
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
    return super.serialize(value) as Value | null;
  }

  override serializeCastValue(value: Temporal.Instant | null): Value | null {
    const serialized = super.serializeCastValue(value);
    return serialized instanceof Temporal.Instant ? new Value(serialized) : null;
  }

  protected override castValue(value: unknown): Temporal.Instant | null {
    const cast: unknown = super.castValue(value);
    return cast instanceof Value ? cast.getobj() : (cast as Temporal.Instant | null);
  }
}
