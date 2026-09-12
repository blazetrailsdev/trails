import { ArgumentError } from "./argument-error.js";
import { methodMissingProxy } from "./method-missing-proxy.js";

/**
 * `DelegateClass(superclass)` (`vendor/ruby/lib/delegate.rb:394-443`) — builds a
 * class that forwards to a wrapped object, the way
 * `ActiveRecord::Type::Serialized < DelegateClass(ActiveModel::Type::Value)`
 * (`activerecord/lib/active_record/type/serialized.rb:5`) asks for.
 *
 * Ruby builds it from two halves and both are here. `define_method(method,
 * Delegator.delegating_block(method))` (`delegate.rb:413-418`) generates one
 * forwarding member per public and protected instance method of `superclass`,
 * so a name `superclass` declares reaches `__getobj__` rather than running
 * `superclass`'s own body against the wrapper; and the class inherits
 * `Delegator#method_missing` (`delegate.rb:82-93`), which forwards any other
 * name the delegate answers.
 *
 * Ruby's class extends `Delegator` and gets the superclass's API only through
 * those generated members (`delegate.rb:395`). This one extends `superclass`
 * itself, because TypeScript has no structural stand-in for Ruby's duck typing:
 * callers narrow with `instanceof`, so a delegator that is not an instance of
 * what it delegates to is not usable as one. The generated members sit on the
 * class's own prototype, between the subclass and `superclass`, which is the
 * ancestor position — and therefore the precedence — they hold in Ruby.
 *
 * `@delegate_dc_obj` (`delegate.rb:405`) is a plain `_`-prefixed property rather
 * than a `#private` field: a `#` field is unreachable through the
 * `method_missing` Proxy, whose `get` rebinds the receiver
 * (see CLAUDE.md, "Method visibility is not a runtime fact in JS").
 *
 * @noRailsEquivalent PERMANENT
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2545: a mixin base's constructor rest parameter must be typed `any[]`.
export function DelegateClass<T extends new (...args: any[]) => object>(
  superclass: T,
): new (obj: unknown) => InstanceType<T> {
  const klass = class extends superclass {
    _delegateDcObj: unknown;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2545, as above.
    constructor(...args: any[]) {
      super();
      this.__setobj__(args[0] as unknown);
      return methodMissingProxy(this, { delegate: (self) => self.__getobj__() });
    }

    __getobj__(): unknown {
      return this._delegateDcObj;
    }

    __setobj__(obj: unknown): void {
      if ((this as unknown) === obj) throw new ArgumentError("cannot delegate to self");
      this._delegateDcObj = obj;
    }
  };

  const ignores = new Set(["constructor", "toString", "inspect"]);
  for (const method of Object.getOwnPropertyNames(superclass.prototype)) {
    if (ignores.has(method) || method.startsWith("_")) continue;
    const descriptor = Object.getOwnPropertyDescriptor(superclass.prototype, method)!;
    if (descriptor.get) {
      Object.defineProperty(klass.prototype, method, {
        configurable: true,
        get(this: InstanceType<typeof klass>): unknown {
          return (this.__getobj__() as Record<string, unknown>)[method];
        },
      });
    } else if (typeof descriptor.value === "function") {
      Object.defineProperty(klass.prototype, method, {
        configurable: true,
        writable: true,
        value(this: InstanceType<typeof klass>, ...args: unknown[]): unknown {
          const target = this.__getobj__() as Record<string, (...a: unknown[]) => unknown>;
          return target[method](...args);
        },
      });
    }
  }

  return klass as unknown as new (obj: unknown) => InstanceType<T>;
}
