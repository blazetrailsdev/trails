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

/** Mirrors: `class StringInquirer < String` (string_inquirer.rb:21). */
export class StringInquirer extends String {
  constructor(value: string) {
    super(value);
    return new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        // `super` — a String method resolves before `method_missing` does.
        if (Reflect.has(target, prop)) {
          const value = Reflect.get(target, prop, receiver);
          // A String.prototype method demands a String receiver and the Proxy
          // is not one, so those bind to the target; anything a subclass
          // defines keeps `this` as the Proxy, where its own state lives.
          return typeof value === "function" &&
            value === (String.prototype as unknown as Record<string | symbol, unknown>)[prop]
            ? value.bind(target)
            : value;
        }
        if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
        // `self == method_name[0..-2]` when the name ends in `?`.
        if (prop.endsWith("?")) {
          const methodName = prop;
          return () => target.valueOf() === methodName.slice(0, -1);
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
        if (typeof prop === "string" && prop.endsWith("?")) return true;
        return Reflect.has(target, prop);
      },
    });
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
