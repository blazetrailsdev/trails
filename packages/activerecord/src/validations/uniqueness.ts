import { EachValidator, ArgumentError } from "@blazetrails/activemodel";
import { isBlank } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { UnknownPrimaryKey } from "../errors.js";
import { threadedConnectionFor } from "../connection-handling.js";

export function validatesUniquenessOf(
  this: {
    _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
    validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
  },
  ...attrNames: unknown[]
): void {
  this.validatesWith(UniquenessValidator, this._mergeAttributes(attrNames));
}

export class UniquenessValidator extends EachValidator {
  private _klass: any;

  /** @internal */
  _covered: string[] | null = null;

  /** @internal */
  declare isCoveredByUniqueIndex: typeof isCoveredByUniqueIndex;

  constructor(options: Record<string, unknown> = {}) {
    if (options.conditions != null && typeof options.conditions !== "function") {
      throw new Error(
        `${options.conditions} was passed as :conditions but is not callable. ` +
          "Pass a callable instead: `conditions: () => where({ approved: true })`",
      );
    }
    const scopes =
      options.scope == null ? [] : Array.isArray(options.scope) ? options.scope : [options.scope];
    if (!scopes.every((scope) => typeof scope === "string")) {
      let scopeRepr: string;
      try {
        scopeRepr = JSON.stringify(options.scope) ?? String(options.scope);
      } catch {
        scopeRepr = String(options.scope);
      }
      throw new ArgumentError(
        `${scopeRepr} is not a supported format for :scope option. ` +
          "Pass a string or an array of strings instead.",
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(options, "caseSensitive") &&
      typeof options.caseSensitive !== "boolean"
    ) {
      throw new Error(
        `${options.caseSensitive} is not a supported value for :caseSensitive option. ` +
          "Pass a boolean instead: `caseSensitive: false`",
      );
    }
    super(options);
    this._klass = options.class ?? null;
  }

  /** @internal */
  protected override readAttributeForValidation(record: any, attribute: string): unknown {
    const refl = record?.constructor?._reflectOnAssociation?.(attribute);
    if (refl) {
      const fk = Array.isArray(refl.foreignKey) ? refl.foreignKey[0] : refl.foreignKey;
      return record.readAttribute(fk);
    }
    return super.readAttributeForValidation(record, attribute);
  }

  async validateEach(record: any, attribute: string, value: unknown): Promise<void> {
    if (value === undefined) return;
    const o = this.options as { allowNil?: unknown; allowBlank?: unknown };
    if (value == null && o.allowNil === true) return;
    if (isBlank(value) && o.allowBlank === true) return;

    const finderClass = this.findFinderClassFor(record) ?? record.constructor;
    if (!finderClass.where) return;

    value = mapEnumAttribute(finderClass, attribute, value);

    if (
      record.isPersisted?.() &&
      !(await isValidationNeeded(this, finderClass, record, attribute))
    ) {
      return;
    }

    const opts = this.options as any;

    let [relation] = await this.buildRelation(finderClass, attribute, value);

    if (record.isPersisted?.()) {
      const pk = finderClass.primaryKey;
      if (pk == null) {
        throw new UnknownPrimaryKey(
          finderClass,
          "Cannot validate uniqueness for persisted record without primary key.",
        );
      }
      if (Array.isArray(pk)) {
        const dbVals = pk.map((col: string) =>
          record.attributeChanged(col) ? record.attributeWas(col) : record.readAttribute(col),
        );
        relation = relation.where().not(pk, [dbVals]);
      } else {
        const dbVal = record.attributeChanged(pk)
          ? record.attributeWas(pk)
          : record.readAttribute(pk);
        relation = relation.where().not({ [pk]: [dbVal] });
      }
    }

    relation = this.scopeRelation(record, relation);

    if (opts?.conditions && typeof opts.conditions === "function") {
      const conditioned =
        opts.conditions.length === 0
          ? opts.conditions.call(relation)
          : opts.conditions.call(relation, record);
      if (conditioned != null) relation = conditioned;
    }

    const exists = await relation.exists();
    if (exists) {
      const errorOpts: Record<string, unknown> = except(
        opts ?? {},
        "caseSensitive",
        "scope",
        "conditions",
        "class",
      );
      errorOpts.value = value;

      record.errors.add(attribute, ":taken", errorOpts);
    }
  }

  /** @internal */
  private findFinderClassFor(record: any): any {
    let current = record.constructor;
    let lastConcrete: any = null;
    while (current) {
      if (!current.abstractClass && typeof current.where === "function") {
        lastConcrete = current;
      }
      if (current === this._klass) break;
      const parent = Object.getPrototypeOf(current);
      if (!parent || parent === Function.prototype || parent === Object) break;
      if (typeof parent.where !== "function") break;
      current = parent;
    }
    return lastConcrete ?? record.constructor;
  }

  /** @internal */
  protected async buildRelation(klass: any, attribute: string, value: unknown): Promise<[any]> {
    const base = typeof klass.unscoped === "function" ? klass.unscoped() : klass.where({});

    attribute = (klass.attributeAliases?.[attribute] as string) ?? attribute;

    const refl = klass._reflectOnAssociation?.(attribute);
    if (refl) {
      const fk = Array.isArray(refl.foreignKey) ? refl.foreignKey[0] : refl.foreignKey;
      if (
        value != null &&
        typeof value === "object" &&
        typeof (value as any).readAttribute === "function"
      ) {
        const pk = refl.klass?.primaryKey ?? "id";
        value = (value as any).readAttribute(Array.isArray(pk) ? pk[0] : pk);
      }
      attribute = fk;
    }

    if (value == null) {
      return [base.where({ [attribute]: null })];
    }

    const arel = klass.arelTable as { get?: (n: string) => any } | null;
    const pb = (
      base as { predicateBuilder?: { buildBindAttribute(c: string, v: unknown): unknown } }
    ).predicateBuilder;
    const adapter = klass.connection ?? null;
    const hasCsKey = Object.prototype.hasOwnProperty.call(this.options, "caseSensitive");
    const typeObj =
      typeof klass.typeForAttribute === "function" ? klass.typeForAttribute(attribute) : null;

    if (typeObj?.supportUnencryptedData) {
      return [base.where({ [attribute]: value })];
    }

    if (arel && typeof arel.get === "function" && pb?.buildBindAttribute) {
      const attr = arel.get(attribute);
      const bind = pb.buildBindAttribute(attribute, value);
      let comparison: any = null;
      if (!hasCsKey || value == null) {
        comparison = adapter?.defaultUniquenessComparison?.(attr, bind) ?? null;
      } else if (this.options.caseSensitive) {
        comparison = (await adapter?.caseSensitiveComparison?.(attr, bind)) ?? null;
      } else {
        const colType =
          typeObj == null
            ? null
            : typeof typeObj.type === "function"
              ? typeObj.type()
              : typeObj.type;
        if (colType !== "uuid") {
          comparison = (await adapter?.caseInsensitiveComparison?.(attr, bind)) ?? null;
          if (comparison == null && typeof value === "string") {
            const lowerBind = pb.buildBindAttribute(attribute, value.toLowerCase());
            comparison = attr.lower().eq(lowerBind);
          }
        }
      }
      if (comparison != null && typeof base.where === "function") {
        return [base.where(comparison)];
      }
    }
    return [base.where({ [attribute]: value })];
  }

  /** @internal */
  private scopeRelation(record: any, relation: any): any {
    const scope = this.options.scope;
    if (scope == null) return relation;
    const scopes = Array.isArray(scope) ? (scope as string[]) : [scope as string];
    let r = relation;
    for (const rawItem of scopes) {
      const ctor = record.constructor;
      const item = (ctor.attributeAliases?.[rawItem] as string) ?? rawItem;
      const refl = ctor._reflectOnAssociation?.(item);
      if (refl) {
        const isPoly =
          typeof refl.isPolymorphic === "function" ? refl.isPolymorphic() : refl.polymorphic;
        const fks = Array.isArray(refl.foreignKey) ? refl.foreignKey : [refl.foreignKey];
        for (const fk of fks) {
          r = r.where({ [fk]: record.readAttribute?.(fk) });
        }
        if (isPoly && refl.foreignType) {
          r = r.where({ [refl.foreignType]: record.readAttribute?.(refl.foreignType) });
        }
      } else {
        r = r.where({ [item]: record.readAttribute?.(item) });
      }
    }
    return r;
  }
}

/** @internal */
async function isValidationNeeded(
  validator: UniquenessValidator,
  klass: any,
  record: any,
  attribute: string,
): Promise<boolean> {
  const options = validator.options;
  if (options.conditions || Object.prototype.hasOwnProperty.call(options, "caseSensitive")) {
    return true;
  }
  const scope = Array.isArray(options.scope)
    ? (options.scope as string[])
    : options.scope
      ? [options.scope as string]
      : [];
  const attrs = resolveAttributes(record, [...scope, attribute]);
  const anyChangedOrNull = attrs.some(
    (a) => record.attributeChanged?.(a) || record.readAttribute?.(a) == null,
  );
  if (anyChangedOrNull) return true;
  return !(await validator.isCoveredByUniqueIndex(klass, record, attribute, scope));
}

/** @internal */
async function isCoveredByUniqueIndex(
  this: UniquenessValidator,
  klass: any,
  record: any,
  attribute: string,
  scope: string[],
): Promise<boolean> {
  const validator = this;
  if (validator._covered == null) {
    const indexes = await tableIndexes(klass);
    const covered: string[] = [];
    for (const attr of (validator.attributes ?? []).map((a: unknown) => String(a))) {
      const attributes = resolveAttributes(record, [...scope, attr]);
      const isCovered = indexes.some((index) => {
        if (!index.unique || index.where != null) return false;
        const columns = Array.isArray(index.columns) ? index.columns : [index.columns];
        return columns.every((c) => attributes.includes(String(c)));
      });
      if (isCovered) covered.push(attr);
    }
    validator._covered = covered;
  }
  return validator._covered.includes(String(attribute));
}

/** @internal */
async function tableIndexes(
  klass: any,
): Promise<{ unique?: boolean; where?: string | null; columns?: unknown }[]> {
  const adapter = threadedConnectionFor(klass) ?? klass?.connection;
  const tableName = klass?.tableName;
  if (!adapter || !tableName) return [];

  type Index = { unique?: boolean; where?: string | null; columns?: unknown };

  const cache = adapter.schemaCache;
  if (!cache || typeof cache.indexes !== "function") return [];
  return (await cache.indexes(tableName)) as Index[];
}

/** @internal */
function resolveAttributes(record: any, attributes: string[]): string[] {
  const out: string[] = [];
  for (const attr of attributes) {
    const ctor = record.constructor;
    const refl = ctor._reflectOnAssociation?.(String(attr));
    if (!refl) {
      out.push(String(attr));
      continue;
    }
    const fk = refl.foreignKey;
    if (Array.isArray(fk)) out.push(...fk);
    else if (fk != null) out.push(fk);
    const isPoly =
      typeof refl.isPolymorphic === "function" ? refl.isPolymorphic() : refl.polymorphic;
    if (isPoly && refl.foreignType) out.push(refl.foreignType);
  }
  return out.filter((x) => x != null);
}

/** @internal */
function mapEnumAttribute(klass: any, attribute: string, value: unknown): unknown {
  const enums = klass?.definedEnums?.[String(attribute)];
  if (value != null && enums && Object.prototype.hasOwnProperty.call(enums, String(value))) {
    return (enums as Record<string, unknown>)[String(value)];
  }
  return value;
}

UniquenessValidator.prototype.isCoveredByUniqueIndex = isCoveredByUniqueIndex;
