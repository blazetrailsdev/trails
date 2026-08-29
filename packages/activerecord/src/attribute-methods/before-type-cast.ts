import { included } from "@blazetrails/activesupport";

interface BeforeTypeCastIncludeHost {
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
}

export const BeforeTypeCast = {
  [included](base: BeforeTypeCastIncludeHost): void {
    base.attributeMethodSuffix("BeforeTypeCast", "ForDatabase", { parameters: false });
    base.attributeMethodSuffix("CameFromUser", { parameters: false });
  },
};

interface BeforeTypeCastRecord extends AttributeOwner {
  _attributes: AttributeOwner["_attributes"] & {
    valuesBeforeTypeCast(): Record<string, unknown>;
  };
}

export function readAttributeBeforeTypeCast(
  record: BeforeTypeCastRecord,
  attrName: string,
): unknown {
  const name = (
    record.constructor as unknown as { resolveAttributeName(n: string): string }
  ).resolveAttributeName(String(attrName));

  return attributeBeforeTypeCast.call(record, name) ?? null;
}

export function attributesBeforeTypeCast(this: BeforeTypeCastRecord): Record<string, unknown> {
  return this._attributes.valuesBeforeTypeCast();
}

interface DatabaseRecord extends AttributeOwner {
  _attributes: AttributeOwner["_attributes"] & {
    valuesForDatabase(): Record<string, unknown>;
  };
}

export function readAttributeForDatabase(record: DatabaseRecord, attrName: string): unknown {
  const name = record.constructor.attributeAliases?.[attrName] ?? attrName;

  return attributeForDatabase.call(record, name);
}

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

/** @internal */
export function attributeCameFromUser(this: AttributeOwner, attrName: string): boolean {
  const name = this.constructor.attributeAliases?.[attrName] ?? attrName;
  return this._attributes.getAttribute(name).cameFromUser();
}
