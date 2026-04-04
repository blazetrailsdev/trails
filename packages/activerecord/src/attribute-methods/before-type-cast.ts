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

interface DatabaseRecord {
  _attributes: {
    valuesForDatabase?(): Record<string, unknown>;
    getAttribute?(name: string): { valueForDatabase?(): unknown } | undefined;
    keys?(): Iterable<string>;
  };
  readAttribute(name: string): unknown;
  constructor: { _attributeAliases?: Record<string, string> };
}

/**
 * Rails: resolves alias, then calls @attributes[name].value_for_database
 */
export function readAttributeForDatabase(record: DatabaseRecord, attrName: string): unknown {
  const name = record.constructor._attributeAliases?.[attrName] ?? attrName;
  const attr = record._attributes.getAttribute?.(name);
  if (attr?.valueForDatabase) return attr.valueForDatabase();
  // Fallback: use valuesForDatabase bulk method
  if (record._attributes.valuesForDatabase) {
    return record._attributes.valuesForDatabase()[name];
  }
  return record.readAttribute(name);
}

/**
 * Rails: @attributes.values_for_database
 */
export function attributesForDatabase(record: DatabaseRecord): Record<string, unknown> {
  if (record._attributes.valuesForDatabase) {
    return record._attributes.valuesForDatabase();
  }
  const result: Record<string, unknown> = {};
  const keys = record._attributes.keys?.();
  if (keys) {
    for (const key of keys) {
      result[key] = readAttributeForDatabase(record, key);
    }
  }
  return result;
}
