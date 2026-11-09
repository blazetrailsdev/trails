import {
  ArgumentError,
  iseqLocationSetup,
  NameError,
  NilClass,
  NoMethodError,
  rbModName,
  rbModToS,
  rbObjClass,
  rbFSend,
  rbObjRespondTo,
  nameErrMesgReceiver,
  constGet,
} from "@blazetrails/ruby-compat";
import { Module } from "@blazetrails/ruby-compat/include";
import { constantize, safeConstantize } from "./inflector.js";
import { callerLocations, type CallerLocation } from "./deprecation.js";
import { KERNEL_METHODS, PROTOCOL_PROBES } from "@blazetrails/ruby-compat/method-missing-proxy";

export class DelegationError extends Error {
  static toString(): string {
    return "ActiveSupport::DelegationError";
  }

  constructor(message: string) {
    super(message);
    this.name = "DelegationError";
  }

  static nilTarget(methodName: string, target: string): DelegationError {
    return new DelegationError(`${methodName} delegated to ${target}, but ${target} is nil`);
  }
}

export interface DelegateOptions {
  location?: CallerLocation | null;
  to?: string | object | null;
  prefix?: boolean | string | null;
  allowNil?: boolean | null;
  nilable?: boolean | null;
  private?: boolean | null;
  as?: Module | (abstract new (...args: never[]) => object) | null;
  signature?: string | null;
}

function sendOrRead(value: unknown, name: string, args: unknown[]): unknown {
  let descriptor: PropertyDescriptor | undefined;
  for (let o: object | null = Object(value); o && !descriptor; o = Object.getPrototypeOf(o)) {
    descriptor = Object.getOwnPropertyDescriptor(o, name);
  }
  const member = (value as Record<string, unknown>)[name];
  return descriptor && "value" in descriptor && typeof member === "function"
    ? member.apply(value, args)
    : member;
}

