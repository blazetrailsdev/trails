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
