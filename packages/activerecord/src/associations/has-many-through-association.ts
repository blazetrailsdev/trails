import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { association, _buildAssociationInstance } from "./instance-methods.js";
import { HasManyAssociation } from "./has-many-association.js";
import { underscore, singularize, pluralize, camelize, isBlank } from "@blazetrails/activesupport";
import {
  resolveAssocClass,
  association as collectionProxyFor,
  applyAssociationScope,
  _hmtNotFound,
} from "../associations.js";
import { ThroughAssociation, sourceReflection, throughBuildRecord } from "./through-association.js";
import { associationKeysEqual } from "./key-normalization.js";
import { isThenable } from "./collection-association.js";
import { runCallbacks } from "@blazetrails/activesupport";

export class HasManyThroughAssociation extends HasManyAssociation {
  /** @internal */
  _throughScope?: unknown;

  constructor(owner: Base, reflection: AssociationDefinition) {
    super(owner, reflection);
  }

  /** @internal */
  declare buildThroughRecord: (record: Base) => Base | null;
  /** @internal */
  declare throughScope: () => unknown;
  /** @internal */
  declare throughScopeAttributes: () => Record<string, unknown>;
  /** @internal */
  declare saveThroughRecord: (record: Base) => Promise<boolean>;
  /** @internal */
  declare throughRecordsFor: (record: Base) => Base[];
  /** @internal */
  declare deleteThroughRecords: (records: Base[]) => void;
  /** @internal */
  declare throughReflection: () => unknown;
  /** @internal */
  declare throughAssociation: () => unknown;
  /** @internal */
  declare constructJoinAttributes: (...records: Base[]) => Record<string, unknown>;
  /** @internal */
  declare ensureMutable: () => void;
  /** @internal */
  declare ensureNotNested: () => void;

  protected override async findTarget(): Promise<Base[]> {
    if (this._queryExecutor) return super.findTarget();
    if (!this.targetReflectionHasAssociatedRecord()) return [];
    if (this.disableJoins) return this.scope().toArray();
    return super.findTarget();
  }

  /** @internal */
  protected loadHasManyThrough(): Promise<Base[]> {
    return loadHasManyThrough(this.owner, this.reflection.name, this.reflection);
  }

  protected targetReflectionHasAssociatedRecord(): boolean {
    const throughAssoc = (this.owner.constructor as typeof Base)._reflectOnAssociation(
      this.reflection.options.through!,
    ) as unknown as AssociationDefinition | null;
    if (!throughAssoc) return true;
    return targetReflectionHasAssociatedRecord(this.owner, throughAssoc);
  }

  protected override difference(a: Base[], b: Base[]): Base[] {
    const distribution = this.distribution(b);
    return a.filter((record) => !this.markOccurrence(distribution, record));
  }

  protected override intersection(a: Base[], b: Base[]): Base[] {
    const distribution = this.distribution(b);
    return a.filter((record) => this.markOccurrence(distribution, record));
  }

  protected markOccurrence(distribution: Occurrences, record: Base): boolean {
    return markOccurrence(distribution, record);
  }

  /** @missingRailsCall new — PERMANENT */
  protected distribution(array: Base[]): Occurrences {
    return distribution(array);
  }

  sourceReflection(): unknown {
    return sourceReflection(this);
  }

  /** @internal */
  protected override concatRecords(records: Base[]): Promise<Base[]> | Base[] {
    this.ensureNotNested();
    const concatenated = super.concatRecords(records, true);
    const buildThroughRecords = (added: Base[]): Base[] => {
      if (this.owner.isNewRecord() && added) {
        for (const record of added.flat()) {
          this.buildThroughRecord(record);
        }
      }
      return added;
    };
    return isThenable(concatenated)
      ? concatenated.then(buildThroughRecords)
      : buildThroughRecords(concatenated);
  }

