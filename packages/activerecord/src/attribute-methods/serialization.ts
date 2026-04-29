/**
 * Serialized attribute support for ActiveRecord.
 *
 * Configures attributes to serialize/deserialize values (e.g. JSON, YAML)
 * when reading from and writing to the database.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization
 */

/**
 * The Serialization module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization
 */
import { ColumnSerializer as CodersColumnSerializer } from "../coders/column-serializer.js";
import { JSON as CodersJSON } from "../coders/json.js";
import { Json as JsonType } from "../type/json.js";
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

type CoderLike = { dump(v: unknown): string; load(v: unknown): unknown };

/** @internal */
function buildColumnSerializer(
  attrName: string,
  coder: unknown,
  type: unknown,
  _yaml?: Record<string, unknown>,
): unknown {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;

  // coder.respond_to?(:new) && !coder.respond_to?(:load) → instantiate as constructor
  if (typeof resolvedCoder === "function" && !("load" in resolvedCoder)) {
    return new (resolvedCoder as any)(attrName, type);
  }

  if (type && type !== Object) {
    return new CodersColumnSerializer(attrName, resolvedCoder as CoderLike, type as any);
  }

  return resolvedCoder;
}

/** @internal */
function isTypeIncompatibleWithSerialize(
  castType: unknown,
  coder: unknown,
  type: unknown,
): boolean {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;
  if (castType instanceof JsonType && resolvedCoder === CodersJSON) return true;
  if (castType != null && typeof (castType as any).typeCastArray === "function" && type === Array)
    return true;
  return false;
}
