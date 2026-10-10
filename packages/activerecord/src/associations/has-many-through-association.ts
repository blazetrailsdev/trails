import { Associations } from "../namespaces.js";
import type { Base } from "../base.js";
import type { AssociationReflection } from "../reflection.js";
import type { AssociationDefinition } from "../associations.js";
import { HasManyAssociation } from "./has-many-association.js";
import {
  aryCount,
  aryDelete,
  Hash,
  include,
  NotImplementedError,
  rbEqual,
  rbFPublicSend,
  rbFSend,
} from "@blazetrails/ruby-compat";
import { underscore, isBlank, wrap } from "@blazetrails/activesupport";
import { ThroughAssociation } from "./through-association.js";
import { isThenable, type CollectionAssociation } from "./collection-association.js";
import type { Association } from "./association.js";

export class HasManyThroughAssociation extends HasManyAssociation {
  /** @internal */
  _throughScope?: unknown;
  /** @internal */
  _throughRecords: Hash<Base, Base>;

  constructor(owner: Base, reflection: AssociationDefinition) {
    super(owner, reflection);
    this._throughRecords = new Hash<Base, Base>().compareByIdentity();
  }

  /** @internal */
  declare buildThroughRecord: (record: Base) => Base;
  /** @internal */
  declare throughScope: () => unknown;
  /** @internal */
  declare throughScopeAttributes: () => Record<string, unknown>;
  /** @internal */
  declare saveThroughRecord: (record: Base) => Promise<boolean>;
  /** @internal */
  declare throughRecordsFor: (record: Base) => Promise<Base[]>;
  /** @internal */
  declare deleteThroughRecords: (records: Base[]) => Promise<void>;
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
  declare sourceReflection: () => AssociationReflection;

