import { extend, include, included, initialize, Module } from "@blazetrails/activesupport";
import {
  rbModAncestors,
  rbModInstanceMethod,
  rbModPublicMethodDefined,
} from "@blazetrails/ruby-compat";

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
    const ancestors = rbModAncestors(this);
    const compatible =
      ancestors.indexOf(rbModInstanceMethod(this, "serializeCastValue").owner) <=
      ancestors.indexOf(rbModInstanceMethod(this, "serialize").owner);
    Object.defineProperty(this, "_serializeCastValueCompatible", {
      value: compatible,
      writable: true,
      configurable: true,
    });
    return compatible;
  },
};

export const DefaultImplementation = new Module().include({
  serializeCastValue(value: unknown): unknown {
    return value;
  },
});

export class SerializeCastValue {
  static [included](klass: { prototype: object }): void {
    extend(klass, ClassMethods);
    if (!rbModPublicMethodDefined(klass, "serializeCastValue")) {
      include(klass, DefaultImplementation);
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
