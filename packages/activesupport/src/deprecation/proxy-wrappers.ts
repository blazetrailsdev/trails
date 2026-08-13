import { callerLocations, type CallerLocation, type Deprecation } from "../deprecation.js";
import { extend, include, Module, prepend } from "../include.js";
import { constantize } from "../inflector.js";

/**
 * Mirrors: active_support/deprecation/proxy_wrappers.rb
 *
 * Ruby's `def self.new` can answer something other than an instance, and
 * `instance_methods.each { |m| undef_method m }` strips the inherited methods
 * so every call lands in `method_missing`. A TS constructor can neither return
 * `nil`/`false` nor un-define an inherited method, so `new` is a static method
 * (which is what Rails writes anyway) and the undef'd lookup is a `Proxy` whose
 * `get` is `method_missing` — the same shape `methodMissingProxy`
 * (method-missing-proxy.ts) uses, spelled out here because Rails' hook warns on
 * every forwarded call and takes the called name and args to build the message.
 */

/** Ruby truthiness: only `nil` and `false` take the `return object` arm. */
function isFalsy(object: unknown): boolean {
  return object == null || object === false;
}

/**
 * Names JS itself probes on an arbitrary object — forwarding them through
 * `method_missing` would emit a deprecation warning for an `await` or an
 * equality check the user never wrote.
 */
const PROTOCOL_PROBES = new Set(["then", "catch", "finally", "toJSON", "$$typeof", "nodeType"]);

/**
 * The `instance_methods.each { |m| undef_method m unless /^__|^object_id$/ }`
 * lookup: everything but the proxy's own public methods routes to
 * `method_missing`. `proxy` is the object handed back to the caller, so `this`
 * inside a forwarded `warn` is the proxy's own instance.
 */
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
export class DeprecationProxy {
  /** Mirrors: proxy_wrappers.rb:6-11. */
  static new(...args: unknown[]): unknown {
    const object = args[0];

    if (isFalsy(object)) return object;
    const instance = new (this as unknown as new (...a: unknown[]) => DeprecationProxy)(...args);
    return undefMethodProxy(instance, DeprecationProxy.prototype.methodMissing);
  }

  // Don't give a deprecation warning on inspect since test/unit and error
  // logs rely on it for diagnostics.
  inspect(): string {
    return String(this.target);
  }

  protected get target(): unknown {
    return undefined;
  }

  protected warn(_callstack: CallerLocation[], _called: string, _args: unknown[]): void {}

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
 *   const deprecatedObject = DeprecatedObjectProxy.new(
 *     new Object(), "This object is now deprecated", new Deprecation());
 *
 *   deprecatedObject.toString();
 *   // DEPRECATION WARNING: This object is now deprecated.
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
 * warning, pointing to the method as a replacement.
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
    // Ruby's `var = "@#{method}"` default sits before the `deprecator:` kwarg,
    // so a caller passing only the kwarg lands it in the `var` slot here.
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
      `${this._var} is deprecated! Call ${this._method}.${called} instead of ${this._var}.${called}. Args: ${JSON.stringify(args)}`,
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
 *   const PLANETS = DeprecatedConstantProxy.new(
 *     "PLANETS", "PLANETS_POST_2006", new Deprecation());
 *
 * Mirrors: proxy_wrappers.rb:117-180.
 */
export class DeprecatedConstantProxy extends Module {
  /** Mirrors: proxy_wrappers.rb:118-123. */
  static new(...args: unknown[]): unknown {
    const object = args[0];

    if (isFalsy(object)) return object;
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
    return String(this.target);
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

  /**
   * Returns the class of the new constant.
   *
   * Mirrors: proxy_wrappers.rb:152-154.
   */
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
