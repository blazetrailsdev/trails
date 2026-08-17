/**
 * ActiveSupport::StringInquirer
 *
 * A string that makes equality checks more expressive via method-like access.
 * In Rails: env = ActiveSupport::StringInquirer.new("production")
 *           env.production? # => true
 *           env.development? # => false
 *
 * Ruby resolves those through `method_missing` / `respond_to_missing?`
 * (string_inquirer.rb:22-32). TS has no such hook, so the class returns a
 * `Proxy` whose `has` trap is `respond_to_missing?` and whose `get` trap is
 * `method_missing` — the shape `methodMissingProxy` establishes, and for the
 * same reason. The Ruby method name keeps its question mark, so callers write
 * `env["production?"]()`.
 */

import { NameError } from "./core-ext/name-error.js";

/** Ruby's `NoMethodError`, raised by `method_missing`'s `else super` arm. */
class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export class StringInquirer {
  private readonly _value: string;

  constructor(value: string) {
    this._value = value;
    return new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        if (typeof prop === "symbol" || Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        // `class StringInquirer < String` (string_inquirer.rb:21): a String
        // method resolves before `method_missing` does. TS cannot subclass the
        // String primitive, so the superclass is the wrapped string itself.
        const stringSelf = Object(target._value) as Record<string, unknown>;
        if (prop in stringSelf) {
          const value = stringSelf[prop];
          return typeof value === "function" ? value.bind(target._value) : value;
        }
        // `self == method_name[0..-2]` when the name ends in `?`.
        if (prop.endsWith("?")) {
          const methodName = prop;
          return () => target._value === methodName.slice(0, -1);
        }
        // `else super`. A `get` trap cannot raise — `"foo" in x` and
        // `typeof x.foo` both route through it — so the raise moves to the
        // call, which is where Ruby's `method_missing` raises.
        return () => {
          throw new NoMethodError(
            `undefined method '${prop}' for an instance of ${target.constructor.name}`,
          );
        };
      },
      // `respond_to_missing?`: `method_name.end_with?("?") || super`.
      has(target, prop) {
        if (typeof prop === "string" && (prop.endsWith("?") || prop in Object(target._value))) {
          return true;
        }
        return Reflect.has(target, prop);
      },
    });
  }

  toString(): string {
    return this._value;
  }
  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activesupport/lib/active_support/string_inquirer.rb:21` — `class
   *   StringInquirer < String`, so Ruby coerces through String itself).
   * JS primitive-coercion protocol — Ruby coerces through to_s/to_i instead
   */
  valueOf(): string {
    return this._value;
  }
}

/**
 * `String#inquiry` (core_ext/string/inquiry.rb:11-13). Ruby reopens String, so
 * the receiver is `self`; TS spells that with the `this`-typed mixin idiom
 * (CLAUDE.md, _Module mixins_) and callers write `inquiry.call(str)`.
 */
export function inquiry(this: string): StringInquirer & Record<string, () => boolean> {
  return new StringInquirer(this) as any;
}
