import { NameError } from "./core-ext/name-error.js";

/**
 * Ruby's `NoMethodError`, raised by the `else super` arm. It subclasses this
 * package's {@link NameError} because Ruby's does (`NoMethodError < NameError`),
 * so a `rescue NameError` site catches it. Local to this module rather than
 * exported: the raise site is the proxy, and callers identify it the way they
 * identify any Ruby error class here — by `name` and message.
 */
class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

/**
 * Names JS itself probes for on an arbitrary object to decide whether it
 * implements a protocol — `await x` reads `then`, structured comparison reads
 * `toJSON`, vitest's matchers read `asymmetricMatch`/`$$typeof`. A raising
 * function in those slots would be *called* by the probe, so they stay absent.
 */
const PROTOCOL_PROBES = new Set([
  "then",
  "catch",
  "finally",
  "toJSON",
  "asymmetricMatch",
  "$$typeof",
  "nodeType",
]);

/** Mirrors `delegate.respond_to?(method)` — public members only. */
function respondsTo(delegate: unknown, prop: string | symbol): boolean {
  if (delegate == null) return false;
  if (typeof prop === "string" && prop.startsWith("_")) return false;
  return prop in Object(delegate);
}

/**
 * Ruby-style `method_missing` forwarding for a TypeScript object.
 *
 * Ruby wrappers define `method_missing` / `respond_to_missing?` to forward what
 * they don't define to the wrapped delegate. The trails idiom is a `Proxy` whose
 * `get` falls through to the delegate and whose `has` mirrors
 * `respond_to_missing?` — the role `include()` plays for Ruby `include`.
 *
 * `delegate` is read on every access, because the wrappers that need this can
 * swap it after construction, as Ruby re-reads the ivar. A forwarded value comes
 * back whether or not it is callable — `public_send` makes no such distinction
 * (command_recorder.rb:400-404) — with functions bound to the delegate. When
 * `delegate(target)` returns `target` there is no own-property step (DelegateClass).
 *
 * Both traps are *public*-only, because Rails asks `delegate.respond_to?(method)`
 * and forwards with `delegate.public_send` (command_recorder.rb:396,401), neither
 * of which sees a private or protected method. The TS analogue of "private" is
 * the trails leading-underscore convention, so an `_`-prefixed delegate member is
 * neither forwarded nor answered by `has`.
 *
 * A name the delegate does not answer takes Rails' `else super` arm and raises
 * `NoMethodError` (command_recorder.rb:403). A `get` trap cannot raise there:
 * `typeof x.foo === "function"` and `"foo" in x` both route through it, so
 * throwing would blow up every feature probe. The read therefore returns a
 * function that raises when *called*, which is exactly where Ruby's
 * `method_missing` raises.
 *
 * @noRailsEquivalent PERMANENT — Ruby resolves an undefined method through
 * `method_missing` at the language level; JS has no such hook, only `Proxy`.
 * No amount of porting removes the need for a TS-side shape, so this is the one
 * shared one, the way `include()` is the one shape for Ruby `include`.
 */
export function methodMissingProxy<T extends object>(
  target: T,
  /** `delegate` reads the forwarding target; `overrides` is consulted first. */
  options: {
    delegate: (target: T) => unknown;
    overrides?: Record<string | symbol, unknown>;
  },
): T {
  const { delegate: readDelegate, overrides } = options;
  return new Proxy(target, {
    get(proxyTarget, prop, receiver) {
      if (overrides !== undefined && prop in overrides) return overrides[prop];
      const delegate = readDelegate(proxyTarget);
      if (delegate !== proxyTarget && Reflect.has(proxyTarget, prop)) {
        return Reflect.get(proxyTarget, prop, receiver);
      }
      if (respondsTo(delegate, prop)) {
        const value = (delegate as Record<string | symbol, unknown>)[prop];
        return typeof value === "function" ? value.bind(delegate) : value;
      }
      if (typeof prop === "symbol" || PROTOCOL_PROBES.has(prop)) return undefined;
      return () => {
        throw new NoMethodError(
          `undefined method '${prop}' for an instance of ${(proxyTarget as object).constructor.name}`,
        );
      };
    },
    has(proxyTarget, prop) {
      if (overrides !== undefined && prop in overrides) return true;
      if (Reflect.has(proxyTarget, prop)) return true;
      return respondsTo(readDelegate(proxyTarget), prop);
    },
  });
}
