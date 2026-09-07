import { ArgumentError, NoMethodError } from "@blazetrails/ruby-compat";
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
