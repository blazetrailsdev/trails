import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import {
  _builtAssociationScope,
  _inlineOwnerKey,
  _inlinePolymorphicKeys,
  _ownerChainReflection,
  associationInstanceGet,
  _resolveInverseName,
  _routeThroughViaAssociationScope,
  _scopeForAssociation,
  _wireInverseAssociation,
  applyAssociationScope,
  resolveAssocClass,
  syncToAssociationInstance,
  validateInverseOf,
} from "../associations.js";
import { strictLoadingViolationBang } from "../core.js";
import {
  validateThroughReflection,
  routeThroughCheckValidity,
} from "./validate-through-reflection.js";
import {
  AssociationNotFoundError,
  CompositePrimaryKeyMismatchError,
  DeleteRestrictionError,
} from "./errors.js";
import { CollectionAssociation, includesRecord, isThenable } from "./collection-association.js";
import type { Association } from "./association.js";
import { ForeignAssociation, ownerForeignKeyColumns } from "./foreign-association.js";
import { compositeQueryConstraintsList, queryConstraintsList } from "../persistence.js";
import {
  camelize,
  eachSlice,
  min,
  selectBang,
  singularize,
  underscore,
} from "@blazetrails/activesupport";

export class HasManyAssociation extends CollectionAssociation {
  /** @internal */
  declare updateCounterInMemory: (difference: number) => void;
  /** @internal */
  declare updateCounterIfSuccess: <T>(savedSuccessfully: T, difference: number) => T;
  /** @internal */
  declare updateCounter: (difference: number, reflection?: AssociationDefinition) => Promise<void>;
  /** @internal */
  declare deleteCount: (method: string, scope: any) => Promise<number>;

  /** @internal */
  _queryExecutor?: () => Promise<Base[]>;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  protected override difference(a: Base[], b: Base[]): Base[] {
    return setDifference(a, b);
  }

  protected override intersection(a: Base[], b: Base[]): Base[] {
    return setIntersection(a, b);
  }

  /**
   * @missingRailsCall fetch — PERMANENT
   * @missingRailsCall first — PERMANENT
   */
  async handleDependency(): Promise<void | false> {
    const dependent = this.reflection.options.dependent;
    if (!dependent) return;

    switch (dependent) {
      case "restrictWithException": {
        if (!(await this.isEmpty())) {
          throw new DeleteRestrictionError(this.reflection.name);
        }
        break;
      }

      case "restrictWithError": {
        if (!(await this.isEmpty())) {
          const owner = this.owner as Base & {
            errors: { add(a: string, t: string, opts?: Record<string, unknown>): void };
          };
          const ctor = owner.constructor as typeof Base & {
            humanAttributeName(attr: string): string;
          };
          const record = ctor.humanAttributeName(this.reflection.name).toLowerCase();
          owner.errors.add("base", ":restrict_dependent_destroy.has_many", { record });
          return false;
        }
        break;
      }

      case "destroy": {
        const records = await this.loadTarget();
        for (const record of records) {
          (record as any).destroyedByAssociation = this.reflection;
        }
        await this.destroyAll();
        break;
      }

      case "destroyAsync": {
        const records = await this.loadTarget();
        for (const t of records) {
          (t as any).destroyedByAssociation = this.reflection;
        }

        if (this.target.length > 0) {
          const associationClass = this.target[0].constructor as typeof Base;
          let primaryKeyColumn: string | string[];
          let ids: unknown[];
          if (queryConstraintsList.call(associationClass as any)) {
            primaryKeyColumn = queryConstraintsList.call(associationClass as any)!;
            ids = this.target.map((assoc) =>
              (primaryKeyColumn as string[]).map((col) => (assoc as any)[col]),
            );
          } else {
            primaryKeyColumn = associationClass.primaryKey as string;
            ids = this.target.map((assoc) => (assoc as any)[primaryKeyColumn as string]);
          }

          const idsBatches = eachSlice(
            ids,
            (this.owner.constructor as typeof Base).destroyAssociationAsyncBatchSize ?? ids.length,
          );
          for (const idsBatch of idsBatches) {
            this.enqueueDestroyAssociation({
              ownerModelName: this.owner.constructor.name,
              ownerId: (this.owner as any).id,
              associationClass: String(this.reflection.klass.name),
              associationIds: idsBatch,
              associationPrimaryKeyColumn: primaryKeyColumn,
              ensuringOwnerWasMethod:
                "ensuringOwnerWas" in this.reflection.options
                  ? (this.reflection.options as any).ensuringOwnerWas
                  : null,
            });
          }
        }
        break;
      }

      default:
        await this.deleteAll();
    }
  }