  protected override async findTarget({ async = false }: { async?: boolean } = {}): Promise<
    Base[]
  > {
    if (async)
      // @nie disposition=TODO
      throw new NotImplementedError("No async loading for HasManyThroughAssociation yet");
    if (!this.targetReflectionHasAssociatedRecord()) return [];
    if (this.disableJoins) return this.scope().toArray();
    return super.findTarget({ async }) as Promise<Base[]>;
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

  protected markOccurrence(distribution: Distribution, record: Base): false | Distribution {
    return distribution.get(record)! > 0 && distribution.set(record, distribution.get(record)! - 1);
  }

  protected distribution(array: Base[]): Distribution {
    const distribution: Distribution = new Hash(0);
    for (const record of array) {
      distribution.set(record, distribution.get(record)! + 1);
    }
    return distribution;
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   */
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
   * @missingRailsName class — PERMANENT
   */
  override buildRecord(
    attributes?: Record<string, unknown>,
    block?: (record: Base) => void,
  ): Base | null {
    this.ensureNotNested();
    this._throughScope = this.scope();
    try {
      const record = super.buildRecord((attributes ??= {}), block)!;

      const inverse = this.sourceReflection().isPolymorphic()
        ? this.sourceReflection().polymorphicInverseOf(record.constructor as typeof Base)
        : this.sourceReflection().inverseOf();

      if (inverse) {
        if (inverse.isCollection()) {
          (record.association(inverse.name) as CollectionAssociation).addToTarget(
            this.buildThroughRecord(record),
          );
        } else if (inverse.isHasOne()) {
          (
            record.association(inverse.name) as unknown as {
              syncWrite(record: Base | null): void;
            }
          ).syncWrite(this.buildThroughRecord(record));
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

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   */
  protected override removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> | boolean {
    const removed = super.removeRecords(existingRecords, records, method);
    if (isThenable(removed)) {
      return removed.then(async () => {
        await this.deleteThroughRecords(records);
        return true;
      });
    }
    return this.deleteThroughRecords(records).then(() => true);
  }

  /** @internal */
  protected override async deleteRecords(records: Base[], method: string): Promise<number> {
    this.ensureNotNested();

    let scope = (this.throughAssociation() as any).scope();
    scope.whereBang(this.constructJoinAttributes(...records));
    scope = scope.where(this.throughScopeAttributes());

    let count: number;
    switch (method) {
      case "destroy":
        if (scope.model.primaryKey != null) {
          count = aryCount((await scope.destroyAll()) as Base[], (r) => r.isDestroyed());
        } else {
          for (const r of (await scope.toArray()) as Base[]) await r.runCallbacks("destroy");
          count = await scope.deleteAll();
        }
        break;
      case "nullify":
        count = await scope.updateAll({ [this.sourceReflection().foreignKey() as string]: null });
        break;
      default:
        count = await scope.deleteAll();
    }

    await this.deleteThroughRecords(records);

    if (this.sourceReflection().options.counterCache && method !== "destroy") {
      const counter = this.sourceReflection().counterCacheColumn();
      await (this.klass as any).decrementCounter(
        counter,
        records.map((record) => record.id),
      );
    }

    const throughReflection = this.throughReflection() as AssociationDefinition &
      RichCounterReflection;
    if (throughReflection.isCollection() && updateThroughCounter.call(this, method)) {
      await this.updateCounter(-count, throughReflection);
    } else {
      await this.updateCounter(-count);
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
  foreignKey?: () => string;
  options?: { counterCache?: unknown };
  counterCacheColumn?: () => string | null;
  klass?: unknown;
}

/** @internal */
function buildThroughRecord(this: HasManyThroughAssociation, record: Base): Base {
  const cache = this._throughRecords;
  const cached = cache.get(record);
  if (cached) return cached;

  this.ensureMutable();

  const attributes = this.throughScopeAttributes();
  attributes[this.sourceReflection().name] = record;

  const newRecord = (this.throughAssociation() as CollectionAssociation).build(attributes);
  if (this.reflection.options.sourceType) {
    rbFSend(
      newRecord,
      `${this.sourceReflection().foreignType}=`,
      this.reflection.options.sourceType,
    );
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
    this._throughRecords.delete(record);
  }
}

/** @internal */
function isTargetReflectionHasAssociatedRecord(assoc: HasManyThroughAssociation): boolean {
  const throughRefl = assoc.reflection.options.through;
  if (!throughRefl) return false;
  const throughAssoc = (assoc.owner as any).association?.(throughRefl);
  if (!throughAssoc) return false;
  const fk = throughAssoc.reflection?.foreignKey();
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
async function throughRecordsFor(this: HasManyThroughAssociation, record: Base): Promise<Base[]> {
  const attributes = this.constructJoinAttributes(record);
  const candidates = wrap((this.throughAssociation() as Association).target);
  const found: Base[] = [];
  for (const c of candidates) {
    let all = true;
    for (const [key, value] of Object.entries(attributes)) {
      if (!rbEqual(await rbFPublicSend(c, key), value)) {
        all = false;
        break;
      }
    }
    if (all) found.push(c);
  }
  return found;
}

/** @internal */
async function deleteThroughRecords(
  this: HasManyThroughAssociation,
  records: Base[],
): Promise<void> {
  const throughAssociation = this.throughAssociation() as Association;
  for (const record of records) {
    const throughRecords = await this.throughRecordsFor(record);

    if ((this.throughReflection() as AssociationReflection).isCollection()) {
      for (const r of throughRecords) aryDelete(throughAssociation.target as Base[], r);
    } else {
      if (throughRecords.some((r) => rbEqual(r, throughAssociation.target))) {
        throughAssociation.target = null;
      }
    }

    this._throughRecords.delete(record);
  }
}

/** @internal */
type Distribution = Hash<Base, number>;

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

const throughAssociationMethods = {
  buildThroughRecord,
  throughScope,
  throughScopeAttributes,
  saveThroughRecord,
  throughRecordsFor,
  deleteThroughRecords,
};

Object.assign(HasManyThroughAssociation.prototype, throughAssociationMethods);
include(HasManyThroughAssociation, ThroughAssociation);

Associations.HasManyThroughAssociation = HasManyThroughAssociation;
