import { callerLocations, type CallerLocation, type Deprecation } from "../deprecation.js";
import { extend, include, Module, prepend } from "../include.js";
import { constantize } from "../inflector.js";

/**
 * Mirrors: active_support/deprecation/proxy_wrappers.rb
 *
 * A TS constructor can neither return `nil`/`false` nor un-define an inherited
 * method, so `new` stays the static method Rails writes, and the
 * `undef_method` + `method_missing` lookup is a `Proxy` — the shape
 * `methodMissingProxy` (method-missing-proxy.ts) uses, spelled out here because
 * Rails' hook warns on every forwarded call, from the called name and args.
 */

/** Mirrors Ruby's `Object#inspect` for the values these messages interpolate. */
function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  return String(value);
}

/** Names JS probes on any object; forwarding them would warn for an `await`. */
const PROTOCOL_PROBES = new Set(["then", "catch", "finally", "toJSON", "$$typeof", "nodeType"]);

/** The `instance_methods.each { |m| undef_method m }` lookup. */
function undefMethodProxy<T extends object>(instance: T, methodMissing: MethodMissing): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || PROTOCOL_PROBES.has(prop)) return undefined;
      if (prop.startsWith("__") || Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      return (...args: unknown[]) => methodMissing.call(target, prop, args);
    },
  });
}

type MethodMissing = (this: unknown, called: string, args: unknown[]) => unknown;

/** :nodoc: */
export abstract class DeprecationProxy {
  /** Mirrors: proxy_wrappers.rb:6-11. */
  static new(...args: unknown[]): unknown {
    const object = args[0];

    if (object == null || object === false) return object;
    const instance = new (this as unknown as new (...a: unknown[]) => DeprecationProxy)(...args);
    return undefMethodProxy(instance, DeprecationProxy.prototype.methodMissing);
  }

  // Don't give a deprecation warning on inspect since test/unit and error
  // logs rely on it for diagnostics.
  inspect(): string {
    return inspect(this.target);
  }

  protected abstract get target(): unknown;

  protected abstract warn(callstack: CallerLocation[], called: string, args: unknown[]): void;

  /** Mirrors: proxy_wrappers.rb:19-22. */
  private methodMissing(called: string, args: unknown[]): unknown {
    this.warn(callerLocations(), called, args);
    const value = (this.target as Record<string, unknown>)[called];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).apply(this.target, args)
      : value;
  }
}

/**
 * DeprecatedObjectProxy transforms an object into a deprecated one. It takes an
 * object, a deprecation message, and a deprecator.
 *
 * Mirrors: proxy_wrappers.rb:35-51.
 */
export class DeprecatedObjectProxy extends DeprecationProxy {
  private _object: unknown;
  private _message: string;
  private _deprecator: Deprecation;

  constructor(object: unknown, message: string, deprecator: Deprecation) {
    super();
    this._object = object;
    this._message = message;
    this._deprecator = deprecator;
  }

  protected override get target(): unknown {
    return this._object;
  }

  protected override warn(callstack: CallerLocation[], _called: string, _args: unknown[]): void {
    this._deprecator.warn(this._message, callstack);
  }
}

/**
 * DeprecatedInstanceVariableProxy transforms an instance variable into a
 * deprecated one. It takes an instance of a class, a method on that class, an
 * instance variable, and a deprecator as the last argument.
 *
 * Trying to use the deprecated instance variable will result in a deprecation
 * warning, pointing to the method as a replacement. Ruby's `var = "@#{method}"`
 * default sits before the `deprecator:` kwarg, so a caller passing only the
 * kwarg lands it in the `var` slot; both arrangements are accepted.
 *
 * Mirrors: proxy_wrappers.rb:83-99.
 */
export class DeprecatedInstanceVariableProxy extends DeprecationProxy {
  private _instance: Record<string, unknown>;
  private _method: string;
  private _var: string;
  private _deprecator: Deprecation;

  constructor(
    instance: unknown,
    method: string,
    varOrOptions?: string | { deprecator: Deprecation },
    options?: { deprecator: Deprecation },
  ) {
    super();
    const varName = typeof varOrOptions === "string" ? varOrOptions : `@${method}`;
    const deprecator = (typeof varOrOptions === "string" ? options : varOrOptions)?.deprecator;
    this._instance = instance as Record<string, unknown>;
    this._method = method;
    this._var = varName;
    this._deprecator = deprecator as Deprecation;
  }

