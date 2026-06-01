/**
 * Serialized attribute support for ActiveRecord.
 *
 * Configures attributes to serialize/deserialize values (e.g. JSON, YAML)
 * when reading from and writing to the database.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization
 */

import { JSON as CodersJSON } from "../coders/json.js";
import { ColumnSerializer as CodersColumnSerializer } from "../coders/column-serializer.js";
import { YAMLColumn } from "../coders/yaml-column.js";

export interface Serialization {
  serialize(attribute: string, options?: { coder?: unknown }): void;
}

/**
 * Raised when attempting to serialize a column that doesn't support it.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError
 */
export class ColumnNotSerializableError extends Error {
  constructor(attributeName: string) {
    super(`Column \`${attributeName}\` of type binary is not serializable.`);
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

/** @internal */
function isTypeIncompatibleWithSerialize(
  castType: unknown,
  coder: unknown,
  type: unknown,
): boolean {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;
  // Duck-type for ActiveRecord::Type::Json — avoids importing type/json.ts which would
  // create a cycle via store.ts → serialization.ts → type/json.ts → store.ts.
  if ((castType as any)?.name === "json" && resolvedCoder === CodersJSON) return true;
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
  _yaml?: Record<string, unknown>,
): unknown {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;

  // Mirrors Rails' `coder == ::YAML || coder == Coders::YAMLColumn`. The string
  // "YAML" is the trails analog of Ruby's `::YAML` module constant. Rails forwards
  // `**(yaml || {})` (permitted_classes/unsafe_load) into the YAMLColumn ctor; those
  // Psych safe-load keywords have no JS analog, so the `_yaml` option set is dropped.
  if (resolvedCoder === "YAML" || resolvedCoder === YAMLColumn) {
    return new YAMLColumn(attrName, type as new (...args: unknown[]) => unknown);
  }

  if (typeof resolvedCoder === "function" && !("load" in resolvedCoder)) {
    return new (resolvedCoder as any)(attrName, type);
  }

  if (type && type !== Object) {
    return new CodersColumnSerializer(attrName, resolvedCoder as any, type as any);
  }

  return resolvedCoder;
}
