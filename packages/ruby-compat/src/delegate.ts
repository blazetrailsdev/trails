import { ArgumentError } from "./argument-error.js";
import { methodMissingProxy } from "./method-missing-proxy.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2545: a mixin base's constructor rest parameter must be typed `any[]`.
type MixinBase = new (...args: any[]) => object;

type Delegating<T extends MixinBase> = new (obj: unknown) => InstanceType<T> & {
  __getobj__(): unknown;
  __setobj__(obj: unknown): void;
};

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
 * Extending also forces a `super()` call, which JS requires before `this` in a
 * derived constructor. Ruby never runs `superclass#initialize`: its class is
 * `Class.new(Delegator)` and `Delegator#initialize` only stores the delegate
 * (`:75-77,394-411`). So `superclass`'s constructor runs here, on a wrapper
 * that will forward every read anyway, and a `superclass` whose constructor
 * requires an argument or has side effects is out of range — see
 * `delegate-class-must-not-construct-the-delegated-superclass`. `super()` is
 * passed no arguments for that reason, and `ValueType`'s constructor
 * (`activemodel/lib/active_model/type/value.rb:17`) takes only optional kwargs.
 *
 * Ruby reads `superclass.public_instance_methods` and
 * `protected_instance_methods` (`delegate.rb:397-400`), whose `all` default is
 * true, so both sets include what `superclass` INHERITS. The JS walk therefore
 * climbs the prototype chain, not just `superclass.prototype`, and the first
 * definition it meets wins — the same nearest-ancestor lookup Ruby's method
 * resolution performs.
 *
 * It stops at `Object.prototype` because `ignores` (`:396`) subtracts
 * `Delegator.public_api`, which is every `::Object` public method
 * (`:242-245`); what is left of that list is `to_s` / `inspect`, and its
 * `=~`, `!~` and `===` have no JS spelling. Ruby takes public and protected
 * but never private, and a `_`-prefixed name is how trails spells private —
 * the same reading `methodMissingProxy` takes of `respond_to?`. A TS
 * `protected` member carries no prefix and is an ordinary prototype property,
 * so it is walked and forwarded, as Ruby's protected set is.
 *
 * A Ruby `attr_accessor` is two methods, `foo` and `foo=`, so both land in
 * `public_instance_methods` and both get a forwarder. A JS accessor carries
 * both halves in ONE descriptor, so a descriptor with a `set` gets a
 * forwarding setter beside its getter — dropping it would drop the `foo=`
 * forwarder Ruby generates.
 *
 * `block` is Ruby's `&block`, `module_eval`'d on the generated class
 * (`:394,442`); `call` supplies the class as `this`, which is the `self`
 * `module_eval` binds. The five `define_singleton_method` reflection overrides
 * that union the superclass's method lists into the generated class's
 * (`:421-440`) need no port: this class extends `superclass`, so JS reflection
 * already walks through to those members.
 *
 * `@delegate_dc_obj` (`delegate.rb:405`) is a plain `_`-prefixed property rather
 * than a `#private` field: a `#` field is unreachable through the
 * `method_missing` Proxy, whose `get` rebinds the receiver
 * (see CLAUDE.md, "Method visibility is not a runtime fact in JS").
 *
 * @noRailsEquivalent PERMANENT
 */
export function DelegateClass<T extends MixinBase>(
  superclass: T,
  block?: (this: Delegating<T>) => void,
): Delegating<T> {
  const klass = class extends superclass {
    declare _delegateDcObj: unknown;

    constructor(...args: ConstructorParameters<MixinBase>) {
      super();
      this.__setobj__(args[0] as unknown);
      return methodMissingProxy(this, { delegate: (self) => self.__getobj__() });
    }

    __getobj__(): unknown {
      if (!("_delegateDcObj" in this)) throw new ArgumentError("not delegated");
      return this._delegateDcObj;
    }

    __setobj__(obj: unknown): void {
      if ((this as unknown) === obj) throw new ArgumentError("cannot delegate to self");
      this._delegateDcObj = obj;
    }
  };

  const ignores = new Set(["constructor", "toString", "inspect"]);
  for (
    let proto: object | null = superclass.prototype as object;
    proto !== null && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (ignores.has(method) || method.startsWith("_")) continue;
      if (Object.hasOwn(klass.prototype, method)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, method)!;
      if (descriptor.get || descriptor.set) {
        Object.defineProperty(klass.prototype, method, {
          configurable: true,
          ...(descriptor.get && {
            get(this: InstanceType<typeof klass>): unknown {
              return (this.__getobj__() as Record<string, unknown>)[method];
            },
          }),
          ...(descriptor.set && {
            set(this: InstanceType<typeof klass>, value: unknown): void {
              (this.__getobj__() as Record<string, unknown>)[method] = value;
            },
          }),
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
  }

  block?.call(klass as unknown as Delegating<T>);

  return klass as unknown as Delegating<T>;
}