  protected override get target(): unknown {
    const value = this._instance[this._method];
    return typeof value === "function" ? (value as () => unknown).call(this._instance) : value;
  }

  protected override warn(callstack: CallerLocation[], called: string, args: unknown[]): void {
    this._deprecator.warn(
      `${this._var} is deprecated! Call ${this._method}.${called} instead of ${this._var}.${called}. Args: ${inspect(args)}`,
      callstack,
    );
  }
}

/**
 * DeprecatedConstantProxy transforms a constant into a deprecated one. It takes
 * the full names of an old (deprecated) constant and of a new constant (both in
 * string form) and a deprecator. The deprecated constant now returns the value
 * of the new one.
 *
 * Mirrors: proxy_wrappers.rb:117-180.
 */
export class DeprecatedConstantProxy extends Module {
  /** Mirrors: proxy_wrappers.rb:118-123. */
  static new(...args: unknown[]): unknown {
    const object = args[0];

    if (object == null || object === false) return object;
    const instance = new (this as unknown as new (...a: unknown[]) => DeprecatedConstantProxy)(
      ...args,
    );
    return undefMethodProxy(
      instance,
      DeprecatedConstantProxy.prototype.methodMissing as MethodMissing,
    );
  }

  private _oldConst: string;
  private _newConst: string;
  private _deprecator: Deprecation;
  private _message: string;

  constructor(
    oldConst: string,
    newConst: string,
    deprecator: Deprecation,
    { message }: { message?: string } = {},
  ) {
    super();
    this._oldConst = oldConst;
    this._newConst = newConst;
    this._deprecator = deprecator;
    this._message = message ?? `${oldConst} is deprecated! Use ${newConst} instead.`;
  }

  // Don't give a deprecation warning on inspect since test/unit and error
  // logs rely on it for diagnostics.
  inspect(): string {
    return inspect(this.target);
  }

  // Don't give a deprecation warning on methods that IRB may invoke
  // during tab-completion. Rails: `delegate :hash, :instance_methods, :name,
  // :respond_to?, to: :target` (proxy_wrappers.rb:145).
  override instanceMethods(): string[] {
    return (this.target as Module).instanceMethods();
  }

  get name(): string {
    return (this.target as { name: string }).name;
  }

  // Ruby's `Object#hash` and `Object#respond_to?` are universal; TypeScript has
  // no such members, so each delegation calls the target's own port when it has
  // one and answers from the object itself otherwise. Either way the probe is
  // answered here rather than falling through to `methodMissing`, which is the
  // whole point of Rails' delegate line.
  hash(): unknown {
    const target = this.target as { hash?: () => unknown };
    return typeof target.hash === "function" ? target.hash() : undefined;
  }

  respondTo(method: string): boolean {
    const target = this.target as { respondTo?: (m: string) => boolean };
    return typeof target.respondTo === "function"
      ? target.respondTo(method)
      : method in (target as object);
  }

  /** Returns the class of the new constant. Mirrors: proxy_wrappers.rb:152-154. */
  class(): unknown {
    return (this.target as object).constructor;
  }

  /** Mirrors: proxy_wrappers.rb:156-159. */
  appendFeatures(base: new (...args: any[]) => any): void {
    this._deprecator.warn(this._message, callerLocations());
    include(base, this.target as Module);
  }

  /** Mirrors: proxy_wrappers.rb:161-164. */
  prependFeatures(base: new (...args: any[]) => any): void {
    this._deprecator.warn(this._message, callerLocations());
    prepend(base, this.target as Module);
  }

  /** Mirrors: proxy_wrappers.rb:166-169. */
  extended(base: object): void {
    this._deprecator.warn(this._message, callerLocations());
    extend(base, this.target as Module);
  }

  private get target(): unknown {
    return constantize(String(this._newConst));
  }

  /** Mirrors: proxy_wrappers.rb:180-183. */
  private methodMissing(called: string, args: unknown[]): unknown {
    this._deprecator.warn(this._message, callerLocations());
    const value = (this.target as Record<string, unknown>)[called];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).apply(this.target, args)
      : value;
  }
}
