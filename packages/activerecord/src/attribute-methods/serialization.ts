import { classAttribute, extend, included } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import { type AttributeOptions, type ValueType, ArgumentError } from "@blazetrails/activemodel";
import { Json } from "../type/json.js";
import { Serialized, type Coder } from "../type/serialized.js";
import { JSON as CodersJSON } from "../coders/json.js";
import { ColumnSerializer as CodersColumnSerializer } from "../coders/column-serializer.js";
import { YAMLColumn, type YamlColumnOptions } from "../coders/yaml-column.js";

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
  constructor(name: string, type?: unknown) {
    const typeName =
      type == null
        ? "unknown"
        : ((type as { constructor?: { name?: string } }).constructor?.name ?? String(type));
    super(
      `Column \`${name}\` of type ${typeName} does not support \`serialize\` feature.\n` +
        `Usually it means that you are trying to use \`serialize\`\n` +
        `on a column that already implements serialization natively.`,
    );
    this.name = "ColumnNotSerializableError";
  }
}

export class ColumnSerializer {
  readonly attribute: string;
  readonly coder: { dump(value: unknown): string; load(raw: unknown): unknown };

  constructor(
    attribute: string,
    coder: { dump(value: unknown): string; load(raw: unknown): unknown },
  ) {
    this.attribute = attribute;
    this.coder = coder;
  }

  dump(value: unknown): string {
    return this.coder.dump(value);
  }

  load(raw: unknown): unknown {
    return this.coder.load(raw);
  }
}

/** @internal */
export function isTypeIncompatibleWithSerialize(
  castType: unknown,
  coder: unknown,
  type: unknown,
  isJsonType?: boolean,
): boolean {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;
  const jsonish = isJsonType ?? (castType as any)?.name === "json";
  if (jsonish && resolvedCoder === CodersJSON) return true;
  if (castType != null && typeof (castType as any).typeCastArray === "function" && type === Array)
    return true;
  return false;
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

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export class HashObject {
  constructor() {
    return {};
  }
  static [Symbol.hasInstance](value: unknown): boolean {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }
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
      "missing keyword: :coder. If no default coder is configured, a coder must be provided to `serialize`.",
    );
  }

  const columnSerializer = buildColumnSerializer(attrName, coder, type, yaml) as Coder;

  const attributeOptions: AttributeOptions = { ...options };
  delete (attributeOptions as SerializeOptions).coder;
  delete (attributeOptions as SerializeOptions).type;
  delete (attributeOptions as SerializeOptions).yaml;
  this.attribute(attrName, attributeOptions);

  const decorator = (name: string, castType: ValueType | null): ValueType => {
    if (castType instanceof Serialized && castType.coder === columnSerializer) return castType;
    if (isTypeIncompatibleWithSerialize(castType, coder, type, castType instanceof Json)) {
      throw new ColumnNotSerializableError(name, castType);
    }
    const subtype = castType instanceof Serialized ? castType.subtype : castType;
    return new Serialized(subtype, columnSerializer);
  };

  this.decorateAttributes([attrName], decorator);
}
