/**
 * classAttribute — mirroring Rails' class_attribute.
 *
 * Creates inheritable class-level attributes with optional instance
 * reader/writer and predicate methods.
 */

export interface ClassAttributeOptions {
  instanceWriter?: boolean;
  instanceReader?: boolean;
  instancePredicate?: boolean;
  default?: unknown;
}

const CLASS_ATTRS = Symbol("classAttributes");

interface AttrStore {
  values: Map<string, unknown>;
}

function getStore(target: any): AttrStore {
  if (!Object.prototype.hasOwnProperty.call(target, CLASS_ATTRS)) {
    target[CLASS_ATTRS] = { values: new Map() };
  }
  return target[CLASS_ATTRS];
}

/**
 * Define a class-level attribute that is inherited by subclasses.
 * Reads walk the prototype chain; writes are local to the class/instance.
 */
export function classAttribute(
  klass: any,
  name: string,
  options: ClassAttributeOptions = {},
): void {
  const {
    instanceWriter = true,
    instanceReader = true,
    instancePredicate = false,
    default: defaultValue,
  } = options;

  // Set default value on the class
  if (defaultValue !== undefined) {
    getStore(klass).values.set(name, defaultValue);
  }

  // Class-level getter/setter
  Object.defineProperty(klass, name, {
    get() {
      // Walk prototype chain for inherited values
      let current = this;
      while (current) {
        const store = current[CLASS_ATTRS] as AttrStore | undefined;
        if (store?.values.has(name)) {
          return store.values.get(name);
        }
        current = Object.getPrototypeOf(current);
      }
      return undefined;
    },
    set(value: unknown) {
      getStore(this).values.set(name, value);
    },
    configurable: true,
  });

  // Instance-level reader
  if (instanceReader) {
    Object.defineProperty(klass.prototype, name, {
      get() {
        // Check instance-level override first
        const instanceStore = this[CLASS_ATTRS] as AttrStore | undefined;
        if (instanceStore?.values.has(name)) {
          return instanceStore.values.get(name);
        }
        // Fall back to class-level value
        return this.constructor[name];
      },
      set: instanceWriter
        ? function (this: any, value: unknown) {
            getStore(this).values.set(name, value);
          }
        : undefined,
      configurable: true,
    });
  }

  // Instance predicate (name + "?"-like, we use `isName` in TS)
  if (instancePredicate) {
    const predicateName = `is${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    Object.defineProperty(klass.prototype, predicateName, {
      get() {
        return !!this[name];
      },
      configurable: true,
    });
  }
}
