/**
 * Delegation — delegate method calls to another object.
 * Mirrors ActiveSupport::Delegation and ActiveSupport::DelegationError.
 */

import { NameError } from "./core-ext/name-error.js";
import { PROTOCOL_PROBES } from "./method-missing-proxy.js";

/**
 * Ruby's `NoMethodError`, raised when the delegator calls a method the target
 * does not answer. Rails re-raises MRI's from the generated body's
 * `rescue NoMethodError => e ... else raise` (delegation.rb:130-141).
 */
class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationError";
  }

  static nilTarget(methodName: string, target: string): DelegationError {
    return new DelegationError(`${methodName} delegated to ${target}, but ${target} is nil`);
  }
}

export interface DelegateOptions {
  to: string;
  prefix?: boolean | string;
  allowNil?: boolean;
}

export namespace Delegation {
  /**
   * Mirrors: `ActiveSupport::Delegation.generate`
   * (`activesupport/lib/active_support/delegation.rb:23-158`). Ruby builds the
   * delegator bodies as source and `module_eval`s them; TS defines them as
   * properties on `owner`, so the `location` / `signature` / `nilable` /
   * `private` / `as` keywords — all of which exist to shape that generated
   * source or its `def` visibility — have no TS counterpart and are omitted.
   *
   * The generated delegator calls a callable member and reads one that is not:
   * Ruby's `_.#{method}(...)` (`:130`) is a call either way, because a Ruby
   * attr_reader IS a method, while a trails reader is a property (CLAUDE.md,
   * "Generated attribute readers are properties"). A member the target does not
   * answer at all still raises: Rails converts the generated body's
   * `NoMethodError` to a `DelegationError` only when `_` is nil, and otherwise
   * re-raises it (`:132-140`).
   *
   * `to:` accepts only a method name. Rails also takes a `Module`, and prefixes
   * a `RESERVED_METHOD_NAMES` receiver with `self.` (`:36-58`) — neither is
   * ported; see story `0106-wide-call-set-direct-burndown/
   * port-delegation-generate-module-and-reserved-receivers`.
   */
  export function generate<T extends object>(
    owner: T,
    methods: string[],
    options: DelegateOptions,
  ): string[] {
    const { to, prefix, allowNil } = options;

    if (!to) {
      throw new Error(
        "Delegation needs a target. Supply a keyword argument 'to' (e.g. delegate :hello, to: :greeter).",
      );
    }

    if (prefix === true && /^[^a-z_]/.test(to)) {
      throw new Error(
        "Can only automatically set the delegation prefix when delegating to a method.",
      );
    }

    const methodPrefix = prefix ? `${prefix === true ? to : prefix}_` : "";

    const methodNames: string[] = [];

    for (const method of methods) {
      const methodName = `${methodPrefix}${method}`;
      methodNames.push(methodName);

      Object.defineProperty(owner, methodName, {
        configurable: true,
        enumerable: false,
        writable: true,
        value(...args: unknown[]) {
          const _ = (this as Record<string, unknown>)[to];
          if (_ == null) {
            if (allowNil) return undefined;
            throw DelegationError.nilTarget(methodName, to);
          }
          if (!(method in Object(_))) {
            throw new NoMethodError(`undefined method '${method}' for ${String(_)}`);
          }
          const member = (_ as Record<string, unknown>)[method];
          return typeof member === "function" ? member.apply(_, args) : member;
        },
      });
    }

    return methodNames;
  }

  /**
   * Mirrors: `ActiveSupport::Delegation.generate_method_missing`
   * (`delegation.rb:160-198`). Ruby defines `method_missing` and
   * `respond_to_missing?` on `owner`; the trails idiom for both is a `Proxy`,
   * whose `get` trap is the former and whose `has` trap is the latter — so this
   * returns the wrapped object instead of mutating `owner`. The
   * `marshal_dump` / `_dump` exemption is Rails' and belongs to
   * `respond_to_missing?` alone (`:167`, `:186`): an explicit call still
   * forwards, because `method_missing` does not repeat the check.
   */
  export function generateMethodMissing<T extends object>(
    owner: T,
    target: string,
    { allowNil }: { allowNil?: boolean } = {},
  ): T {
    return new Proxy(owner, {
      has(obj, prop) {
        if (prop === "marshal_dump" || prop === "_dump") return false;
        if (Reflect.has(obj, prop)) return true;
        const __target = (obj as Record<string, unknown>)[target];
        return __target != null && prop in Object(__target);
      },
      get(obj, prop, receiver) {
        if (prop in obj || typeof prop === "symbol") {
          return Reflect.get(obj, prop, receiver);
        }
        const __target = (obj as Record<string, unknown>)[target];
        if (__target == null) {
          if (allowNil) return undefined;
          throw DelegationError.nilTarget(globalThis.String(prop), target);
        }
        if (!(globalThis.String(prop) in Object(__target))) {
          // Rails' `else super` (`:172`, `:193`), which raises NoMethodError.
          // A `get` trap cannot raise there — `typeof x.foo === "function"` and
          // `"foo" in x` both route through it — so the read returns a function
          // that raises when called, which is where Ruby raises too. Same shape
          // and same reasoning as `methodMissingProxy`.
          if (PROTOCOL_PROBES.has(globalThis.String(prop))) return undefined;
          return () => {
            throw new NoMethodError(
              `undefined method '${globalThis.String(prop)}' for an instance of ${
                (obj as object).constructor.name
              }`,
            );
          };
        }
        const value = (__target as Record<string, unknown>)[globalThis.String(prop)];
        return typeof value === "function" ? value.bind(__target) : value;
      },
    });
  }
}