  override async insertRecord(
    record: Base,
    validate = true,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<boolean> {
    this.setOwnerAttributes(record);
    return super.insertRecord(record, validate, raise, block);
  }

  protected override async findTarget(): Promise<Base[]> {
    this._loaderWritebackSuppressed++;
    try {
      const records = await findTarget(
        this.owner,
        this.reflection.name,
        this.reflection,
        this._queryExecutor,
        this.isViolatesStrictLoading(),
      );
      for (const record of records) this.setStrictLoading(record);
      return records;
    } finally {
      this._loaderWritebackSuppressed--;
    }
  }

  protected override computeNullifiedOwnerAttributes(): Record<string, null> {
    return nullifiedOwnerAttributes(this);
  }

  /** @internal */
  protected override async deleteOrNullifyAllRecords(method?: string): Promise<number> {
    const count = await this.deleteCount(method ?? "", (this as any).scope());
    await this.updateCounter(-count);
    return count;
  }

  /** @internal */
  protected override async deleteRecords(records: Base[], method: string): Promise<number> {
    if (method === "destroy") {
      for (const record of records) await (record as any).destroyBang();
      if (!this.reflection.isInverseUpdatesCounterCache?.()) {
        await this.updateCounter(-records.length);
      }
      return records.length;
    }
    const queryConstraints = compositeQueryConstraintsList.call(this.reflection.klass as any);
    const values = records.map((r) =>
      queryConstraints.map((col) => (r as any)._readAttribute(col)),
    );
    const baseScope = (this as any).scope?.();
    if (!baseScope) return 0;
    const scope =
      queryConstraints.length === 1
        ? baseScope.where({ [queryConstraints[0]]: values.map((tuple) => tuple[0]) })
        : baseScope.where(queryConstraints, values);
    method = method === "delete" ? "deleteAll" : method;
    const count = await this.deleteCount(method, scope);
    if (count > 0) await this.updateCounter(-count);
    return count;
  }

  /** @internal */
  protected override concatRecords(records: Base[], raise = false): Promise<Base[]> | Base[] {
    const concatenated = super.concatRecords(records, raise);
    return isThenable(concatenated)
      ? concatenated.then((saved) => this.updateCounterIfSuccess(saved, records.length))
      : this.updateCounterIfSuccess(concatenated, records.length);
  }

  /** @internal */
  protected override async _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | Base[] | null> {
    if (Array.isArray(attributes)) {
      return super._createRecord(attributes, raise, block);
    } else {
      return this.updateCounterIfSuccess(
        (await super._createRecord(attributes, raise, block)) as Base | null,
        1,
      );
    }
  }

  /** @internal */
  async countRecords(): Promise<number> {
    const reflection = this.reflection as unknown as {
      hasActiveCachedCounter(): boolean;
      counterCacheColumn(): string | null;
    };
    let count: number;
    if (reflection.hasActiveCachedCounter()) {
      const counterCacheColumn = reflection.counterCacheColumn();
      count =
        counterCacheColumn == null ? 0 : toI((this.owner as any).readAttribute(counterCacheColumn));
    } else {
      count = await (this as unknown as CollectionAssociation).scope().count("all");
    }

    if (count === 0) {
      selectBang((this as unknown as CollectionAssociation).target, (record) =>
        record.isNewRecord(),
      );
      (this as unknown as CollectionAssociation).loadedBang();
    }

    const limitValue = (
      (this as unknown as CollectionAssociation).associationScope() as {
        limitValue?: number | null;
      } | null
    )?.limitValue;
    return min([limitValue, count].filter((value) => value != null))!;
  }
}

function toI(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** @internal */
async function updateCounter(
  this: HasManyAssociation,
  difference: number,
  reflection: AssociationDefinition = this.reflection,
): Promise<void> {
  if (!reflection.hasCachedCounter?.()) return;
  const counterCacheColumn = reflection.counterCacheColumn?.() as string;
  const owner = this.owner as any;
  if (typeof owner.incrementBang === "function") {
    await owner.incrementBang(counterCacheColumn, difference);
  } else if (typeof owner.updateCounters === "function") {
    await owner.updateCounters({ [counterCacheColumn]: difference });
  } else if (typeof owner.increment === "function") {
    owner.increment(counterCacheColumn, difference);
  }
}

/** @internal */
function updateCounterInMemory(this: HasManyAssociation, difference: number): void {
  const reflection = this.reflection;
  if (!reflection.isCounterMustBeUpdatedByHasMany?.()) return;
  const counter = reflection.counterCacheColumn?.() as string;
  const owner = this.owner as any;
  const current = Number(owner.readAttribute?.(counter) ?? 0);
  owner.writeAttribute?.(counter, current + difference);
  owner.clearAttributeChange?.(counter);
}

/** @internal */
function deleteCount(this: HasManyAssociation, method: string, scope: any): Promise<number> {
  if (method === "deleteAll") return scope.deleteAll?.() ?? Promise.resolve(0);
  const nullAttrs = (
    this as unknown as {
      computeNullifiedOwnerAttributes(): Record<string, null>;
    }
  ).computeNullifiedOwnerAttributes();
  return scope.updateAll?.(nullAttrs) ?? Promise.resolve(0);
}

/** @internal */
function updateCounterIfSuccess<T>(
  this: HasManyAssociation,
  savedSuccessfully: T,
  difference: number,
): T {
  if (savedSuccessfully) this.updateCounterInMemory(difference);
  return savedSuccessfully;
}

/** @internal */
function difference(_assoc: HasManyAssociation, a: Base[], b: Base[]): Base[] {
  return a.filter((r) => !b.includes(r));
}

/** @internal */
function intersection(_assoc: HasManyAssociation, a: Base[], b: Base[]): Base[] {
  return a.filter((r) => b.includes(r));
}

/** @internal */
function nullifiedOwnerAttributes(assoc: HasManyAssociation): Record<string, null> {
  const ctor = assoc.owner.constructor as {
    name: string;
    _reflectOnAssociation?: (n: string) => {
      foreignKey?: string | string[];
      foreignType?: string;
    } | null;
  };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) ?? null;
  let foreignKey: string | string[] | undefined = refl?.foreignKey;
  const typeCol: string | null = refl?.foreignType ?? null;
  if (foreignKey == null) {
    const fks = (assoc as unknown as { foreignKeyColumns?: () => string[] }).foreignKeyColumns?.();
    if (fks?.length) foreignKey = fks;
  }
  if (foreignKey == null) {
    const opts = assoc.reflection.options as { foreignKey?: string | string[]; as?: string };
    foreignKey =
      opts.foreignKey ?? (opts.as ? `${underscore(opts.as)}_id` : `${underscore(ctor.name)}_id`);
  }
  const polyType = typeCol ?? deriveAsTypeCol(assoc);
  return ForeignAssociation.nullifiedOwnerAttributes({ foreignKey, type: polyType });
}

function deriveAsTypeCol(assoc: { reflection: { options: { as?: string } } }): string | null {
  const asName = assoc.reflection.options.as;
  return asName ? `${underscore(asName)}_type` : null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function setDifference(a: Base[], b: Base[]): Base[] {
  return a.filter((record) => !includesRecord(b, record));
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function setIntersection(a: Base[], b: Base[]): Base[] {
  return a.filter((record) => includesRecord(b, record));
}

/** @internal */
async function findTarget(
  record: Base,
  assocName: string,
  assocDef: AssociationDefinition,
  queryExecutor?: () => Promise<Base[]>,
  violatesStrictLoading = false,
): Promise<Base[]> {
  const options = assocDef.options;
  if (options.through) {
    validateThroughReflection(record.constructor as typeof Base, assocName);
  }
  if (!queryExecutor) {
    const cache = record._associationCache(assocName);
    if (
      cache &&
      cache !== record._collectionProxies.get(assocName) &&
      (cache as unknown) !== (record._associationInstances.get(assocName) as unknown) &&
      Array.isArray(cache.target) &&
      !(typeof (cache as any).isStaleTarget === "function" && (cache as any).isStaleTarget())
    ) {
      return cache.target;
    }
    const holder = associationInstanceGet.call(record, assocName) as Association | null;
    if (holder?.isLoaded() && !(holder._staleStateIsSnapshotted && holder.isStaleTarget())) {
      return (holder.target ?? []) as Base[];
    }
  }

  if (violatesStrictLoading) {
    const ctor = record.constructor as typeof Base;
    const reflection = ctor._reflectOnAssociation?.(assocName);
    if (!reflection) throw new AssociationNotFoundError(record, assocName);
    strictLoadingViolationBang({ owner: ctor, reflection });
  }

  if (queryExecutor) return queryExecutor();

  if (options.through) {
    const ctorEarly = record.constructor as typeof Base;
    const reflThrough = ctorEarly._reflectOnAssociation?.(assocName);
    if (!_routeThroughViaAssociationScope(record, reflThrough, options)) {
      const { _buildAssociationInstance } = await import("./instance-methods.js");
      const through = _buildAssociationInstance.call(
        record,
        (reflThrough ?? assocDef) as AssociationDefinition,
      ) as unknown as { loadHasManyThrough(): Promise<Base[]> };
      return through.loadHasManyThrough();
    }
  }

  const ctor = record.constructor as typeof Base;
  if (options.inverseOf) {
    const className = options.className ?? camelize(singularize(assocName));
    validateInverseOf(
      ctor,
      resolveAssocClass(record, assocName, className),
      assocName,
      options.inverseOf,
    );
  }

  const rel = scope(record, assocName, assocDef);
  if (rel === null) return [];

  const inverseName = _resolveInverseName(ctor, assocName, options);
  if (inverseName) {
    rel._instantiateBlock = (child: Base) => {
      _wireInverseAssociation(record, child, inverseName);
    };
  }
  const results: Base[] = await rel.toArray();

  syncToAssociationInstance(record, assocName, results);
  return results;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function scope(
  record: Base,
  assocName: string,
  assocDef: AssociationDefinition,
): any | null {
  const options = assocDef.options;
  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(singularize(assocName));
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveAssocClass(record, assocName, className);

  const foreignKeyColumns = ownerForeignKeyColumns(ctor, assocName, options);
  const foreignKey: string | string[] =
    foreignKeyColumns.length === 1 ? foreignKeyColumns[0] : foreignKeyColumns;

  const reflection = ctor._reflectOnAssociation?.(assocName);
  if (options.through && !reflection) return null;

  if (options.as && !reflection) {
    if (Array.isArray(foreignKey)) {
      routeThroughCheckValidity(ctor, assocName);
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
    if (Array.isArray(primaryKey) && !primaryKey.includes("id")) {
      routeThroughCheckValidity(ctor, assocName);
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
  }
  const reflForOwnerFk = _ownerChainReflection(reflection);
  const fkCheckPks = reflForOwnerFk
    ? Array.isArray(reflForOwnerFk.joinForeignKey)
      ? reflForOwnerFk.joinForeignKey
      : [reflForOwnerFk.joinForeignKey]
    : Array.isArray(primaryKey)
      ? primaryKey
      : [primaryKey];
  for (const pk of fkCheckPks) {
    const v = record._readAttribute(pk);
    if (v === null || v === undefined) return null;
  }

  let rel: any;
  if (reflection) {
    const built = _builtAssociationScope(record, assocName, reflection, targetModel);
    const baseRelation = _scopeForAssociation(targetModel);
    rel = baseRelation.merge(built);
    rel = applyAssociationScope(rel, assocDef.scope, record, reflection.scope);
  } else {
    if (Array.isArray(foreignKey)) {
      const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
      const pkCols = Array.isArray(ownerKey) ? ownerKey : [ownerKey];
      if (pkCols.length !== foreignKey.length) {
        routeThroughCheckValidity(ctor, assocName);
        throw new CompositePrimaryKeyMismatchError({
          activeRecord: ctor.name,
          name: assocName,
          primaryKey: pkCols,
          foreignKey,
        });
      }
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.length; i++) {
        conditions[foreignKey[i]] = record._readAttribute(pkCols[i]);
      }
      rel = _scopeForAssociation(targetModel).where(conditions);
    } else if (options.as) {
      const typeCol = `${underscore(options.as)}_type`;
      const { fkCols, ownerKeyCols } = _inlinePolymorphicKeys(
        ctor,
        options,
        primaryKey,
        foreignKey,
      );
      const conditions: Record<string, unknown> = { [typeCol]: ctor.polymorphicName() };
      for (let i = 0; i < fkCols.length; i++) {
        conditions[fkCols[i]] = record._readAttribute(ownerKeyCols[i]);
      }
      rel = _scopeForAssociation(targetModel).where(conditions);
    } else {
      const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
      rel = _scopeForAssociation(targetModel).where({
        [foreignKey]: record._readAttribute(ownerKey as string),
      });
    }
    rel = applyAssociationScope(rel, assocDef.scope, record);
  }
  return rel;
}

Object.assign(HasManyAssociation.prototype, {
  updateCounterInMemory,
  updateCounterIfSuccess,
  updateCounter,
  deleteCount,
});
