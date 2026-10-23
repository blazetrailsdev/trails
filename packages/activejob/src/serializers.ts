import { Autoload, safeConstantize, mattrAccessor } from "@blazetrails/activesupport";
import {
  extend,
  Enumerator,
  hashAref,
  rbInspect,
  ArgumentError,
  Set,
  classModule,
} from "@blazetrails/ruby-compat";
import { SerializationError } from "./arguments.js";
import { rbBinop } from "./codegen-runtime.js";
import { BigDecimalSerializer } from "./serializers/big-decimal-serializer.js";
import { DateSerializer } from "./serializers/date-serializer.js";
import { DateTimeSerializer } from "./serializers/date-time-serializer.js";
import { DurationSerializer } from "./serializers/duration-serializer.js";
import { ModuleSerializer } from "./serializers/module-serializer.js";
import { RangeSerializer } from "./serializers/range-serializer.js";
import { SymbolSerializer } from "./serializers/symbol-serializer.js";
import { TimeSerializer } from "./serializers/time-serializer.js";
import { TimeWithZoneSerializer } from "./serializers/time-with-zone-serializer.js";
import type { SerializerLike } from "./namespaces.js";
import type { ObjectSerializer } from "./serializers/object-serializer.js";

export class Serializers {
  declare static _additionalSerializers: Set<unknown>;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Serializers";
  }

  static serialize(argument: unknown) {
    const serializer = ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(this.serializers()).find((s) => s.isSerialize(argument));
    if (!(serializer != null && serializer !== false)) {
      throw new SerializationError(
        `Unsupported argument type: ${(Object.hasOwn(argument.constructor, "toString") ? String(argument.constructor) : argument.constructor.name || null) ?? ""}`,
      );
    }
    return serializer.serialize(argument);
  }

  static deserialize(argument: Map<unknown, unknown>) {
    const serializerName = hashAref(argument, "_aj_serialized");
    if (!(serializerName != null && serializerName !== false)) {
      throw new ArgumentError(
        `Serializer name is not present in the argument: ${rbInspect(argument)}`,
      );
    }
    const serializer = safeConstantize(serializerName);
    if (!(serializer != null && serializer !== false)) {
      throw new ArgumentError(`Serializer ${serializerName ?? ""} is not known`);
    }
    return serializer.deserialize(argument);
  }

  static serializers(): Set<SerializerLike> {
    return this._additionalSerializers;
  }

  static addSerializers(
    ...newSerializers: (
      | typeof ObjectSerializer
      | typeof SymbolSerializer
      | typeof DurationSerializer
      | typeof DateTimeSerializer
      | typeof DateSerializer
      | typeof TimeWithZoneSerializer
      | typeof TimeSerializer
      | typeof ModuleSerializer
      | typeof RangeSerializer
      | typeof BigDecimalSerializer
    )[]
  ) {
    this._additionalSerializers = rbBinop(
      this._additionalSerializers,
      "+",
      newSerializers.flat(Infinity),
    );
    return this._additionalSerializers;
  }
}
extend(Serializers, Autoload);
{
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
