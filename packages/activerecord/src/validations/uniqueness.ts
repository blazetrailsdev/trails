import { EachValidator, ArgumentError } from "@blazetrails/activemodel";
import { kernelArray } from "@blazetrails/activesupport";
import {
  except,
  hasKey,
  rbClassSuperclass,
  rbModSingletonP,
  rbObjAsString,
  rbObjRespondTo,
  rtest,
} from "@blazetrails/ruby-compat";
import { UnknownPrimaryKey } from "../errors.js";
import { stripThenable } from "@blazetrails/activesupport";

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

  constructor(options: Record<string, unknown>) {
    if (rtest(options.conditions) && !rbObjRespondTo(options.conditions, "call")) {
      throw new ArgumentError(
        `${rbObjAsString(options.conditions)} was passed as :conditions but is not callable. ` +
          "Pass a callable instead: `conditions: -> { where(approved: true) }`",
      );
    }
    if (!kernelArray(options.scope).every((scope) => typeof scope === "string")) {
      throw new ArgumentError(
        `${rbObjAsString(options.scope)} is not supported format for :scope option. ` +
          "Pass a symbol or an array of symbols instead: `scope: :user_id`",
      );
    }
    super(options);
    this._klass = options.class;
    if (rbModSingletonP(this._klass)) this._klass = rbClassSuperclass(this._klass);
  }

  async validateEach(record: any, attribute: string, value: unknown): Promise<void> {
    const finderClass = this.findFinderClassFor(record);
    value = mapEnumAttribute(finderClass, attribute, value);

    if (record.isPersisted() && !(await isValidationNeeded(this, finderClass, record, attribute))) {
      return;
    }

    let relation = await this.buildRelation(finderClass, attribute, value);
    if (record.isPersisted()) {
      if (finderClass.primaryKey != null) {
        relation = relation.where().not(new Map([[finderClass.primaryKey, [record.idInDatabase]]]));
      } else {
        throw new UnknownPrimaryKey(
          finderClass,
          "Cannot validate uniqueness for persisted record without primary key.",
        );
      }
    }
    relation = await this.scopeRelation(record, relation);

    if (rtest(this.options.conditions)) {
      const conditions = this.options.conditions as (this: any, record?: any) => any;
      relation =
        conditions.length === 0 ? conditions.call(relation) : conditions.call(relation, record);
    }

    if (await relation.isExists()) {
      const errorOptions: Record<string, unknown> = except(
        this.options,
        "caseSensitive",
        "scope",
        "conditions",
      );
      errorOptions.value = value;

      record.errors.add(attribute, ":taken", errorOptions);
    }
  }

  /** @internal */
  private findFinderClassFor(record: any): any {
    let currentClass = record.constructor;
    let foundClass = null;
    for (;;) {
      if (!currentClass.abstractClass) foundClass = currentClass;
      if (currentClass === this._klass) break;
      currentClass = rbClassSuperclass(currentClass);
    }
    return foundClass;
  }

  /** @internal */
  protected async buildRelation(klass: any, attribute: string, value: unknown): Promise<any> {
    const relation = klass.unscoped();
    let none = null;
    const comparison = await klass.withConnection((connection: any) =>
      relation.bindAttribute(attribute, value, (attr: any, bind: any) => {
        if (bind.isUnboundable()) {
          none = relation.noneBang();
          return null;
        }

        if (!hasKey(this.options, "caseSensitive") || bind.isNil()) {
          return connection.defaultUniquenessComparison(attr, bind);
        } else if (this.options.caseSensitive) {
          return connection.caseSensitiveComparison(attr, bind);
        } else {
          return connection.caseInsensitiveComparison(attr, bind);
        }
      }),
    );

    return stripThenable(none ?? relation.whereBang(comparison));
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