  override async insertRecord(
    record: Base,
    validate = true,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<boolean> {
    this.ensureNotNested();
    const needsTargetSave = record.isNewRecord() || record.hasChangesToSave;
    if (needsTargetSave) {
      const saved = await super.insertRecord(record, validate, raise, block);
      if (!saved) return false;
    }
    return this.saveThroughRecord(record);
  }

  /**
   * @internal
   * @missingRailsCall map — PERMANENT
   */
  override buildRecord(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Base | null {
    this.ensureNotNested();
    this._throughScope = this.scope();
    try {
      throughBuildRecord(this, (attributes ??= {}));
      const record = super.buildRecord(attributes, block);
      if (!record) return record;
      const built = buildThroughInverseFor(this.owner, this.reflection, record, this._throughScope);
      if (built) {
        const inverseAssoc = (
          record as unknown as { association?: (n: string) => any }
        ).association?.(built.inverseName);
        if (inverseAssoc) {
          if (built.isCollection) {
            inverseAssoc.addToTarget?.(built.throughRecord);
          } else if (built.isHasOne) {
            if (typeof inverseAssoc.syncWrite === "function") {
              inverseAssoc.syncWrite(built.throughRecord);
            } else {
              inverseAssoc.target = built.throughRecord;
            }
            inverseAssoc.setInverseInstance?.(built.throughRecord);
          } else if (typeof inverseAssoc.writer === "function") {
            inverseAssoc.writer(built.throughRecord);
          }
        }
      }
      return record;
    } finally {
      this._throughScope = null;
    }
  }

  /** @internal */
  protected override isInvertibleFor(_record: Base): boolean {
    return false;
  }

  /** @internal */
  protected override removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> | boolean {
    const removed = super.removeRecords(existingRecords, records, method);
    if (isThenable(removed)) {
      return removed.then(() => {
        this.deleteThroughRecords(records);
        return true;
      });
    }
    this.deleteThroughRecords(records);
    return true;
  }

  /**
   * @internal
   * @missingRailsCall count — PERMANENT
   */
  protected override async deleteRecords(records: Base[], method: string): Promise<number> {
    this.ensureNotNested();
    const throughName = this.reflection.options.through;
    const owner = this.owner as unknown as { association?: (n: string) => any };
    const throughAssoc = throughName ? (owner.association?.(throughName) ?? null) : null;
    if (!throughAssoc) return 0;

    let scope: any = throughAssoc.scope();
    scope = scope.where(this.constructJoinAttributes(...records));
    const extra = this.throughScopeAttributes();
    if (Object.keys(extra).length > 0) scope = scope.where(extra);

    const ctor = this.owner.constructor as {
      _reflectOnAssociation?: (n: string) => RichCounterReflection | undefined;
    };
    const ownRefl = ctor._reflectOnAssociation?.(this.reflection.name);
    const sourceRefl = (ownRefl as { sourceReflection?: SourceCounterReflection } | undefined)
      ?.sourceReflection;

    let count = 0;
    if (method === "destroy") {
      if ((scope.model as typeof Base | undefined)?.primaryKey) {
        const destroyed = (await scope.destroyAll()) as Base[];
        count = destroyed.filter((r) => (r as any).isDestroyed?.()).length;
      } else {
        const recs = (await scope.toArray()) as Base[];
        for (const r of recs) {
          await runCallbacks(r as any, "destroy");
        }
        count = await scope.deleteAll();
      }
    } else if (method === "nullify") {
      count = await scope.updateAll({
        [sourceRefl?.foreignKey ?? `${underscore(singularize(this.reflection.name))}_id`]: null,
      });
    } else {
      count = await scope.deleteAll();
    }

    this.deleteThroughRecords(records);

    if (method !== "destroy" && sourceRefl?.options?.counterCache) {
      const counter = sourceRefl.counterCacheColumn?.();
      const klass = this.klass as {
        decrementCounter?: (col: string, ids: unknown) => Promise<unknown>;
      };
      if (typeof counter === "string" && klass.decrementCounter) {
        await klass.decrementCounter(
          counter,
          records.map((record) => (record as any).id),
        );
      }
    }

    if (count > 0) {
      const throughReflection = this.throughReflection() as
        | (AssociationDefinition & RichCounterReflection)
        | null;
      if (throughReflection?.isCollection?.() && updateThroughCounter.call(this, method)) {
        await this.updateCounter(-count, throughReflection);
      } else {
        await this.updateCounter(-count);
      }
    }

    return count;
  }

  /** @internal */
  protected override async deleteOrNullifyAllRecords(method?: string): Promise<number> {
    return this.deleteRecords(await this.loadTarget(), method ?? "");
  }
}

/** @internal */
interface SourceCounterReflection {
  foreignKey?: string;
  options?: { counterCache?: unknown };
  counterCacheColumn?: () => string | null;
  klass?: unknown;
}

export interface BuiltThroughInverse {
  inverseName: string;
  isCollection: boolean;
  isHasOne: boolean;
  throughRecord: Base;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function buildThroughInverseFor(
  owner: Base,
  reflection: AssociationDefinition,
  record: Base,
  throughScope?: unknown,
): BuiltThroughInverse | null {
  const assoc = {
    owner,
    reflection,
    _throughScope: throughScope,
    ...throughAssociationMethods,
  } as unknown as HasManyThroughAssociation;
  const ctor = owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(reflection.name);
  const sourceRefl = refl?.sourceReflection;
  if (!sourceRefl) return null;

  const inverse = sourceRefl.isPolymorphic?.()
    ? sourceRefl.polymorphicInverseOf?.(record.constructor as any)
    : sourceRefl.inverseOf?.();
  if (!inverse?.name) return null;

  const throughRecord = assoc.buildThroughRecord(record);
  if (!throughRecord) return null;

  return {
    inverseName: inverse.name,
    isCollection: !!inverse.isCollection?.(),
    isHasOne: !!inverse.isHasOne?.(),
    throughRecord,
  };
}

/** @internal */
function buildThroughRecord(this: HasManyThroughAssociation, record: Base): Base | null {
  const cache = throughRecordsCache(this);
  const cached = cache.get(record);
  if (cached) return cached;

  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  const proxy = throughProxy(this);
  if (!proxy || typeof proxy.build !== "function" || !sourceRefl?.name) return null;

  const existingTarget = proxy.loaded ? proxy.target : undefined;
  if (existingTarget && !Array.isArray(existingTarget)) {
    cache.set(record, existingTarget);
    return existingTarget;
  }

  const attributes = this.throughScopeAttributes();
  if (sourceRefl?.isBelongsTo?.() ?? sourceRefl?.macro === "belongsTo") {
    attributes[sourceRefl.name] = record;
  }
  const newRecord = proxy.build(attributes);
  if (this.reflection.options.sourceType && sourceRefl.foreignType) {
    (newRecord as any).writeAttribute?.(sourceRefl.foreignType, this.reflection.options.sourceType);
  }
  cache.set(record, newRecord);
  return newRecord;
}

/** @internal */
function throughScope(this: HasManyThroughAssociation): unknown {
  return (this as any)._throughScope ?? null;
}

/** @internal */
function throughScopeAttributes(this: HasManyThroughAssociation): Record<string, unknown> {
  const throughName = this.reflection.options.through;
  if (!throughName) return {};
  const throughAssoc = (this.owner as any).association?.(throughName);
  if (!throughAssoc) return {};
  const scope: any = this.throughScope() ?? (this as any).scope?.() ?? throughAssoc.scope?.();
  if (!scope || typeof scope.whereValuesHash !== "function") return {};
  const throughTable = throughAssoc.klass?.tableName ?? "";
  const attrs = scope.whereValuesHash(throughTable) as Record<string, unknown>;
  const throughFk = throughAssoc.reflection?.options?.foreignKey ?? "";
  const inheritanceCol = throughAssoc.klass?.inheritanceColumn ?? "type";
  for (const key of [String(throughFk), inheritanceCol]) {
    if (key in attrs) delete attrs[key];
  }
  return attrs;
}

/** @internal */
async function saveThroughRecord(this: HasManyThroughAssociation, record: Base): Promise<boolean> {
  const throughKlass = (this.throughReflection() as { klass?: any } | null)?.klass;
  if (typeof throughKlass?.ensureSchemaLoaded === "function") {
    await throughKlass.ensureSchemaLoaded();
  }
  try {
    const joinRecord = this.buildThroughRecord(record);
    if (!joinRecord) return true;
    if (!joinRecord.isChanged) return true;
    await (joinRecord as any).saveBang();
    return true;
  } finally {
    throughRecordsCache(this).delete(record);
  }
}

/** @internal */
function throughRecordsCache(assoc: HasManyThroughAssociation): Map<Base, Base> {
  const owner = assoc.owner as unknown as {
    _throughRecordsCaches?: Map<string, Map<Base, Base>>;
  };
  const store = (owner._throughRecordsCaches ??= new Map<string, Map<Base, Base>>());
  let cache = store.get(assoc.reflection.name);
  if (!cache) {
    cache = new Map<Base, Base>();
    store.set(assoc.reflection.name, cache);
  }
  return cache;
}

/** @internal */
function isTargetReflectionHasAssociatedRecord(assoc: HasManyThroughAssociation): boolean {
  const throughRefl = assoc.reflection.options.through;
  if (!throughRefl) return false;
  const throughAssoc = (assoc.owner as any).association?.(throughRefl);
  if (!throughAssoc) return false;
  const fk = throughAssoc.reflection?.foreignKey;
  if (!fk) return true;
  return !!(assoc.owner as any).readAttribute?.(fk as string);
}

/** @internal */
interface RichCounterReflection {
  isCollection?: () => boolean;
  hasCachedCounter?: () => boolean;
  counterCacheColumn?: () => string | null;
  isInverseUpdatesCounterCache?: () => unknown;
}

/** @internal */
function updateThroughCounter(this: HasManyThroughAssociation, method: string): boolean {
  const throughReflection = this.throughReflection() as RichCounterReflection | null;
  if (method === "destroy") return !throughReflection?.isInverseUpdatesCounterCache?.();
  if (method === "nullify") return false;
  return true;
}

/** @internal */
function throughRecordsFor(this: HasManyThroughAssociation, record: Base): Base[] {
  const throughName = this.reflection.options.through;
  if (!throughName) return [];
  const proxy = throughProxy(this);
  if (!proxy) return [];

  const joinAttrs = this.constructJoinAttributes(record);
  const candidates: Base[] = Array.isArray(proxy.target)
    ? proxy.target
    : proxy.target
      ? [proxy.target]
      : [];
  return candidates.filter((c) =>
    Object.entries(joinAttrs).every(([key, val]) => {
      const joinRefl = (c.constructor as any)._reflectOnAssociation?.(key);
      if (joinRefl) {
        const target = (c as any).association?.(key)?.target;
        return Array.isArray(target) ? target.includes(val as Base) : target === val;
      }
      const actual =
        typeof (c as any).readAttribute === "function"
          ? (c as any).readAttribute(key)
          : (c as any)[key];
      return associationKeysEqual(actual, val);
    }),
  );
}

/** @internal */
function deleteThroughRecords(this: HasManyThroughAssociation, records: Base[]): void {
  const throughName = this.reflection.options.through;
  if (!throughName) return;
  const proxy = throughProxy(this);
  const cache = throughRecordsCache(this);
  if (!proxy) return;
  for (const record of records) {
    const toDelete = this.throughRecordsFor(record);
    if (Array.isArray(proxy.target)) {
      for (const r of toDelete) {
        const idx = proxy.target.indexOf(r);
        if (idx !== -1) proxy.target.splice(idx, 1);
      }
    } else if (toDelete.length > 0 && proxy.target === toDelete[0]) {
      (proxy as { target?: Base | null }).target = null;
    }
    cache.delete(record);
  }
}

/** @internal */
type Occurrences = Array<{ record: Base; count: number }>;

/** @internal */
function distribution(array: Base[]): Occurrences {
  const distribution: Occurrences = [];
  for (const record of array) {
    const bucket = distribution.find((b) => b.record.equals(record));
    if (bucket) bucket.count += 1;
    else distribution.push({ record, count: 1 });
  }
  return distribution;
}

/** @internal */
function markOccurrence(distribution: Occurrences, record: Base): boolean {
  const bucket = distribution.find((b) => b.record.equals(record));
  if (!bucket || bucket.count <= 0) return false;
  bucket.count -= 1;
  return true;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function multisetDifference(a: Base[], b: Base[]): Base[] {
  const buckets = distribution(b);
  return a.filter((record) => !markOccurrence(buckets, record));
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function multisetIntersection(a: Base[], b: Base[]): Base[] {
  const buckets = distribution(b);
  return a.filter((record) => markOccurrence(buckets, record));
}

/** @internal */
interface ThroughTargetStore {
  build?: (attrs: Record<string, unknown>) => Base;
  loaded?: boolean;
  target?: Base[] | Base | null;
}

function throughProxy(assoc: HasManyThroughAssociation): ThroughTargetStore | null {
  const tr = assoc.throughReflection() as {
    name?: string;
    isCollection?: () => boolean;
    macro?: string;
  } | null;
  if (!tr?.name) return null;
  const isCollection = tr.isCollection?.() ?? tr.macro === "hasMany";
  if (isCollection) {
    return collectionProxyFor(assoc.owner, tr.name) as unknown as ThroughTargetStore;
  }
  const oo = (assoc.owner as unknown as { association?: (n: string) => any }).association?.(
    tr.name,
  );
  if (!oo) return null;
  return {
    build: typeof oo.build === "function" ? oo.build.bind(oo) : undefined,
    get loaded() {
      return oo.isLoaded?.() ?? false;
    },
    get target() {
      return oo.target;
    },
    set target(v: Base[] | Base | null) {
      oo._writeTargetStore(v);
    },
  };
}

/** @internal */
function targetReflectionHasAssociatedRecord(
  record: Base,
  throughAssoc: AssociationDefinition,
): boolean {
  if (throughAssoc.macro !== "belongsTo") return true;
  const fk = throughAssoc.options.foreignKey ?? `${underscore(throughAssoc.name)}_id`;
  const columns = Array.isArray(fk) ? fk : [fk];
  return !columns.every((column) => isBlank(record._readAttribute(String(column))));
}

function findHasManyTarget(
  record: Base,
  assocName: string,
  assocDef: Pick<AssociationDefinition, "options" | "scope">,
): Promise<Base[]> {
  const assoc = _buildAssociationInstance.call(record, {
    name: assocName,
    type: "hasMany",
    scope: assocDef.scope,
    options: assocDef.options,
  });
  return (assoc as unknown as { findTarget(): Promise<Base[]> }).findTarget();
}

async function loadHasManyThrough(
  record: Base,
  assocName: string,
  assocDef: AssociationDefinition,
): Promise<Base[]> {
  const options = assocDef.options;
  const ctor = record.constructor as typeof Base;
  const throughAssoc = ctor._reflectOnAssociation(
    options.through!,
  ) as unknown as AssociationDefinition | null;
  if (!throughAssoc) {
    throw _hmtNotFound(ctor, assocName);
  }
  if (!targetReflectionHasAssociatedRecord(record, throughAssoc)) return [];

  const className = options.className ?? camelize(singularize(assocName));
  const targetModel = resolveAssocClass(record, assocName, className);

  const sourceName = options.source ?? singularize(assocName);

  const throughClassName =
    throughAssoc.options.className ?? camelize(singularize(throughAssoc.name));
  const throughModel = resolveAssocClass(record, throughAssoc.name, throughClassName);
  const sourceAssoc =
    throughModel._reflectOnAssociation(sourceName) ??
    throughModel._reflectOnAssociation(pluralize(sourceName));
  const sourceAssocKind = sourceAssoc?.macro ?? "belongsTo";

  let throughRecords: Base[];
  if (throughAssoc.macro === "hasMany") {
    if (
      options.sourceType &&
      sourceAssoc?.options?.polymorphic &&
      sourceAssocKind === "belongsTo"
    ) {
      const resolvedSourceName = sourceAssoc?.name ?? sourceName;
      const sourceTypeCol = `${underscore(resolvedSourceName)}_type`;
      const originalScope = throughAssoc.scope;
      const augmentedDefinition = {
        options: throughAssoc.options,
        scope: (rel: any) => {
          let r = rel.where({ [sourceTypeCol]: options.sourceType });
          if (originalScope) r = originalScope(r);
          return r;
        },
      };
      throughRecords = await findHasManyTarget(record, throughAssoc.name, augmentedDefinition);
    } else {
      throughRecords = await findHasManyTarget(record, throughAssoc.name, throughAssoc);
    }
  } else if (throughAssoc.macro === "hasOne") {
    const one = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
    throughRecords = one ? [one] : [];
  } else if (throughAssoc.macro === "belongsTo") {
    const one = (await association.call(record, throughAssoc.name).loadTarget()) as Base | null;
    throughRecords = one ? [one] : [];
  } else {
    throughRecords = [];
  }

  if (throughRecords.length === 0) return [];

  if (sourceAssocKind === "belongsTo") {
    const targetFk = sourceAssoc?.options?.foreignKey ?? `${underscore(sourceName)}_id`;

    const targetIds = throughRecords
      .map((r) => r._readAttribute(targetFk as string))
      .filter((v) => v !== null && v !== undefined);
    if (targetIds.length === 0) return [];
    let rel = targetModel.all().where({ [targetModel.primaryKey as string]: targetIds });
    rel = applyAssociationScope(rel, assocDef.scope, record);
    return rel.toArray();
  } else if (sourceAssoc?.options?.through) {
    const results: Base[] = [];
    for (const tr of throughRecords) {
      const sub = await findHasManyTarget(tr, sourceAssoc.name, sourceAssoc);
      results.push(...sub);
    }
    if (!assocDef.scope) return results;
    const ids = results
      .map((r) => r._readAttribute(targetModel.primaryKey as string))
      .filter((v) => v !== null && v !== undefined);
    if (ids.length === 0) return [];
    const rel = applyAssociationScope(
      targetModel.all().where({ [targetModel.primaryKey as string]: ids }),
      assocDef.scope,
      record,
    );
    return rel.toArray();
  } else {
    const sourceAsName = sourceAssoc?.options?.as as string | undefined;
    const sourceFk = sourceAsName
      ? (sourceAssoc?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
      : (sourceAssoc?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
    const throughIds = throughRecords
      .map((r) => r._readAttribute((r.constructor as typeof Base).primaryKey as string))
      .filter((v) => v !== null && v !== undefined);
    if (throughIds.length === 0) return [];
    const whereConditions: Record<string, unknown> = { [sourceFk as string]: throughIds };
    if (sourceAsName) whereConditions[`${underscore(sourceAsName)}_type`] = throughClassName;
    let rel = targetModel.all().where(whereConditions);
    rel = applyAssociationScope(rel, assocDef.scope, record);
    return rel.toArray();
  }
}

const throughAssociationMethods = {
  buildThroughRecord,
  throughScope,
  throughScopeAttributes,
  saveThroughRecord,
  throughRecordsFor,
  deleteThroughRecords,
  ...ThroughAssociation,
};

Object.assign(HasManyThroughAssociation.prototype, throughAssociationMethods);
