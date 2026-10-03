import { Concern, extend, include, included, initialize, Module } from "@blazetrails/activesupport";
import {
  rbModAncestors,
  rbModInstanceMethod,
  rbModPublicMethodDefined,
} from "@blazetrails/ruby-compat";

interface SerializeCastValueHost {
  constructor: { serializeCastValueCompatible(): boolean };
}

interface SerializeCastValueType {
  serializeCastValue(value: unknown): unknown;
  serialize(value: unknown): unknown;
}

export const SerializeCastValue = new Module() as Module & {
  ClassMethods: typeof ClassMethods;
  DefaultImplementation: Module;
  [included](klass: { prototype: object }): void;
  serialize(type: SerializeCastValueType, value: unknown): unknown;
  [initialize](this: SerializeCastValueHost): void;
};
extend(SerializeCastValue, Concern);

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

SerializeCastValue.ClassMethods = ClassMethods;
SerializeCastValue.DefaultImplementation = DefaultImplementation;

SerializeCastValue[included] = function (klass: { prototype: object }): void {
  if (!rbModPublicMethodDefined(klass, "serializeCastValue")) {
    include(klass, DefaultImplementation);
  }
};

export function serialize(type: SerializeCastValueType, value: unknown): unknown {
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
SerializeCastValue.serialize = serialize;

export function itselfIfSerializeCastValueCompatible<T extends SerializeCastValueHost>(
  this: T,
): T | null {
  if (this.constructor.serializeCastValueCompatible()) return this;
  return null;
}
SerializeCastValue.defineMethod(
  "itselfIfSerializeCastValueCompatible",
  itselfIfSerializeCastValueCompatible,
);

SerializeCastValue[initialize] = function (this: SerializeCastValueHost): void {
  this.constructor.serializeCastValueCompatible();
};
