import { extend, include, included, initialize, Module } from "@blazetrails/activesupport";
import { NameError, rbModPublicMethodDefined, rbModToS } from "@blazetrails/ruby-compat";

interface SerializeCastValueHost {
  constructor: { serializeCastValueCompatible(): boolean };
}

export const ClassMethods = {
  serializeCastValueCompatible(this: {
    prototype: object;
    _serializeCastValueCompatible?: boolean;
  }): boolean {
    if (Object.hasOwn(this, "_serializeCastValueCompatible")) {
      return this._serializeCastValueCompatible as boolean;
    }
    const ancestors: object[] = [];
    for (
      let proto: object | null = this.prototype;
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      ancestors.push(proto);
    }
    const instanceMethod = (name: string): { owner: object } => {
      const owner = ancestors.find((proto) => Object.prototype.hasOwnProperty.call(proto, name));
      if (owner === undefined) {
        throw new NameError(
          `undefined method '${name}' for class '${rbModToS(this as unknown as new () => unknown)}'`,
          name,
        );
      }
      return { owner };
    };
    const compatible =
      ancestors.indexOf(instanceMethod("serializeCastValue").owner) <=
      ancestors.indexOf(instanceMethod("serialize").owner);
    Object.defineProperty(this, "_serializeCastValueCompatible", {
      value: compatible,
      writable: true,
      configurable: true,
    });
    return compatible;
  },
};

export const DefaultImplementation = {
  serializeCastValue(value: unknown): unknown {
    return value;
  },
};

const defaultImplementation = new Module().include(DefaultImplementation);

export class SerializeCastValue {
  static [included](klass: { prototype: object }): void {
    extend(klass, ClassMethods);
    if (!rbModPublicMethodDefined(klass, "serializeCastValue")) {
      include(klass, defaultImplementation);
    }
  }

  static serialize(
    type: { serializeCastValue(value: unknown): unknown; serialize(value: unknown): unknown },
    value: unknown,
  ): unknown {
    let compatible: unknown;
    try {
      compatible = (
        type as unknown as { itselfIfSerializeCastValueCompatible(): unknown }
      ).itselfIfSerializeCastValueCompatible();
    } catch {
      compatible = null;
    }
    if (type === compatible) {
      return type.serializeCastValue(value);
    } else {
      return type.serialize(value);
    }
  }

  itselfIfSerializeCastValueCompatible<T extends SerializeCastValueHost>(this: T): T | null {
    if (this.constructor.serializeCastValueCompatible()) return this;
    return null;
  }

  static [initialize](this: SerializeCastValueHost): void {
    this.constructor.serializeCastValueCompatible();
  }
}
