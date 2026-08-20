import { Time } from "@blazetrails/date";
import { Module, isPlainObject } from "@blazetrails/activesupport";
import { isUtc } from "./timezone.js";

/**
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods
 * (accepts_multiparameter_time.rb:7-35), as the instance-side type a class
 * mixing the module in merges via `Included<>`.
 */
export interface InstanceMethods<T = unknown> {
  serialize(value: unknown): unknown;
  serializeCastValue(value: T | null): unknown;
  cast(value: unknown): T | null;
  assertValidValue(value: unknown): void;
  isValueConstructedByMassAssignment(value: unknown): boolean;
  /** @internal Rails-private (`private :value_from_multiparameter_assignment`). */
  valueFromMultiparameterAssignment(valuesHash: Record<string, unknown>): T | null;
}

/**
 * `super` from a module method: Ruby resolves it from the method's OWNER in the
 * receiver's ancestry, not from the receiver's class, so the owner is located
 * by identity and its own ancestor answers. (TS `super` is only available to a
 * class body, and these are module methods.)
 *
 * Ruby never holds one module twice in an ancestry — `include` skips a module
 * already there — so the owner is the LAST link carrying the method: a JS
 * prototype chain can hold the same carried function more than once, and
 * answering the first would make `super` re-enter it.
 */
function superOf(
  receiver: object,
  name: string,
  self: unknown,
): (this: unknown, ...args: unknown[]) => unknown {
  let owner: object | null = null;
  for (
    let link: object | null = Object.getPrototypeOf(receiver);
    link;
    link = Object.getPrototypeOf(link)
  ) {
    if (Object.getOwnPropertyDescriptor(link, name)?.value === self) owner = link;
  }
  return (Object.getPrototypeOf(owner!) as Record<string, (...args: unknown[]) => unknown>)[name];
}

/** The type mixing `InstanceMethods` in — Ruby's `self` inside a module method. */
type Receiver = InstanceMethods & { valueFromMultiparameterAssignment(value: unknown): unknown };

/**
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime::InstanceMethods
 * (accepts_multiparameter_time.rb:7-35).
 */
const InstanceMethods = {
  /** Mirrors: InstanceMethods#serialize (accepts_multiparameter_time.rb:9-11). */
  serialize(this: Receiver, value: unknown): unknown {
    return this.serializeCastValue(this.cast(value));
  },

  /** Mirrors: InstanceMethods#serialize_cast_value (accepts_multiparameter_time.rb:13-15). */
  serializeCastValue(this: Receiver, value: unknown): unknown {
    return value;
  },

  /** Mirrors: InstanceMethods#cast (accepts_multiparameter_time.rb:17-23). */
  cast(this: Receiver, value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return superOf(this, "cast", InstanceMethods.cast).call(this, value);
    }
  },

  /** Mirrors: InstanceMethods#assert_valid_value (accepts_multiparameter_time.rb:25-31). */
  assertValidValue(this: Receiver, value: unknown): unknown {
    if (isPlainObject(value)) {
      return this.valueFromMultiparameterAssignment(value);
    } else {
      return superOf(this, "assertValidValue", InstanceMethods.assertValidValue).call(this, value);
    }
  },

  /**
   * Mirrors: InstanceMethods#value_constructed_by_mass_assignment?
   * (accepts_multiparameter_time.rb:33-35).
   */
  isValueConstructedByMassAssignment(this: Receiver, value: unknown): boolean {
    return isPlainObject(value);
  },
};

/**
 * Mirrors: ActiveModel::Type::Helpers::AcceptsMultiparameterTime
 * (accepts_multiparameter_time.rb).
 *
 * A `Module` subclass whose `initialize` includes `InstanceMethods` and
 * `define_method`s `value_from_multiparameter_assignment` closed over the
 * `defaults:` kwarg; `include AcceptsMultiparameterTime.new(...)` in a type's
 * class body then puts all of it in that type's ancestry, so `cast` and
 * `assert_valid_value` reach the type's real `super`. trails' `Module` /
 * `include()` (`activesupport/src/include.ts`) splice the same way.
 */
export class AcceptsMultiparameterTime extends Module {
  constructor({ defaults = {} }: { defaults?: Record<string, number> } = {}) {
    super();

    this.include(InstanceMethods);

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
     */
    this.defineMethod(
      "valueFromMultiparameterAssignment",
      function (valuesHash: Record<string, unknown>): Time | null {
        for (const [k, v] of Object.entries(defaults)) {
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
      },
    );
  }
}

/** Ruby truthiness: only `nil` and `false` are falsy (CLAUDE.md). */
function truthy(value: unknown): boolean {
  return value != null && value !== false;
}
