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

export namespace ClassAttribute {
  export function redefine(owner: any, name: string, namespacedName: string, value: unknown): void {
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
