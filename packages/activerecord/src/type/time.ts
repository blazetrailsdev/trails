/**
 * Mirrors: ActiveRecord::Type::Time
 *
 * Wraps the ActiveModel time type with ActiveRecord timezone configuration.
 * Values are cast by ActiveModel; this type adds timezone-aware behavior
 * through the `timezone` option and `isUtc` accessor.
 */
import { Temporal } from "@blazetrails/date";
import { TimeType as ActiveModelTime } from "@blazetrails/activemodel";
import { isUtc, type TimezoneOptions } from "./internal/timezone.js";

/**
 * Mirrors: ActiveRecord::Type::Time::Value (time.rb:8) — `DelegateClass(::Time)`.
 *
 * The wrapper `serialize` puts around a cast time so the quoting layer can tell
 * a time-of-day bind from a datetime one: `quote` and `type_cast` match
 * `Type::Time::Value` ahead of `Date, Time` and route it through `quoted_time`,
 * which strips the 2000-01-01 dummy date back off
 * (abstract/quoting.rb:84, 103, 201-204).
 *
 * A `DelegateClass` forwards every other message to the wrapped `::Time`; TS has
 * no `method_missing`, so the wrapped `Temporal.Instant` is read back through
 * `__getobj__`, which is the only message `Type::Time` itself sends it.
 */
export class Value {
  constructor(private readonly obj: Temporal.Instant) {}

  /** Ruby `Delegator#__getobj__`, the wrapped `::Time` (time.rb:29). */
  getobj(): Temporal.Instant {
    return this.obj;
  }
}

export class Time extends ActiveModelTime {
  /** Mirrors: ActiveRecord::Type::Time::Value (time.rb:8). */
  static Value = Value;

  private _timezone?: "utc" | "local";

  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }

  override get isUtc(): boolean {
    return isUtc(this._timezone);
  }

  /**
   * Mirrors: ActiveRecord::Type::Time#serialize (time.rb:11-16).
   *
   *   def serialize(value)
   *     case value = super
   *     when ::Time
   *       Value.new(value)
   *     else
   *       value
   *     end
   *   end
   */
  override serialize(value: unknown): Value | null {
    // Rails' `super` is `ActiveModel::Type::Value#serialize`, the identity, so
    // the `Value.new` is this method's own. Trails' base `serialize` is
    // `serializeCastValue(cast(value))`, which already routes through the
    // wrapping override below — wrapping again here would double it.
    return super.serialize(value) as Value | null;
  }

  /** Mirrors: ActiveRecord::Type::Time#serialize_cast_value (time.rb:18-20). */
  override serializeCastValue(value: Temporal.Instant | null): Value | null {
    const serialized = super.serializeCastValue(value);
    return serialized instanceof Temporal.Instant ? new Value(serialized) : null;
  }

  /**
   * Mirrors: ActiveRecord::Type::Time#cast_value (time.rb:23-30).
   *
   *   def cast_value(value)
   *     case value = super
   *     when Value
   *       value.__getobj__
   *     else
   *       value
   *     end
   *   end
   */
  protected override castValue(value: unknown): Temporal.Instant | null {
    const cast: unknown = super.castValue(value);
    return cast instanceof Value ? cast.getobj() : (cast as Temporal.Instant | null);
  }
}
