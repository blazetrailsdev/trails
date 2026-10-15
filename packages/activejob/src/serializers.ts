import { Autoload, extend, mattrAccessor, safeConstantize } from "@blazetrails/activesupport";
import {
  ArgumentError,
  hashAref,
  rtest,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { ActiveJob, loadPath, type AutoloadModule, type SerializerLike } from "./namespaces.js";
import type { ObjectSerializer } from "./serializers/object-serializer.js";

export const Serializers = { name: "ActiveJob::Serializers", loadPath } as AutoloadModule & {
  _additionalSerializers: Set<SerializerLike>;
  serialize: typeof serialize;
  deserialize: typeof deserialize;
  serializers: typeof serializers;
  addSerializers: typeof addSerializers;
  ObjectSerializer: typeof ObjectSerializer;
};
extend(Serializers, Autoload);

Serializers.autoload("ObjectSerializer");

mattrAccessor.call(Serializers, "_additionalSerializers");
Serializers._additionalSerializers = new Set();

export function serialize(argument: unknown): unknown {
  const serializer = [...serializers()].find((s) => s.isSerialize(argument));
  if (!serializer) {
    throw new ActiveJob.SerializationError(
      `Unsupported argument type: ${rbModName(rbObjClass(argument))}`,
    );
  }
  return serializer.serialize(argument);
}

export function deserialize(argument: Record<string, unknown> | Map<string, unknown>): unknown {
  const serializerName = hashAref(argument, ActiveJob.Arguments.OBJECT_SERIALIZER_KEY);
  if (!rtest(serializerName)) {
    throw new ArgumentError(
      `Serializer name is not present in the argument: ${rbInspect(argument)}`,
    );
  }

  const serializer = safeConstantize(serializerName as string) as SerializerLike | null;
  if (serializer == null) throw new ArgumentError(`Serializer ${serializerName} is not known`);

  return serializer.deserialize(argument as Record<string, unknown>);
}

export function serializers(): Set<SerializerLike> {
  return Serializers._additionalSerializers;
}

export function addSerializers(...newSerializers: (SerializerLike | SerializerLike[])[]): void {
  Serializers._additionalSerializers = new Set([
    ...Serializers._additionalSerializers,
    ...newSerializers.flat(),
  ]);
}

Object.assign(Serializers, { serialize, deserialize, serializers, addSerializers });
rbModConstSet(ActiveJob, "Serializers", Serializers);
