import { EachValidator, ArgumentError } from "@blazetrails/activemodel";
import { isBlank, kernelArray } from "@blazetrails/activesupport";
import { except, hasKey, rbModSingletonP } from "@blazetrails/ruby-compat";
import { UnknownPrimaryKey } from "../errors.js";
import { stripThenable } from "../relation/thenable.js";

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
      throw new ArgumentError(
        `${options.conditions} was passed as :conditions but is not callable. ` +
          "Pass a callable instead: `conditions: -> { where(approved: true) }`",
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
        `${scopeRepr} is not supported format for :scope option. ` +
          "Pass a symbol or an array of symbols instead: `scope: :user_id`",
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
    if (rbModSingletonP(this._klass)) this._klass = Object.getPrototypeOf(this._klass);
  }

  /** @internal */
  protected override readAttributeForValidation(record: any, attribute: string): unknown {
    if (record?.constructor?._reflectOnAssociation?.(attribute)) {
      return record.association(attribute).reader;
    }
    return super.readAttributeForValidation(record, attribute);
  }

  async validateEach(record: any, attribute: string, value: unknown): Promise<void> {
    value = await value;
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

    let relation = await this.buildRelation(finderClass, attribute, value);

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
        relation = relation.where().not(new Map([[pk, [dbVals]]]));
      } else {
        const dbVal = record.attributeChanged(pk)
          ? record.attributeWas(pk)
          : record.readAttribute(pk);
        relation = relation.where().not({ [pk]: [dbVal] });
      }
    }

    relation = await this.scopeRelation(record, relation);

    if (opts?.conditions && typeof opts.conditions === "function") {
      const conditioned =
        opts.conditions.length === 0
          ? opts.conditions.call(relation)
          : opts.conditions.call(relation, record);
      if (conditioned != null) relation = conditioned;
    }

    const exists = await relation.isExists();
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
  protected async buildRelation(klass: any, attribute: string, value: unknown): Promise<any> {
    const relation = klass.unscoped();
    return klass.withConnection((connection: any) =>
      relation.bindAttribute(attribute, value, async (attr: any, bind: any) => {
        if (bind.isUnboundable()) return stripThenable(relation.noneBang());

        let comparison;
        if (!hasKey(this.options, "caseSensitive") || bind.isNil()) {
          comparison = connection.defaultUniquenessComparison(attr, bind);
        } else if (this.options.caseSensitive) {
          comparison = await connection.caseSensitiveComparison(attr, bind);
        } else {
          comparison = await connection.caseInsensitiveComparison(attr, bind);
        }

        return stripThenable(relation.whereBang(comparison));
      }),
    );
  }

  /** @internal */
  private async scopeRelation(record: any, relation: any): Promise<any> {
    for (const scopeItem of kernelArray(this.options.scope as string | string[])) {
      const scopeValue = record.constructor._reflectOnAssociation(scopeItem)
        ? await record.association(scopeItem).reader
        : record.readAttribute(scopeItem);
      relation = relation.where({ [scopeItem]: scopeValue });
    }

    return stripThenable(relation);
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
  const tableName = klass?.tableName;
  if (!klass || !tableName) return [];

  type Index = { unique?: boolean; where?: string | null; columns?: unknown };

  const cache = klass.connectionPool().schemaCache;
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
    const fk = refl.foreignKey();
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

export const ClassMethods = { validatesUniquenessOf };