function receiverValue(owner: object, self: Record<string, unknown>, receiver: string): unknown {
  let value: unknown = self;
  for (const [i, segment] of receiver.split(".").entries()) {
    if (value == null) return value;
    value =
      i === 0 && /^[A-Z]/.test(segment) ? constGet(owner, segment) : sendOrRead(value, segment, []);
  }
  return value;
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

  /** @inventedArm if — PERMANENT */
  export function generate<T extends object>(
    owner: T,
    methods: string[],
    options: DelegateOptions = {},
  ): string[] {
    if (owner instanceof Module) {
      return owner.moduleEval((mod) => generate(mod, methods, options));
    }
    const { to = null, prefix = null, allowNil = null, as = null, signature = null } = options;
    let location = options.location ?? null;
    let nilable = "nilable" in options ? options.nilable : true;

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

    location ||= callerLocations(1, 1)[0];
    const [file, line] = [location.path, location.lineno];

    let receiver: string;
    if (typeof to !== "string") {
      const name = rbModName(to as new () => unknown);
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
    const enumerable = typeof owner !== "function" && !Object.hasOwn(owner, "constructor");

    let explicitReceiver = false;
    let receiverClass: unknown;
    if (as != null) {
      explicitReceiver = true;
      receiverClass = as instanceof Module ? as.moduleEval((mod) => mod) : as.prototype;
    } else if (typeof to !== "string") {
      receiverClass = to;
    } else if (receiver === "self.class") {
      nilable = false;
      receiverClass = (owner as { constructor?: unknown }).constructor;
    }

    for (const method of methods) {
      const methodName = `${methodPrefix}${method}`;
      methodNames.push(methodName);

      const resolve = (self: Record<string, unknown>): unknown => {
        const _ = receiver.startsWith("::")
          ? constantize(receiver)
          : receiver === "self.class"
            ? rbObjClass(self)
            : receiverValue(owner, self, receiverName);
        if (nilable === false) return _;
        if (_ == null && !Object.hasOwn(NilClass, method)) {
          if (allowNil) return undefined;
          throw DelegationError.nilTarget(methodName, receiver);
        }
        return _;
      };

      if (/[^\]]=$/.test(method)) {
        const attr = method.slice(0, -1);
        const set = function (this: Record<string, unknown>, arg: unknown) {
          const _ = resolve(this);
          if (_ == null) {
            if (nilable !== false) return;
            throw new NoMethodError(`undefined method '${method}' for nil`);
          }
          (_ as Record<string, unknown>)[attr] = arg;
        };
        iseqLocationSetup(set, file, line);
        const reader = Object.getOwnPropertyDescriptor(owner, methodName.slice(0, -1));
        const readerValue = reader?.value as ((this: unknown) => unknown) | undefined;
        Object.defineProperty(owner, methodName.slice(0, -1), {
          configurable: true,
          enumerable,
          get:
            reader?.get ??
            (typeof readerValue === "function"
              ? function (this: unknown) {
                  return readerValue.call(this);
                }
              : undefined),
          set,
        });
        continue;
      }

      const value = function (this: Record<string, unknown>, ...args: unknown[]) {
        const _ = resolve(this);
        if (_ == null && nilable !== false)
          return Object.hasOwn(NilClass, method) ? NilClass[method].apply(null, args) : undefined;
        if (!(method in Object(_))) {
          throw new NoMethodError(`undefined method '${method}' for ${nameErrMesgReceiver(_)}`);
        }
        return sendOrRead(_, method, args);
      };
      let descriptor: PropertyDescriptor | undefined;
      if (signature == null && receiverClass != null) {
        for (let o = receiverClass as object | null; o != null && !descriptor; ) {
          descriptor = Object.getOwnPropertyDescriptor(o, method);
          o = Object.getPrototypeOf(o);
        }
        if (!descriptor && explicitReceiver) {
          throw new NameError(
            `undefined method '${method}' for class '${rbModToS(as as new () => unknown)}'`,
            method,
          );
        }
      }
      if (descriptor?.get) {
        const get = function (this: Record<string, unknown>) {
          const _ = resolve(this);
          if (_ == null && nilable !== false) return undefined;
          if (!(method in Object(_))) {
            throw new NoMethodError(`undefined method '${method}' for ${nameErrMesgReceiver(_)}`);
          }
          return (_ as Record<string, unknown>)[method];
        };
        iseqLocationSetup(get, file, line);
        Object.defineProperty(owner, methodName, {
          configurable: true,
          enumerable,
          get,
        });
        continue;
      }
      const methodObject = descriptor?.value;
      if (signature != null) {
        Object.defineProperty(value, "length", {
          value: signature
            .split(",")
            .map((arg) => arg.trim())
            .filter((arg) => /^\w+$/.test(arg)).length,
        });
      } else if (typeof methodObject === "function") {
        Object.defineProperty(value, "length", { value: methodObject.length });
      }
      iseqLocationSetup(value, file, line);
      const writer = Object.getOwnPropertyDescriptor(owner, methodName)?.set;
      Object.defineProperty(
        owner,
        methodName,
        writer
          ? {
              configurable: true,
              enumerable,
              get(this: Record<string, unknown>) {
                return value.call(this);
              },
              set: writer,
            }
          : { configurable: true, enumerable, writable: true, value },
      );
    }

    return methodNames;
  }

  const methodMissingLayers = new WeakSet<object>();

  /**
   * @inventedArm then — PERMANENT
   * @inventedArm if — PERMANENT
   */
  export function generateMethodMissing(
    owner: { prototype: object },
    target: string,
    { allowNil }: { allowNil?: boolean } = {},
  ): void {
    if (RESERVED_METHOD_NAMES.has(target) || target === "__target") target = `self.${target}`;

    const targetName = target.startsWith("self.") ? target.slice("self.".length) : target;
    let parent = Object.getPrototypeOf(owner.prototype) as object;
    if (methodMissingLayers.has(parent)) parent = Object.getPrototypeOf(parent) as object;

    Object.defineProperty(owner.prototype, "respondToMissing", {
      configurable: true,
      writable: true,
      value(this: Record<string, unknown>, name: string, includePrivate = false): boolean {
        if (name === "marshal_dump" || name === "_dump") return false;
        if (rbObjRespondTo(this[targetName], name)) return true;
        let sup: unknown;
        for (let o: object | null = parent; o && sup === undefined; o = Object.getPrototypeOf(o)) {
          sup = Object.getOwnPropertyDescriptor(o, "respondToMissing")?.value;
        }
        return typeof sup === "function" ? sup.call(this, name, includePrivate) : false;
      },
    });

    const layer = new Proxy(Object.create(parent) as object, {
      get(obj, prop, receiver) {
        if (
          prop in obj ||
          typeof prop === "symbol" ||
          prop.startsWith("_") ||
          prop === "then" ||
          KERNEL_METHODS.has(prop) ||
          Object.hasOwn(receiver, "constructor")
        ) {
          return Reflect.get(obj, prop, receiver);
        }
        const __target = (receiver as Record<string, unknown>)[targetName];
        if (__target == null && !rbObjRespondTo(null, prop)) {
          if (allowNil) return undefined;
          throw DelegationError.nilTarget(prop, target);
        }
        if (__target == null) return (...args: unknown[]) => rbFSend(null, prop, ...args);
        if (!(prop in Object(__target))) {
          const sup = Reflect.get(obj, prop, receiver);
          if (sup !== undefined) return sup;
          if (PROTOCOL_PROBES.has(prop)) return undefined;
          return () => {
            throw new NoMethodError(
              `undefined method '${prop}' for an instance of ${
                (receiver as object).constructor.name
              }`,
            );
          };
        }
        const value = (__target as Record<string, unknown>)[prop];
        return typeof value === "function" ? value.bind(__target) : value;
      },
    });
    methodMissingLayers.add(layer);
    Object.setPrototypeOf(owner.prototype, layer);
  }
}
