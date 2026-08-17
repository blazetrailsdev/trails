/**
 * ActiveSupport::ArrayInquirer
 *
 * An array that makes membership checks more expressive via method-like access.
 * In Rails: variants = ActiveSupport::ArrayInquirer.new([:phone, :tablet])
 *           variants.phone?  # => true
 *           variants.desktop? # => false
 *           variants.any?(:phone, :tablet) # => true
 *
 * Ruby resolves the predicates through `method_missing` / `respond_to_missing?`
 * (array_inquirer.rb:36-46). TS has no such hook, so the class returns a `Proxy`
 * whose `has` trap is `respond_to_missing?` and whose `get` trap is
 * `method_missing` — the shape `methodMissingProxy` establishes. The Ruby method
 * name keeps its question mark, so callers write `variants["phone?"]()`.
 */

import { NameError } from "./core-ext/name-error.js";

/** Ruby's `NoMethodError`, raised by `method_missing`'s `else super` arm. */
class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export class ArrayInquirer<T extends string | symbol> extends Array<T> {
  constructor(...items: T[]) {
    super(...items);
    return new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        if (typeof prop === "symbol" || Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }
        // `any?(name[0..-2])` when the name ends in `?`.
        if (prop.endsWith("?")) {
          const methodName = prop;
          return () => target.any(methodName.slice(0, -1));
        }
        // `else super` — see StringInquirer for why the raise is at the call.
        return () => {
          throw new NoMethodError(
            `undefined method '${prop}' for an instance of ${target.constructor.name}`,
          );
        };
      },
      // `respond_to_missing?`: `name.end_with?("?") || super`.
      has(target, prop) {
        return (typeof prop === "string" && prop.endsWith("?")) || Reflect.has(target, prop);
      },
    });
  }

  /**
   * Mirrors: ActiveSupport::ArrayInquirer#any? (array_inquirer.rb:27-35).
   *
   * A trails `candidate` is always a string — a Ruby Symbol is a JS string — so
   * the `to_sym`/`to_s` pair collapses to one `include?`. Ruby's block arrives
   * as a trailing function argument, which is what leaves `candidates` empty and
   * takes the `super` arm (`Enumerable#any?`) just as `any? { … }` does.
   */
  any(...candidates: (string | ((element: T) => boolean))[]): boolean {
    const block = typeof candidates[0] === "function" ? candidates[0] : undefined;
    if (block !== undefined) candidates = [];

    if (candidates.length === 0) {
      // `super` — `Enumerable#any?`, which is "matches the block" with one and
      // "not empty" without.
      const elements = this as unknown as T[];
      return block !== undefined ? elements.some(block) : elements.length > 0;
    }
    return (candidates as string[]).some((candidate) =>
      (this as unknown as T[]).includes(candidate as T),
    );
  }
}

/**
 * `Array#inquiry` (core_ext/array/inquiry.rb:15-17). Ruby reopens Array, so the
 * receiver is `self`; TS spells that with the `this`-typed mixin idiom
 * (CLAUDE.md, _Module mixins_) and callers write `inquiry.call(arr)`. The package
 * index re-exports it as `arrayInquiry`, since `String#inquiry` already holds
 * the bare name there.
 */
export function inquiry<T extends string | symbol>(
  this: T[],
): ArrayInquirer<T> & Record<string, () => boolean> {
  return new ArrayInquirer<T>(...this) as any;
}
