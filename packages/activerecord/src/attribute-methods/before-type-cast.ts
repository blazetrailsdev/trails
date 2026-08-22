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
  _attributes: AttributeOwner["_attributes"] & {
    valuesBeforeTypeCast(): Record<string, unknown>;
  };
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
  const name = (
    record.constructor as unknown as { resolveAttributeName(n: string): string }
  ).resolveAttributeName(String(attrName));

  return attributeBeforeTypeCast.call(record, name) ?? null;
}

/**
 * Return all attribute values before type casting.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast#attributes_before_type_cast
 * (before_type_cast.rb:82-84). Ruby's zero-arg reader is an accessor property
 * here — see CLAUDE.md, "Generated attribute readers are properties" — so
 * base.ts installs it with `Object.defineProperty` rather than `include()`.
 */
export function attributesBeforeTypeCast(record: BeforeTypeCastRecord): Record<string, unknown> {
  return record._attributes.valuesBeforeTypeCast();
}

interface DatabaseRecord extends AttributeOwner {
  _attributes: AttributeOwner["_attributes"] & {
    valuesForDatabase(): Record<string, unknown>;
  };
}

/**
 * Read the attribute value after serialization.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast#read_attribute_for_database
 */
export function readAttributeForDatabase(record: DatabaseRecord, attrName: string): unknown {
  const name = record.constructor.attributeAliases?.[attrName] ?? attrName;

  return attributeForDatabase.call(record, name);
}

/**
 * Return all attribute values for assignment to the database.
 *
 * Mirrors: ActiveRecord::AttributeMethods::BeforeTypeCast#attributes_for_database
 */
export function attributesForDatabase(record: DatabaseRecord): Record<string, unknown> {
  return record._attributes.valuesForDatabase();
}

interface AttributeOwner {
  _attributes: {
    getAttribute(name: string): {
      valueBeforeTypeCast: unknown;
      valueForDatabase: unknown;
      cameFromUser(): boolean;
    };
  };
  constructor: { attributeAliases?: Record<string, string> };
}

/** @internal */
export function attributeBeforeTypeCast(this: AttributeOwner, attrName: string): unknown {
  return this._attributes.getAttribute(attrName).valueBeforeTypeCast;
}

/** @internal */
export function attributeForDatabase(this: AttributeOwner, attrName: string): unknown {
  return this._attributes.getAttribute(attrName).valueForDatabase;
}

/**
 * Dispatch target for the `*CameFromUser` attribute methods
 * (before_type_cast.rb:33).
 *
 * @internal Rails-private helper. Mirrors:
 * ActiveRecord::AttributeMethods::BeforeTypeCast#attribute_came_from_user?
 */
export function attributeCameFromUser(this: AttributeOwner, attrName: string): boolean {
  const name = this.constructor.attributeAliases?.[attrName] ?? attrName;
  return this._attributes.getAttribute(name).cameFromUser();
}
