/**
 * Delegation — delegate method calls to another object.
 * Mirrors ActiveSupport::Delegation and ActiveSupport::DelegationError.
 */

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
  to: string;
  prefix?: boolean | string;
  allowNil?: boolean;
}

export namespace Delegation {
  /**
   * Mirrors: `ActiveSupport::Delegation.generate`
   * (`activesupport/lib/active_support/delegation.rb:23-158`). Ruby builds the
   * delegator bodies as source and `module_eval`s them; TS defines them as
   * properties on `owner`, so the `location` / `signature` / `nilable` /
   * `private` / `as` keywords — all of which exist to shape that generated
   * source or its `def` visibility — have no TS counterpart and are omitted.
   */
  export function generate<T extends object>(
    owner: T,
    methods: string[],
    options: DelegateOptions,
  ): string[] {
    const { to, prefix, allowNil } = options;

    if (!to) {
      throw new Error(
        "Delegation needs a target. Supply a keyword argument 'to' (e.g. delegate :hello, to: :greeter).",
      );
    }

    if (prefix === true && /^[^a-z_]/.test(to)) {
      throw new Error(
        "Can only automatically set the delegation prefix when delegating to a method.",
      );
    }

    const methodPrefix = prefix ? `${prefix === true ? to : prefix}_` : "";

    const methodNames: string[] = [];

    for (const method of methods) {
      const methodName = `${methodPrefix}${method}`;
      methodNames.push(methodName);

      Object.defineProperty(owner, methodName, {
        configurable: true,
        enumerable: false,
        writable: true,
        value(...args: unknown[]) {
          const _ = (this as Record<string, unknown>)[to];
          if (_ == null) {
            if (allowNil) return undefined;
            throw DelegationError.nilTarget(methodName, to);
          }
          const member = (_ as Record<string, unknown>)[method];
          // Ruby's `_.method(...)` is a call either way, because a Ruby
          // attr_reader IS a method. A trails reader is a property (CLAUDE.md,
          // "Generated attribute readers are properties"), so the delegator
          // calls what is callable and reads what is not.
          return typeof member === "function" ? member.apply(_, args) : member;
        },
      });
    }

    return methodNames;
  }

  export function generateMethodMissing<T extends object>(
    target: T,
    delegateTo: string,
    options: { allowNil?: boolean } = {},
  ): T {
    return new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop in obj || typeof prop === "symbol") {
          return Reflect.get(obj, prop, receiver);
        }
        const delegate = (obj as Record<string, unknown>)[delegateTo];
        if (delegate == null) {
          if (options.allowNil) return undefined;
          throw DelegationError.nilTarget(globalThis.String(prop), delegateTo);
        }
        const val = (delegate as Record<string, unknown>)[globalThis.String(prop)];
        if (typeof val === "function") {
          return val.bind(delegate);
        }
        return val;
      },
    });
  }
}
