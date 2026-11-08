/**
 * Names a probe reads off an arbitrary object and then *calls*, where Ruby's
 * `method_missing` is never reached. Two kinds:
 *
 * - what JS itself probes to decide whether an object implements a protocol —
 *   `await x` reads `then`, structured comparison reads `toJSON`, vitest's
 *   matchers read `asymmetricMatch`/`$$typeof`;
 * - what Ruby answers from `Object` itself, so the send resolves before
 *   `method_missing`: `Object#blank?` (`activesupport/lib/active_support/core_ext/object/blank.rb:16-18`)
 *   is a real public method on every object, and it in turn asks
 *   `respond_to?(:empty?)` — trails spells both as the free functions `isBlank`
 *   / `isEmpty`, which read the member off the receiver instead.
 *
 * A raising function in those slots would be *called* by the probe, so they
 * stay absent. A name the delegate really answers is forwarded before this set
 * is consulted, so nothing real is suppressed.
 *
 * @noRailsEquivalent PERMANENT — Ruby resolves an undefined method through `method_missing`
 * (`vendor/ruby/v3.3.11/vm_eval.c:2570`), JS has only `Proxy`, and a `get` trap must
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
  "hasAttribute",
  "isBlank",
  "isEmpty",
  "empty",
]);

/**
 * The public methods `Kernel` defines on every object (`vendor/ruby/v3.3.11/object.c:4360`,
 * `Init_Object` at `:4527`), camelCased as trails spells them. Ruby finds them
 * on the receiver before `method_missing` is consulted, so a trap forwarding
 * to a delegate must not forward these: `chars.eql?(chars)` is Kernel's
 * identity test, never the wrapped String's.
 *
 * @noRailsEquivalent PERMANENT
 */
export const KERNEL_METHODS = new Set([
  "isNil",
  "caseEquals",
  "eql",
  "hash",
  "compareTo",
  "singletonClass",
  "dup",
  "itself",
  "freeze",
  "isFrozen",
  "clone",
  "toS",
  "inspect",
  "methods",
  "singletonMethods",
  "protectedMethods",
  "privateMethods",
  "publicMethods",
  "instanceVariables",
  "instanceVariableGet",
  "instanceVariableSet",
  "isInstanceVariableDefined",
  "removeInstanceVariable",
  "isInstanceOf",
  "isKindOf",
  "isA",
  "tap",
  "then",
  "yieldSelf",
  "send",
  "publicSend",
  "isRespondTo",
  "method",
  "publicMethod",
  "singletonMethod",
  "defineSingletonMethod",
  "objectId",
  "display",
  "extend",
  "enumFor",
  "toEnum",
  "isEqual",
  "equals",
  "instanceEval",
  "instanceExec",
]);

/**
 * Mirrors `Kernel#respond_to?` (`vendor/ruby/v3.3.11/vm_method.c:3017`) — public
 * members only, as its `include_all = false` default is.
 */
function respondsTo(delegate: unknown, prop: string | symbol): boolean {
  if (delegate == null) return false;
  if (typeof prop === "string" && prop.startsWith("_")) return false;
  return prop in Object(delegate);
}

/**
 * Whether `prop` resolves to a method rather than a reader: Ruby's
 * `target.__send__(m)` (`vendor/ruby/v3.3.11/lib/delegate.rb:88`) returns a reader's
 * value as-is, so only a data descriptor on the delegate's prototype chain is
 * bound — a getter returning a class hands back the class itself.
 */
function isMethod(delegate: object, prop: string | symbol): boolean {
  for (let owner: object | null = delegate; owner; owner = Object.getPrototypeOf(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, prop);
    if (descriptor) return "value" in descriptor;
  }
  return false;
}

/**
 * Mirrors the dispatch to `method_missing` (`vendor/ruby/v3.3.11/vm_eval.c:2570`) for a
 * class whose `methodMissing` forwards to a delegate. A name the delegate answers
 * is read off it, so a reader returns its value; any other name returns a
 * function calling `receiver.methodMissing`. A read off a prototype (an own
 * `constructor`) and an `_`-prefixed name, trails' private spelling, are not
 * dispatched, as `respondsTo` above answers neither.
 *
 * @noRailsEquivalent PERMANENT
 */
export function methodMissingPrototype<
  T extends { methodMissing(m: string, ...args: unknown[]): unknown },
>(klass: { prototype: T }, options: { delegate: (receiver: T) => unknown }): void {
  const { delegate: readDelegate } = options;
  const parent = Object.getPrototypeOf(klass.prototype) as object;
  Object.setPrototypeOf(
    klass.prototype,
    new Proxy(Object.create(parent) as object, {
      get(target, prop, receiver: T) {
        if (
          Reflect.has(target, prop) ||
          Object.hasOwn(receiver, "constructor") ||
          (typeof prop === "string" && prop.startsWith("_"))
        ) {
          return Reflect.get(target, prop, receiver);
        }
        const delegate = readDelegate(receiver);
        if (respondsTo(delegate, prop)) {
          const value = (delegate as Record<string | symbol, unknown>)[prop];
          return typeof value === "function" && isMethod(delegate as object, prop)
            ? value.bind(delegate)
            : value;
        }
        if (typeof prop === "symbol" || PROTOCOL_PROBES.has(prop) || KERNEL_METHODS.has(prop)) {
          return undefined;
        }
        return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
      },
    }),
  );
}
