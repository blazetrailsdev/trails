import { callerLocations, type CallerLocation, type Deprecation } from "../deprecation.js";
import { extend, include, Module, prepend } from "@blazetrails/ruby-compat/include";
import { constantize, underscore } from "../inflector.js";
import { PROTOCOL_PROBES } from "@blazetrails/ruby-compat/method-missing-proxy";
import { rbEqual, rbObjRespondTo, rbStrSend } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../hash-utils.js";

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  return String(value);
}

function undefMethodProxy<T extends object>(
  instance: T,
  methodMissing: MethodMissing,
  superclass: object,
  constMissing?: (this: unknown, name: string) => unknown,
): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || PROTOCOL_PROBES.has(prop)) return undefined;
      if (prop.startsWith("__") || !isUndefined(target, prop, superclass)) {
        return Reflect.get(target, prop, receiver);
      }
      if (constMissing !== undefined && /^[A-Z]/.test(prop)) return constMissing.call(target, prop);
      return (...args: unknown[]) => methodMissing.call(target, prop, args);
    },
  });
}

function isUndefined(target: object, prop: string, superclass: object): boolean {
  for (let owner: object | null = target; owner && owner !== superclass; ) {
    if (Object.hasOwn(owner, prop)) return false;
    owner = Object.getPrototypeOf(owner);
  }
  return true;
}

type MethodMissing = (this: unknown, called: string, args: unknown[]) => unknown;

export abstract class DeprecationProxy {
  static new(...args: unknown[]): unknown {
    const object = args[0];

    if (object == null || object === false) return object;
    const instance = new (this as unknown as new (...a: unknown[]) => DeprecationProxy)(...args);
    return undefMethodProxy(
      instance,
      DeprecationProxy.prototype.methodMissing,
      Object.getPrototypeOf(DeprecationProxy.prototype),
    );
  }

  inspect(): string {
    return inspect(this.target);
  }

  protected abstract get target(): unknown;

  protected abstract warn(callstack: CallerLocation[], called: string, args: unknown[]): void;

  private methodMissing(called: string, args: unknown[]): unknown {
    this.warn(callerLocations(), called, args);
    const target = this.target;
    if (typeof target === "string") return rbStrSend(target, called, ...args)[0];
    const value = (target as Record<string, unknown>)[called];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).apply(target, args)
      : value;
  }
}

export class DeprecatedObjectProxy extends DeprecationProxy {
  private _object: unknown;
  private _message: string;
  private _deprecator: Deprecation;

  constructor(object: unknown, message: string, deprecator: Deprecation) {
    super();
    if (arguments.length !== 3) {
      throw new ArgumentError(`wrong number of arguments (given ${arguments.length}, expected 3)`);
    }
    this._object = object;
    this._message = message;
    this._deprecator = deprecator;
  }

  protected override get target(): unknown {
    return this._object;
  }

  /** @missingRailsName message — PERMANENT */
  protected override warn(callstack: CallerLocation[], _called: string, _args: unknown[]): void {
    this._deprecator.warn(this._message, callstack);
  }
}

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
    const kwargs = typeof varOrOptions === "string" ? options : varOrOptions;
    const given = arguments.length - (kwargs === undefined ? 0 : 1);
    if (given < 2 || given > 3) {
      throw new ArgumentError(
        `wrong number of arguments (given ${given}, expected 2..3; required keyword: deprecator)`,
      );
    }
    if (kwargs === undefined || !("deprecator" in kwargs)) {
      throw new ArgumentError("missing keyword: :deprecator");
    }
    const deprecator = kwargs.deprecator;
    this._instance = instance as Record<string, unknown>;
    this._method = method;
    this._var = varName;
    this._deprecator = deprecator;
  }

  protected override get target(): unknown {
    const value = this._instance[this._method];
    return typeof value === "function" ? (value as () => unknown).call(this._instance) : value;
  }

  protected override warn(callstack: CallerLocation[], called: string, args: unknown[]): void {
    this._deprecator.warn(
      `${this._var} is deprecated! Call ${this._method}.${underscore(called)} instead of ${this._var}.${underscore(called)}. Args: ${inspect(args)}`,
      callstack,
    );
  }
}

export class DeprecatedConstantProxy extends Module {
  static new(...args: unknown[]): unknown {
    const object = args[0];

    if (object == null || object === false) return object;
    const instance = new (this as unknown as new (...a: unknown[]) => DeprecatedConstantProxy)(
      ...args,
    );
    return undefMethodProxy(
      instance,
      DeprecatedConstantProxy.prototype.methodMissing as MethodMissing,
      Module.prototype,
      DeprecatedConstantProxy.prototype.constMissing,
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
    if (arguments.length < 3 || arguments.length > 4) {
      throw new ArgumentError(`wrong number of arguments (given ${arguments.length}, expected 3)`);
    }
    this._oldConst = oldConst;
    this._newConst = newConst;
    this._deprecator = deprecator;
    this._message = message ?? `${oldConst} is deprecated! Use ${newConst} instead.`;
  }

  inspect(): string {
    return inspect(this.target);
  }

  override instanceMethods(): string[] {
    return (this.target as Module).instanceMethods();
  }

  get name(): string {
    return (this.target as { name: string }).name;
  }

  hash(): unknown {
    const target = this.target as { hash?: () => unknown };
    return typeof target.hash === "function" ? target.hash() : undefined;
  }

  respondTo(method: string, includeAll: boolean = false): boolean {
    return rbObjRespondTo(this.target, method, includeAll);
  }

  class(): unknown {
    return (this.target as object).constructor;
  }

  appendFeatures(base: new (...args: any[]) => any): void {
    this._deprecator.warn(this._message, callerLocations());
    include(base, this.target as Module);
  }

  prependFeatures(base: new (...args: any[]) => any): void {
    this._deprecator.warn(this._message, callerLocations());
    prepend(base, this.target as Module);
  }

  extended(base: object): void {
    this._deprecator.warn(this._message, callerLocations());
    extend(base, this.target as Module);
  }

  private get target(): unknown {
    return constantize(String(this._newConst));
  }

  private constMissing(name: string): unknown {
    this._deprecator.warn(this._message, callerLocations());
    return constantize(`${String(this._newConst)}::${name}`);
  }

  private methodMissing(called: string, args: unknown[]): unknown {
    this._deprecator.warn(this._message, callerLocations());
    const target = this.target;
    if (called === "equals") return rbEqual(target, args[0]);
    if (typeof target === "string") return rbStrSend(target, called, ...args)[0];
    const value = (target as Record<string, unknown>)[called];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).apply(target, args)
      : value;
  }
}
