import { basicObjRespondTo, rbModName, rbObjClass } from "@blazetrails/ruby-compat";
import { classAttribute, extend, included, squish } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import { type AttributeOptions, type ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Json } from "../type/json.js";
import { Serialized } from "../type/serialized.js";
import { JSON as CodersJSON } from "../coders/json.js";
import { ColumnSerializer as CodersColumnSerializer } from "../coders/column-serializer.js";
import { YAMLColumn, type YamlColumnOptions } from "../coders/yaml-column.js";
import { AttributeMethods } from "../namespaces.js";

export const ClassMethods = {
  serialize,
};

export interface Serialization {
  serialize(attribute: string, options?: { coder?: unknown }): void;
}

interface SerializationIncludeHost {
  name: string;
}

export const Serialization = {
  [included](base: SerializationIncludeHost): void {
    extend(base, ClassMethods);
    classAttribute.call(base, "defaultColumnSerializer", {
      instanceAccessor: false,
      default: YAMLColumn,
    });
  },
};

export class ColumnNotSerializableError extends Error {
  constructor(name: string, type: unknown) {
    super(
      `Column \`${name}\` of type ${rbModName(rbObjClass(type))} does not support \`serialize\` feature.\n` +
        `Usually it means that you are trying to use \`serialize\`\n` +
        `on a column that already implements serialization natively.\n`,
    );
    this.name = "ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError";
  }
}

/** @internal */
export function isTypeIncompatibleWithSerialize(
  castType: unknown,
  coder: unknown,
  type: unknown,
): boolean {
  return (
    (castType instanceof Json && coder === globalThis.JSON) ||
    (basicObjRespondTo(castType, "typeCastArray", true) && type === Array)
  );
}

/** @internal */
export function buildColumnSerializer(
  attrName: string,
  coder: unknown,
  type: unknown,
  yaml?: YamlColumnOptions,
): unknown {
  if (coder === globalThis.JSON) coder = CodersJSON;

  if (coder === YAMLColumn) {
    return new YAMLColumn(attrName, type as new (...args: unknown[]) => unknown, yaml ?? {});
  }

  if (typeof coder === "function" && !("load" in coder)) {
    return new (coder as any)(attrName, type);
  }

  if (type && type !== Object) {
    return new CodersColumnSerializer(attrName, coder as any, type as any);
  }

  return coder;
}

export interface SerializeOptions extends AttributeOptions {
  coder?: unknown;
  type?: unknown;
  yaml?: YamlColumnOptions;
}

export function serialize(
  this: typeof Base,
  attrName: string,
  options: SerializeOptions = {},
): void {
  const { type = Object, yaml = {} } = options;
  let coder = options.coder;
  if (coder == null || coder === false) coder = this.defaultColumnSerializer;
  if (coder == null || coder === false) {
    throw new ArgumentError(
      squish(`missing keyword: :coder

        If no default coder is configured, a coder must be provided to \`serialize\`.
      `),
    );
  }

  const columnSerializer = buildColumnSerializer(
    attrName,
    coder,
    type,
    yaml,
  ) as Serialized["coder"];

  const attributeOptions: AttributeOptions = { ...options };
  delete (attributeOptions as SerializeOptions).coder;
  delete (attributeOptions as SerializeOptions).type;
  delete (attributeOptions as SerializeOptions).yaml;
  this.attribute(attrName, attributeOptions);

  const decorator = (name: string, castType: ValueType | null): ValueType => {
    if (isTypeIncompatibleWithSerialize(castType, coder, type)) {
      throw new ColumnNotSerializableError(name, castType);
    }
    if (castType instanceof Serialized) castType = castType.subtype;
    return new Serialized(castType, columnSerializer);
  };

  this.decorateAttributes([attrName], decorator);
}

AttributeMethods.Serialization = Serialization;
