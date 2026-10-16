import { ArgumentError } from "./argument-error.js";
import { rbDefineAllocFunc } from "./include.js";
import { methodMissingProxy } from "./method-missing-proxy.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { rbObjInstanceVariables, rbObjIvarGet, rbObjIvarSet } from "./object.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS2545: a mixin base's constructor rest parameter must be typed `any[]`.
type MixinBase = new (...args: any[]) => object;

type Delegating<T extends MixinBase> = new (obj: unknown) => InstanceType<T> & {
  __getobj__(): InstanceType<T>;
  __setobj__(obj: unknown): void;
};

/**
 * `DelegateClass(superclass)` (`vendor/ruby/v3.3.11/lib/delegate.rb:394-443`) — builds a
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
 * those generated members (`delegate.rb:395`). This one extends `delegator`, a
 * no-op constructor whose `prototype` is `superclass.prototype` and whose own
 * prototype is `superclass`, because TypeScript has no structural stand-in for
 * Ruby's duck typing: callers narrow with `instanceof`, so a delegator that is
 * not an instance of what it delegates to is not usable as one. The generated
 * members sit on the class's own prototype, directly above
 * `superclass.prototype`, which is the ancestor position — and therefore the
 * precedence — they hold in Ruby.
 *
 * Extending does not construct `superclass`: Ruby's class is
 * `Class.new(Delegator)` and `Delegator#initialize` only stores the delegate
 * (`:75-77,394-411`). The class therefore extends a constructor that does
 * nothing but shares `superclass.prototype` (and inherits its statics), so
 * `super()` runs no `superclass` constructor while `instanceof superclass`
 * still holds.
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
 * `=~`, `!~` and `===` have no JS spelling. Ruby undefines `to_s` on
 * `Delegator` (`:47-49`) so it reaches the delegate through `method_missing`;
 * `Object.prototype.toString` is always found first here, so `toString`
 * forwards explicitly. Ruby takes public and protected
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
 * (`:421-440`) need no port: they list INSTANCE methods, and an instance
 * member lookup on this class walks its prototype chain through
 * `superclass.prototype`, so JS reflection already reaches those members.
 * Static members resolve separately, through the constructor chain
 * `klass -> delegator -> superclass` that `Object.setPrototypeOf` links.
 *
 * `@delegate_dc_obj` (`delegate.rb:405`) is a plain `delegateDcObj` property rather
 * than a `#private` field: a `#` field is unreachable through the
 * `method_missing` Proxy, whose `get` rebinds the receiver
 * (see CLAUDE.md, "Method visibility is compile-time only").
 *
 * @noRailsEquivalent PERMANENT
 */
