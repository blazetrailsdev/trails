import { Time } from "@blazetrails/date";
import { isPlainObject } from "@blazetrails/activesupport";
import { Type } from "../value.js";
import { isUtc } from "./timezone.js";

/**
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime
 * (accepts_multiparameter_time.rb).
 *
 * Ruby builds the module with `defaults:` and closes `define_method` over it;
 * TS has no anonymous-module `include`, so the same state is a constructor
 * argument and the wrapped type is the receiver `super` would have reached.
 */
export class AcceptsMultiparameterTime {
  readonly type: Type;
  /** @internal `AcceptsMultiparameterTime#initialize`'s `defaults:` kwarg. */
  readonly defaults: Record<string, number>;

  constructor(type: Type, defaults: Record<string, number> = {}) {
    this.type = type;
    this.defaults = defaults;
  }

  /** Mirrors: InstanceMethods#serialize (accepts_multiparameter_time.rb:9-11). */
  serialize(value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  }

  /** Mirrors: InstanceMethods#serialize_cast_value (accepts_multiparameter_time.rb:13-15). */
  serializeCastValue(value: unknown): unknown {
    return value;
  }

  /** Mirrors: InstanceMethods#cast (accepts_multiparameter_time.rb:17-23). */
  cast(value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return this.type.cast(value);
    }
  }

  /** Mirrors: InstanceMethods#assert_valid_value (accepts_multiparameter_time.rb:25-31). */
  assertValidValue(value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return this.type.assertValidValue(value);
    }
  }

  /**
   * Mirrors: InstanceMethods#value_constructed_by_mass_assignment?
   * (accepts_multiparameter_time.rb:33-35).
   */
  isValueConstructedByMassAssignment(value: unknown): boolean {
    return isPlainObject(value);
  }

  /**
   * Mirrors: the `define_method(:value_from_multiparameter_assignment)`
   * `AcceptsMultiparameterTime#initialize` installs
   * (accepts_multiparameter_time.rb:38-46).
   *
   *   defaults.each do |k, v|
   *     values_hash[k] ||= v
   *   end
   *   return unless values_hash[1] && values_hash[2] && values_hash[3]
   *   values = values_hash.sort.map!(&:last)
   *   ::Time.public_send(default_timezone, *values)
   *
   * `||=` and the `1`/`2`/`3` guard are Ruby truthiness, so only `nil`/`false`
   * count as absent — an empty string is a present value and reaches `::Time`,
   * which raises for it. ActiveRecord never arrives with one:
   * `extract_callstack_for_multiparameter_attributes` maps `value.empty?` to
   * `nil` first (activerecord/attribute_assignment.rb:157).
   *
   * `sort` orders the Integer keys Ruby holds; a JS object spells them as
   * strings, whose own order puts `"10"` ahead of `"2"`, so the comparison is
   * numeric. `default_timezone` is `Helpers::Timezone#is_utc?`'s choice of
   * receiver, `Time.utc` or `Time.local` (timezone.rb:9-11).
   *
   * @internal Rails-private helper.
   */
  valueFromMultiparameterAssignment(valuesHash: Record<string, unknown>): Time | null {
    for (const [k, v] of Object.entries(this.defaults)) {
      if (valuesHash[k] == null || valuesHash[k] === false) valuesHash[k] = v;
    }
    if (!truthy(valuesHash["1"]) || !truthy(valuesHash["2"]) || !truthy(valuesHash["3"])) {
      return null;
    }
    const values = Object.entries(valuesHash)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v as number | string);
    return isUtc()
      ? Time.utc(...(values as [number, number, number]))
      : Time.local(...(values as [number, number, number]));
  }
}

/** Ruby truthiness: only `nil` and `false` are falsy (CLAUDE.md). */
function truthy(value: unknown): boolean {
  return value != null && value !== false;
}

/**
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods
 */
export interface InstanceMethods {
  serialize(value: unknown): unknown;
  serializeCastValue(value: unknown): unknown;
  cast(value: unknown): unknown;
  assertValidValue(value: unknown): unknown;
  isValueConstructedByMassAssignment(value: unknown): boolean;
}
