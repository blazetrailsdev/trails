import { safeConstantize, Autoload, mattrAccessor } from "@blazetrails/activesupport";
import {
  rtest,
  rbObjAsString,
  rbModName,
  rbInspect,
  ArgumentError,
  Module,
  extend,
  Set,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { SerializationError, OBJECT_SERIALIZER_KEY } from "./arguments.js";
import { rbEnum, rbBinop } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";
import { BigDecimalSerializer } from "./serializers/big-decimal-serializer.js";
import { DateSerializer } from "./serializers/date-serializer.js";
import { DateTimeSerializer } from "./serializers/date-time-serializer.js";
import { DurationSerializer } from "./serializers/duration-serializer.js";
import { ModuleSerializer } from "./serializers/module-serializer.js";
import "./serializers/object-serializer.js";
import { RangeSerializer } from "./serializers/range-serializer.js";
import { SymbolSerializer } from "./serializers/symbol-serializer.js";
import "./serializers/time-object-serializer.js";
import { TimeSerializer } from "./serializers/time-serializer.js";
import { TimeWithZoneSerializer } from "./serializers/time-with-zone-serializer.js";

export function serialize(argument: any): any {
  const serializer: any = rbEnum(Serializers.serializers()).find((s?: any) =>
    s.isSerialize(argument),
  );
  if (!rtest(serializer)) {
    throw new SerializationError(
      `Unsupported argument type: ${rbObjAsString(rbModName(argument.constructor))}`,
    );
  }
  return serializer.serialize(argument);
}

export function deserialize(argument: any): any {
  const serializerName: any = argument[OBJECT_SERIALIZER_KEY];
  if (!rtest(serializerName)) {
    throw new ArgumentError(
      `Serializer name is not present in the argument: ${rbInspect(argument)}`,
    );
  }
  const serializer: any = safeConstantize(serializerName);
  if (!rtest(serializer)) {
    throw new ArgumentError(`Serializer ${rbObjAsString(serializerName)} is not known`);
  }
  return serializer.deserialize(argument);
}

export function serializers(): any {
  return Serializers._additionalSerializers;
}

export function addSerializers(...newSerializers: any[]): any {
  Serializers._additionalSerializers = rbBinop(
    Serializers._additionalSerializers,
    "+",
    newSerializers.flat(Infinity),
  );
  return Serializers._additionalSerializers;
}

export const Serializers: any = new Module();
Object.assign(Serializers, { serialize, deserialize, serializers, addSerializers });
{
  extend(Serializers, Autoload);
  Serializers.autoload("ObjectSerializer");
  Serializers.autoload("TimeObjectSerializer");
  Serializers.autoload("SymbolSerializer");
  Serializers.autoload("DurationSerializer");
  Serializers.autoload("DateTimeSerializer");
  Serializers.autoload("DateSerializer");
  Serializers.autoload("TimeWithZoneSerializer");
  Serializers.autoload("TimeSerializer");
  Serializers.autoload("ModuleSerializer");
  Serializers.autoload("RangeSerializer");
  Serializers.autoload("BigDecimalSerializer");
  mattrAccessor.call(Serializers, "_additionalSerializers");
  Serializers._additionalSerializers = new Set();
  Serializers.addSerializers(
    SymbolSerializer,
    DurationSerializer,
    DateTimeSerializer,
    DateSerializer,
    TimeWithZoneSerializer,
    TimeSerializer,
    ModuleSerializer,
    RangeSerializer,
    BigDecimalSerializer,
  );
}
rbModConstSet(ActiveJobSeat, "Serializers", Serializers);