export function DelegateClass<T extends MixinBase>(
  superclass: T,
  block?: (this: Delegating<T>) => void,
): Delegating<T> {
  const delegator = function () {} as unknown as T;
  Object.setPrototypeOf(delegator, superclass);
  delegator.prototype = superclass.prototype;
  const klass = class extends delegator {
    declare delegateDcObj: unknown;

    constructor(...args: ConstructorParameters<MixinBase>) {
      super();
      this.__setobj__(args[0] as unknown);
      return methodMissingProxy(this, { delegate: (self) => self.__getobj__() });
    }

    __getobj__(): unknown {
      if (!("delegateDcObj" in this)) throw new ArgumentError("not delegated");
      return this.delegateDcObj;
    }

    __setobj__(obj: unknown): void {
      if ((this as unknown) === obj) throw new ArgumentError("cannot delegate to self");
      this.delegateDcObj = obj;
    }

    toString(): string {
      return String(this.__getobj__());
    }
  };

  Object.defineProperty(klass.prototype, "marshalDump", {
    configurable: true,
    writable: true,
    value: Delegator.prototype.marshalDump,
  });
  Object.defineProperty(klass.prototype, "marshalLoad", {
    configurable: true,
    writable: true,
    value: Delegator.prototype.marshalLoad,
  });

  Object.defineProperty(klass.prototype, Symbol.for("@blazetrails/ruby-compat:delegateClass"), {
    value: true,
  });

  rbDefineAllocFunc(klass, (klass) =>
    methodMissingProxy(Object.create(klass.prototype) as InstanceType<typeof klass>, {
      delegate: (self) => ("delegateDcObj" in self ? self.__getobj__() : undefined),
    }),
  );

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

/**
 * `Delegator` (`vendor/ruby/v3.3.11/lib/delegate.rb:39-246`) — the abstract
 * class whose `method_missing` (`:82-93`) forwards every name the delegate
 * answers, and whose `respond_to_missing?` (`:99-108`) answers for them. Both
 * are the `get` and `has` traps of `methodMissingProxy`, read through
 * `__getobj__` on every access.
 *
 * Nothing of the delegate is on its ancestor chain (`class Delegator <
 * BasicObject`, `:39`): `is_a?(delegate.class)` is false, `respond_to?` true.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Delegator {
  /** @noRailsEquivalent PERMANENT */
  constructor(obj: unknown) {
    this.__setobj__(obj);
    return methodMissingProxy(this, { delegate: (self) => self.__getobj__(() => undefined) });
  }

  /** `Delegator#__getobj__` (`vendor/ruby/v3.3.11/lib/delegate.rb:190-192`). */
  // eslint-disable-next-line unused-imports/no-unused-vars -- Ruby's implicit block, which the overrides yield to.
  __getobj__(block?: () => unknown): unknown {
    throw new NotImplementedError("need to define `__getobj__'");
  }

  /** `Delegator#__setobj__` (`vendor/ruby/v3.3.11/lib/delegate.rb:198-200`). */
  // eslint-disable-next-line unused-imports/no-unused-vars -- the abstract method names the parameter its overrides take.
  __setobj__(obj: unknown): void {
    throw new NotImplementedError("need to define `__setobj__'");
  }

  /**
   * `Delegator#marshal_dump` (`vendor/ruby/v3.3.11/lib/delegate.rb:203-210`). `@delegate_dc_obj`
   * and `@delegate_sd_obj` are spelled `@delegateDcObj` and `@delegateSdObj`.
   *
   * @noRailsEquivalent PERMANENT
   */
  marshalDump(): unknown[] {
    const ivars = rbObjInstanceVariables(this).filter((v) => !/^@delegate[A-Z]/.test(v));
    return [":__v2__", ivars, ivars.map((v) => rbObjIvarGet(this, v)), this.__getobj__()];
  }

  /**
   * `Delegator#marshal_load` (`vendor/ruby/v3.3.11/lib/delegate.rb:215-223`).
   *
   * @noRailsEquivalent PERMANENT
   */
  marshalLoad(data: unknown): void {
    const [version, vars, values, obj] = (Array.isArray(data) ? data : [data]) as [
      unknown,
      string[],
      unknown[],
      unknown,
    ];
    if (version === ":__v2__") {
      vars.forEach((v, i) => rbObjIvarSet(this, v, values[i]));
      this.__setobj__(obj);
    } else {
      this.__setobj__(data);
    }
  }
}

/**
 * `SimpleDelegator` (`vendor/ruby/v3.3.11/lib/delegate.rb:318-343`), whose
 * `@delegate_sd_obj` is a plain property as `DelegateClass`'s `delegateDcObj` is.
 *
 * @noRailsEquivalent PERMANENT
 */
export class SimpleDelegator extends Delegator {
  /** @noRailsEquivalent PERMANENT */
  declare delegateSdObj: unknown;

  /** `SimpleDelegator#__getobj__` (`vendor/ruby/v3.3.11/lib/delegate.rb:320-326`). */
  override __getobj__(block?: () => unknown): unknown {
    if (!Object.hasOwn(this, "delegateSdObj")) {
      if (block) return block();
      throw new ArgumentError("not delegated");
    }
    return this.delegateSdObj;
  }

  /** `SimpleDelegator#__setobj__` (`vendor/ruby/v3.3.11/lib/delegate.rb:340-343`). */
  override __setobj__(obj: unknown): void {
    if ((this as unknown) === obj) throw new ArgumentError("cannot delegate to self");
    this.delegateSdObj = obj;
  }
}
