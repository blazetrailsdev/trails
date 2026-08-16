/**
 * classAttribute — mirroring Rails' class_attribute.
 *
 * Creates inheritable class-level attributes with optional instance
 * reader/writer and predicate methods.
 */

export interface ClassAttributeOptions {
  instanceAccessor?: boolean;
  instanceReader?: boolean;
  instanceWriter?: boolean;
  instancePredicate?: boolean;
  default?: unknown;
}

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/**
 * A Ruby class's singleton class holds its class methods; in JS those live on
 * the constructor itself, and the constructor's prototype chain gives the same
 * inheritance, so `owner.singleton_class` is the owner.
 */
export namespace ClassAttribute {
  export function redefine(owner: any, name: string, namespacedName: string, value: unknown): void {
    // Rails' `if owner.singleton_class?` arm has no JS counterpart: there is no
    // singleton class to reopen, and no attached object to test for a Module.
    redefineMethod(owner, namespacedName, true, () => value);

    redefineMethod(owner, `${namespacedName}=`, true, function (this: any, newValue: unknown) {
      if (owner === this) {
        value = newValue;
      } else {
        ClassAttribute.redefine(this, name, namespacedName, newValue);
      }
    });
  }

  export function redefineMethod(
    owner: any,
    name: string,
    isPrivate: boolean,
    fn: (...args: any[]) => unknown,
  ): void {
    // A zero-arg Ruby reader is a JS getter and a Ruby `name=` writer is a JS
    // setter; both are `define_method` on the Ruby side. Ruby's two methods are
    // one JS property, so the writer keeps whatever reader is already there.
    const isWriter = name.endsWith("=");
    const key = isWriter ? name.slice(0, -1) : name;
    const existing = isWriter ? Object.getOwnPropertyDescriptor(owner, key) : undefined;
    Object.defineProperty(owner, key, {
      get: isWriter ? existing?.get : (fn as () => unknown),
      set: isWriter ? (fn as (value: unknown) => void) : undefined,
      configurable: true,
      enumerable: !isPrivate,
    });
  }
}

/**
 * Define a class-level attribute that is inherited by subclasses.
 * Reads walk the constructor chain; writes are local to the class/instance.
 *
 * Rails defines this on Module (core_ext/class/attribute.rb:86), so the class
 * being extended is `self` — here the `this`-typed mixin idiom (CLAUDE.md,
 * _Module mixins_), which callers reach with `classAttribute.call(Klass, ...)`.
 */
export function classAttribute(this: any, ...attrs: (string | ClassAttributeOptions)[]): void {
  const last = attrs[attrs.length - 1];
  const options: ClassAttributeOptions =
    typeof last === "object" && last !== null ? (attrs.pop() as ClassAttributeOptions) : {};
  const {
    instanceAccessor = true,
    instanceReader = instanceAccessor,
    instanceWriter = instanceAccessor,
    instancePredicate = true,
    default: defaultValue,
  } = options;

  for (const name of attrs as string[]) {
    if (typeof name !== "string") {
      // Ruby's core TypeError, exactly as attribute.rb:91 raises it — there is
      // no Rails error class to port here.
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError(`${inspect(name)} is not a symbol nor a string`);
    }

    const namespacedName = `__class_attr_${name}`;
    ClassAttribute.redefine(this, name, namespacedName, defaultValue);

    Object.defineProperty(this, name, {
      configurable: true,
      enumerable: false,
      get(this: any) {
        return this[namespacedName];
      },
      set(this: any, value: unknown) {
        this[namespacedName] = value;
      },
    });

    if (instanceReader || instanceWriter) {
      const descriptor: PropertyDescriptor = { configurable: true, enumerable: false };
      if (instanceReader) {
        descriptor.get = function (this: any) {
          if (Object.prototype.hasOwnProperty.call(this, `@${name}`)) {
            return this[`@${name}`];
          } else {
            return this.constructor[name];
          }
        };
      }
      if (instanceWriter) {
        descriptor.set = function (this: any, value: unknown) {
          this[`@${name}`] = value;
        };
      }
      Object.defineProperty(this.prototype, name, descriptor);
    }

    if (instancePredicate) {
      const predicateName = `is${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      ClassAttribute.redefineMethod(this, predicateName, false, function (this: any) {
        return !!this[name];
      });
      if (instanceReader) {
        ClassAttribute.redefineMethod(this.prototype, predicateName, false, function (this: any) {
          return !!this[name];
        });
      }
    }
  }
}
