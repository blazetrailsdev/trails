import { mattrAccessor, safeConstantize } from "@blazetrails/activesupport";
import {
  ArgumentError,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { ActiveJob, Serializers, type SerializerLike } from "./namespaces.js";

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

export function deserialize(argument: Record<string, unknown>): unknown {
  const serializerName = argument[ActiveJob.Arguments.OBJECT_SERIALIZER_KEY] as string | null;
  if (serializerName == null) {
    throw new ArgumentError(
      `Serializer name is not present in the argument: ${rbInspect(argument)}`,
    );
  }

  const serializer = safeConstantize(serializerName) as SerializerLike | null;
  if (serializer == null) throw new ArgumentError(`Serializer ${serializerName} is not known`);

  return serializer.deserialize(argument);
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

export { Serializers };
