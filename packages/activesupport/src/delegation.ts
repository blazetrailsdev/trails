/**
 * Delegation — delegate method calls to another object.
 * Mirrors ActiveSupport::Delegation and ActiveSupport::DelegationError.
 */

import { NameError } from "./core-ext/name-error.js";
import { constantize, registeredConstantName, safeConstantize } from "./inflector.js";
import { PROTOCOL_PROBES } from "./method-missing-proxy.js";

class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

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
  /**
   * A method name, or the trails spelling of a Ruby Module — a class or module
   * object, whose registered constant name is the receiver (`delegation.rb:36-47`).
   */
  to: string | object;
  prefix?: boolean | string;
  allowNil?: boolean;
}

export namespace Delegation {
  // prettier-ignore
  export const RUBY_RESERVED_KEYWORDS = ["__ENCODING__", "__LINE__", "__FILE__", "alias", "and", "BEGIN", "begin", "break",
    "case", "class", "def", "defined?", "do", "else", "elsif", "END", "end", "ensure", "false", "for", "if", "in", "module", "next", "nil",
    "not", "or", "redo", "rescue", "retry", "return", "self", "super", "then", "true", "undef", "unless", "until", "when", "while", "yield"];
  export const RESERVED_METHOD_NAMES: ReadonlySet<string> = new Set([
    ...RUBY_RESERVED_KEYWORDS,
    "_",
    "arg",
    "args",
    "block",
  ]);

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
   * Two arms of the receiver step (`:36-58`) read differently in TS. The `self.`
   * Ruby prepends to a `RESERVED_METHOD_NAMES` receiver (`:58`) disambiguates a
   * keyword from a method call in the source it compiles; a JS member read is
   * never ambiguous, so the generated body reads the same member with or without
   * it — the prefix survives only where Rails also shows it, in the
   * `DelegationError` message (`:135`). And `prefix: true` with a Module target
   * raises here: Ruby reaches `TypeError` from `/^[^a-z_]/.match?(to)` (`:27`)
   * because a Module has no implicit String conversion, where TS has to test the
   * type itself, so it raises the `ArgumentError` that line is guarding for.
   *
   * `to.name` (`:38`, `:41`, `:45`) is Ruby's full constant path, so a nested
   * `Admin::Json` delegates through `::Admin::Json`; a JS class carries only its
   * own identifier, so the registered path comes from `registeredConstantName`
   * and the class's own `name` is the fallback for a top-level registration.
   */
  export function generate<T extends object>(
    owner: T,
    methods: string[],
    options: DelegateOptions,
  ): string[] {
    const { to, prefix, allowNil } = options;

    if (!to) {
      throw new ArgumentError(
        "Delegation needs a target. Supply a keyword argument 'to' (e.g. delegate :hello, to: :greeter).",
      );
    }

    if (prefix === true && (typeof to !== "string" || /^[^a-z_]/.test(to))) {
      throw new ArgumentError(
        "Can only automatically set the delegation prefix when delegating to a method.",
      );
    }

    const methodPrefix = prefix ? `${prefix === true ? String(to) : prefix}_` : "";

    let receiver: string;
    if (typeof to !== "string") {
      const name = registeredConstantName(to) ?? (to as { name?: string }).name;
      if (name == null || name === "") {
        throw new ArgumentError(`Can't delegate to anonymous class or module: ${String(to)}`);
      }

      if (safeConstantize(name) !== to) {
        throw new ArgumentError(`Can't delegate to detached class or module: ${name}`);
      }

      receiver = `::${name}`;
    } else {
      receiver = to;
    }
    if (RESERVED_METHOD_NAMES.has(receiver)) receiver = `self.${receiver}`;

    const receiverName = receiver.startsWith("self.") ? receiver.slice("self.".length) : receiver;

    const methodNames: string[] = [];

    for (const method of methods) {
      const methodName = `${methodPrefix}${method}`;
      methodNames.push(methodName);

      Object.defineProperty(owner, methodName, {
        configurable: true,
        enumerable: false,
        writable: true,
        value(...args: unknown[]) {
          const _ = receiver.startsWith("::")
            ? constantize(receiver)
            : (this as Record<string, unknown>)[receiverName];
          if (_ == null) {
            if (allowNil) return undefined;
            throw DelegationError.nilTarget(methodName, receiver);
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
