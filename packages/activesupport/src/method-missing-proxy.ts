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
      const value = (delegate as Record<string | symbol, unknown> | null | undefined)?.[prop];
      return typeof value === "function" ? value.bind(delegate) : value;
    },
    has(proxyTarget, prop) {
      if (overrides !== undefined && prop in overrides) return true;
      if (Reflect.has(proxyTarget, prop)) return true;
      const delegate = readDelegate(proxyTarget);
      return delegate != null && prop in Object(delegate);
    },
  });
}
