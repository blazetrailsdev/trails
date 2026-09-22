import { ArgumentError, NilClass, NoMethodError } from "@blazetrails/ruby-compat";
import { constantize, registeredConstantName, safeConstantize } from "./inflector.js";
import { PROTOCOL_PROBES } from "@blazetrails/ruby-compat/method-missing-proxy";

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
  to: string | object;
  prefix?: boolean | string;
  allowNil?: boolean;
}

function receiverValue(self: Record<string, unknown>, receiver: string): unknown {
  let value: unknown = self;
  for (const segment of receiver.split(".")) {
    if (value == null) return value;
    let descriptor: PropertyDescriptor | undefined;
    for (let o: object | null = Object(value); o && !descriptor; o = Object.getPrototypeOf(o)) {
      descriptor = Object.getOwnPropertyDescriptor(o, segment);
    }
    const member = (value as Record<string, unknown>)[segment];
    value =
      descriptor && "value" in descriptor && typeof member === "function"
        ? member.call(value)
        : member;
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

    const receiverClass =
      typeof to !== "string"
        ? to
        : receiver === "self.class"
          ? (owner as { constructor?: unknown }).constructor
          : undefined;

    for (const method of methods) {
      const methodName = `${methodPrefix}${method}`;
      methodNames.push(methodName);

      const resolve = (self: Record<string, unknown>): unknown => {
        const _ = receiver.startsWith("::")
          ? constantize(receiver)
          : receiverValue(self, receiverName);
        if (_ == null && !Object.hasOwn(NilClass, method)) {
          if (allowNil) return undefined;
          throw DelegationError.nilTarget(methodName, receiver);
        }
        return _;
      };

      if (/[^\]]=$/.test(method)) {
        const attr = method.slice(0, -1);
        Object.defineProperty(owner, methodName.slice(0, -1), {
          configurable: true,
          enumerable: false,
          set(this: Record<string, unknown>, arg: unknown) {
            const _ = resolve(this);
            if (_ != null) (_ as Record<string, unknown>)[attr] = arg;
          },
        });
        continue;
      }

      const value = function (this: Record<string, unknown>, ...args: unknown[]) {
        const _ = resolve(this);
        if (_ == null)
          return Object.hasOwn(NilClass, method) ? NilClass[method].apply(null, args) : undefined;
        if (!(method in Object(_))) {
          throw new NoMethodError(`undefined method '${method}' for ${String(_)}`);
        }
        const member = (_ as Record<string, unknown>)[method];
        return typeof member === "function" ? member.apply(_, args) : member;
      };
      const methodObject = (receiverClass as Record<string, unknown> | undefined)?.[method];
      if (typeof methodObject === "function") {
        Object.defineProperty(value, "length", { value: methodObject.length });
      }
      Object.defineProperty(owner, methodName, {
        configurable: true,
        enumerable: false,
        writable: true,
        value,
      });
    }

    return methodNames;
  }

  export function generateMethodMissing<T extends object>(
    owner: T,
    target: string,
    { allowNil }: { allowNil?: boolean } = {},
  ): T {
    if (RESERVED_METHOD_NAMES.has(target) || target === "__target") target = `self.${target}`;

    const targetName = target.startsWith("self.") ? target.slice("self.".length) : target;

    return new Proxy(owner, {
      has(obj, prop) {
        if (prop === "marshal_dump" || prop === "_dump") return false;
        if (Reflect.has(obj, prop)) return true;
        const __target = (obj as Record<string, unknown>)[targetName];
        return __target != null && prop in Object(__target);
      },
      get(obj, prop, receiver) {
        if (prop in obj || typeof prop === "symbol") {
          return Reflect.get(obj, prop, receiver);
        }
        const __target = (obj as Record<string, unknown>)[targetName];
        if (__target == null) {
          if (allowNil) return undefined;
          throw DelegationError.nilTarget(globalThis.String(prop), target);
        }
        if (!(globalThis.String(prop) in Object(__target))) {
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
