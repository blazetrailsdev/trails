/**
 * Serialized attribute support for ActiveRecord.
 *
 * Configures attributes to serialize/deserialize values (e.g. JSON, YAML)
 * when reading from and writing to the database.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization
 */

import { classAttribute, included } from "@blazetrails/activesupport";
import { JSON as CodersJSON } from "../coders/json.js";
import { ColumnSerializer as CodersColumnSerializer } from "../coders/column-serializer.js";
import { YAMLColumn, type YamlColumnOptions } from "../coders/yaml-column.js";

export interface Serialization {
  serialize(attribute: string, options?: { coder?: unknown }): void;
}

/** The host `include ActiveRecord::AttributeMethods::Serialization` needs. */
interface SerializationIncludeHost {
  name: string;
}

/**
 * `ActiveRecord::AttributeMethods::Serialization` — the module
 * `attribute_methods.rb:20` includes. It defines no instance methods; the
 * module object carries its `included do` block (serialization.rb:19-21), which
 * is what declares the `default_column_serializer` class attribute `serialize`
 * falls back on (`coder ||= default_column_serializer`, serialization.rb:184).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization (serialization.rb:6-230)
 */
export const Serialization = {
  [included](base: SerializationIncludeHost): void {
    classAttribute.call(base, "defaultColumnSerializer", {
      instanceAccessor: false,
      default: YAMLColumn,
    });
  },
};

/**
 * Raised when attempting to serialize a column that doesn't support it.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError
 */
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

/**
 * Column serializer — wraps a coder for a specific column.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ColumnSerializer
 */
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

/**
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#type_incompatible_with_serialize?
 *
 * @internal
 */
export function isTypeIncompatibleWithSerialize(
  castType: unknown,
  coder: unknown,
  type: unknown,
  isJsonType?: boolean,
): boolean {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;
  // Mirrors `cast_type.is_a?(ActiveRecord::Type::Json)`. The caller passes the
  // `instanceof Json` result (so OID::Jsonb, which extends Json, is also caught)
  // — importing type/json.ts here would cycle via store.ts → serialization.ts →
  // type/json.ts → store.ts. Falls back to a name duck-type for callers that
  // don't supply it.
  const jsonish = isJsonType ?? (castType as any)?.name === "json";
  if (jsonish && resolvedCoder === CodersJSON) return true;
  if (castType != null && typeof (castType as any).typeCastArray === "function" && type === Array)
    return true;
  return false;
}

type CoderLike = { dump(v: unknown): string; load(v: unknown): unknown };

/**
 * Builds the inner coder for a store column given raw options.
 * If coder responds to both load and dump, uses it directly.
 * If coder is a constructor (responds to new but not load), instantiates it.
 * Falls back to returning coder as-is when type is Object or unspecified.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#build_column_serializer
 *
 * @internal
 */
export function buildColumnSerializer(
  attrName: string,
  coder: unknown,
  type: unknown,
  yaml?: YamlColumnOptions,
): unknown {
  // When ::JSON is used, force it to go through the Active Support JSON encoder
  // to ensure special objects (e.g. Active Record models) are dumped correctly
  // using the #as_json hook.
  if (coder === globalThis.JSON) coder = CodersJSON;

  // Mirrors Rails' `coder == ::YAML || coder == Coders::YAMLColumn`. The string
  // "YAML" is the trails analog of Ruby's `::YAML` module constant. Rails forwards
  // `**(yaml || {})` (permitted_classes/unsafe_load) into the YAMLColumn ctor.
  if (coder === "YAML" || coder === YAMLColumn) {
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
