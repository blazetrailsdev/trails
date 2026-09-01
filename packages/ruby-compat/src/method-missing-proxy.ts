/**
 * Ruby's `BasicObject#method_missing` (`vendor/ruby/vm_eval.c:2570`), the
 * interpreter hook trails mirrors with a `Proxy`. No Rails file declares the
 * module this file's exports live in.
 *
 * @noRailsEquivalent PERMANENT — `method_missing` is a core interpreter hook
 * (`vendor/ruby/vm_eval.c:2570`), not a Rails method, so it has no counterpart
 * file; JS has no such hook at all, so one shared `Proxy` shape serves every
 * ported `method_missing`.
 */
import { NoMethodError } from "./no-method-error.js";

/**
 * Names JS itself probes for on an arbitrary object to decide whether it
 * implements a protocol — `await x` reads `then`, structured comparison reads
 * `toJSON`, vitest's matchers read `asymmetricMatch`/`$$typeof`. A raising
 * function in those slots would be *called* by the probe, so they stay absent.
 *
 * @noRailsEquivalent PERMANENT — the same language shortcoming as
 * {@link methodMissingProxy} below, which this set exists for and which spells
 * it out: Ruby resolves an undefined method through `method_missing`
 * (`vendor/ruby/vm_eval.c:2570`), JS has only `Proxy`, and a `get` trap must
 * stay silent for the names JS itself probes. Exported so the other
 * `method_missing` mirrors — `Delegation.generate_method_missing`'s trap and
 * `Deprecation::Proxy`'s — read the one list rather than repeating it.
 */
export const PROTOCOL_PROBES = new Set([
  "then",
  "catch",
  "finally",
  "toJSON",
  "asymmetricMatch",
  "$$typeof",
  "nodeType",
]);

/**
 * Mirrors `Kernel#respond_to?` (`vendor/ruby/vm_method.c:3017`) — public
 * members only, as its `include_all = false` default is.
 */
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
 * @noRailsEquivalent PERMANENT — Ruby core's
 * `BasicObject#method_missing` (`vendor/ruby/vm_eval.c:2570`) resolves an
 * undefined method at the language level; JS has no such hook, only `Proxy`.
 * No amount of porting removes the need for a TS-side shape, so this is the one
 * shared one, the way `include()` is the one shape for Ruby `include`.
 */
export function methodMissingProxy<T extends object>(
  target: T,
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
