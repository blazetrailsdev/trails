/**
 * Access attribute values before type casting.
 *
 * The actual implementation lives on Model (from @blazetrails/activemodel)
 * as readAttributeBeforeTypeCast() and attributesBeforeTypeCast getter,
 * which read valueBeforeTypeCast from the AttributeSet.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast
 */

interface BeforeTypeCastRecord {
  readAttributeBeforeTypeCast(name: string): unknown;
  readonly attributesBeforeTypeCast: Record<string, unknown>;
}

/**
 * Read the attribute value before type casting.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast#read_attribute_before_type_cast
 */
export function readAttributeBeforeTypeCast(record: BeforeTypeCastRecord, name: string): unknown {
  return record.readAttributeBeforeTypeCast(name);
}

/**
 * Return all attribute values before type casting.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast#attributes_before_type_cast
 */
export function attributesBeforeTypeCast(record: BeforeTypeCastRecord): Record<string, unknown> {
  return record.attributesBeforeTypeCast;
}
