/**
 * Access attribute values before type casting.
 *
 * `read_attribute_before_type_cast` / `read_attribute_for_database` resolve the
 * alias and hand off to the private `attribute_before_type_cast` /
 * `attribute_for_database` readers at the bottom of this file, exactly as
 * before_type_cast.rb:48-69 does.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast
 */

interface BeforeTypeCastRecord extends AttributeOwner {
  readonly attributesBeforeTypeCast: Record<string, unknown>;
}

/**
 * Read the attribute value before type casting.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast#read_attribute_before_type_cast
 */
export function readAttributeBeforeTypeCast(
  record: BeforeTypeCastRecord,
  attrName: string,
): unknown {
  const name = record.constructor._attributeAliases?.[attrName] ?? attrName;

  return attributeBeforeTypeCast.call(record, name);
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
    getAttribute?(name: string): { valueForDatabase?: unknown } | undefined;
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

  return attributeForDatabase.call(record as unknown as AttributeOwner, name);
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

interface AttributeOwner {
  _attributes: {
    getAttribute(name: string): {
      valueBeforeTypeCast: unknown;
      valueForDatabase: unknown;
      cameFromUser(): boolean;
    };
  };
  constructor: { _attributeAliases?: Record<string, string> };
}

/** @internal */
export function attributeBeforeTypeCast(this: AttributeOwner, attrName: string): unknown {
  return this._attributes.getAttribute(attrName).valueBeforeTypeCast;
}

/** @internal */
export function attributeForDatabase(this: AttributeOwner, attrName: string): unknown {
  return this._attributes.getAttribute(attrName).valueForDatabase;
}

/** @internal */
export function isAttributeCameFromUser(this: AttributeOwner, attrName: string): boolean {
  const name = this.constructor._attributeAliases?.[attrName] ?? attrName;
  return this._attributes.getAttribute(name).cameFromUser();
}
