import {
  CLASS_METHOD_TABLE,
  Module,
  TypeError,
  rbClassAttachedObject,
  rbObjIsKindOf,
  rbModSingletonP,
  rbClearMethodCache,
} from "@blazetrails/ruby-compat";

export interface ClassAttributeOptions {
  instanceAccessor?: boolean;
  instanceReader?: boolean;
  instanceWriter?: boolean;
  instancePredicate?: boolean;
  default?: unknown;
}

type Slots = Record<string, unknown>;
type AttributeOwner = abstract new (...args: never) => unknown;
type AttributeInstance = Slots & { constructor: Slots };

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

export namespace ClassAttribute {
  /**
   * @perf 11ms — PERMANENT
   * @missingRailsCall redefine_method — PERMANENT
   */
  export function redefine(
    owner: AttributeOwner,
    name: string,
    namespacedName: string,
    value: unknown,
  ): void {
    if (rbModSingletonP(owner)) {
      const attachedObject = rbClassAttachedObject(owner);
      if (rbObjIsKindOf(attachedObject, Module)) {
        redefineMethod(owner.prototype, namespacedName, true, () => value);
      } else {
        redefineMethod(owner.prototype, name, false, () => value);
      }
    }

    Object.defineProperty(owner, namespacedName, {
      get: () => value,
      set(this: AttributeOwner, newValue: unknown) {
        if (owner === this) {
          value = newValue;
        } else {
          ClassAttribute.redefine(this, name, namespacedName, newValue);
        }
      },
      configurable: true,
      enumerable: false,
    });
  }

  export function redefineMethod(
    owner: object,
    name: string,
    isPrivate: boolean,
    fn: () => unknown,
  ): void {
    Object.defineProperty(owner, name, {
      get: fn,
      configurable: true,
      enumerable: !isPrivate,
    });
  }
}

/** @missingRailsName default — PERMANENT */
export function classAttribute(this: object, ...attrs: (string | ClassAttributeOptions)[]): void {
  const last = attrs[attrs.length - 1];
  const options: ClassAttributeOptions =
    typeof last === "object" && last !== null ? (attrs.pop() as ClassAttributeOptions) : {};
  const {
    instanceAccessor = true,
    instanceReader = instanceAccessor,
    instanceWriter = instanceAccessor,
    instancePredicate = true,
    default: defaultValue = null,
  } = options;

  for (const name of attrs as string[]) {
    if (typeof name !== "string") {
      throw new TypeError(`${inspect(name)} is not a symbol nor a string`);
    }

    const namespacedName = `__class_attr_${name}`;
    ClassAttribute.redefine(this as AttributeOwner, name, namespacedName, defaultValue);

    const delegators: PropertyDescriptor = {
      configurable: true,
      enumerable: false,
      get(this: Slots) {
        return this[namespacedName];
      },
      set(this: Slots, value: unknown) {
        this[namespacedName] = value;
      },
    };

    Object.defineProperty(this, name, delegators);
    const methods: PropertyDescriptor = { configurable: true, enumerable: false };
    if (rbModSingletonP(this)) {
      Object.assign(methods, delegators);
    } else if (instanceReader) {
      methods.get = function (this: AttributeInstance) {
        if (Object.hasOwn(this, `@${name}`)) {
          return this[`@${name}`];
        } else {
          return this.constructor[name];
        }
      };
    }

    if (instanceWriter) {
      methods.set = function (this: Slots, value: unknown) {
        this[`@${name}`] = value;
      };
    }
    if (methods.get || methods.set)
      Object.defineProperty((this as AttributeOwner).prototype, name, methods);
    rbClearMethodCache();

    if (instancePredicate) {
      const lead = /^_*/.exec(name)![0];
      const bare = name.slice(lead.length);
      const predicateName = `${lead}is${bare.charAt(0).toUpperCase()}${bare.slice(1)}`;
      ClassAttribute.redefineMethod(this, predicateName, false, function (this: Slots) {
        return this[name] != null && this[name] !== false;
      });
      if (instanceReader) {
        ClassAttribute.redefineMethod(
          (this as AttributeOwner).prototype,
          predicateName,
          false,
          function (this: Slots) {
            return this[name] != null && this[name] !== false;
          },
        );
      }
    }
  }
}

CLASS_METHOD_TABLE.classAttribute = function (
  self: object,
  ...attrs: (string | ClassAttributeOptions)[]
): void {
  classAttribute.call(self, ...attrs);
};
