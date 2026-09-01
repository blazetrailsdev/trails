import type { Base } from "./base.js";
import type { CollectionAssociation } from "./associations/collection-association.js";
import { modelRegistry, association as collectionProxyFor } from "./associations.js";
import { ActiveRecordError, UnknownAttributeError, RecordNotFound } from "./errors.js";
import { singularize, camelize, isBlank } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { defineAutosaveValidationCallbacks } from "./autosave-association.js";
import { BooleanType } from "@blazetrails/activemodel";

export class TooManyRecords extends ActiveRecordError {
  constructor(message?: string) {
    super(message);
    this.name = "TooManyRecords";
  }
}

export function _destroy(this: Base): boolean {
  return this.markedForDestruction();
}

export const REJECT_ALL_BLANK_PROC = (attributes: Record<string, unknown>): boolean =>
  Object.entries(attributes).every(([key, value]) => key === "_destroy" || isBlank(value));

export interface NestedAttributeOptions {
  allowDestroy?: boolean;
  rejectIf?: ((attrs: Record<string, unknown>, record: Base) => boolean) | "all_blank";
  limit?: number | string | ((...args: unknown[]) => number);
  updateOnly?: boolean;
}

export function acceptsNestedAttributesFor(
  modelClass: typeof Base,
  associationName: string,
  options: NestedAttributeOptions = {},
): void {
  if (options.rejectIf === "all_blank") {
    options = { ...options, rejectIf: REJECT_ALL_BLANK_PROC };
  }

  const reflection = (modelClass as any)._reflectOnAssociation?.(associationName);
  if (!reflection) {
    throw new Error(`No association found for name '${associationName}'. Has it been defined yet?`);
  }

  reflection.autosave = true;

  defineAutosaveValidationCallbacks.call(modelClass, reflection);

  const nestedAttributesOptions = { ...modelClass.nestedAttributesOptions };
  nestedAttributesOptions[associationName] = options;
  modelClass.nestedAttributesOptions = nestedAttributesOptions;

  const type = reflection.isCollection() ? "collection" : "one_to_one";
  modelClass.generateAssociationWriter(associationName, type);
}

export function assignNestedAttributes(
  record: Base,
  associationName: string,
  attributesArray: Record<string, unknown> | Record<string, unknown>[],
): Promise<void> | void {
  const ctor = record.constructor as typeof Base;
  const reflection = (ctor as any)._reflectOnAssociation?.(associationName);
  if (reflection?.isCollection()) {
    return assignNestedAttributesForCollectionAssociation(
      record,
      associationName,
      attributesArray as Record<string, unknown>[],
    );
  }
  return assignNestedAttributesForOneToOneAssociation(
    record,
    associationName,
    attributesArray as Record<string, unknown>,
  );
}

const UNASSIGNABLE_KEYS = ["id", "_destroy"] as const;

/** @internal */
const _booleanType = new BooleanType();

/** @internal */
export function hasDestroyFlag(hash: Record<string, unknown>): boolean {
  return _booleanType.cast(hash["_destroy"]) === true;
}

/** @internal */
export function isAllowDestroy(this: Base, associationName: string): boolean {
  const ctor = this.constructor as typeof Base;
  return ctor.nestedAttributesOptions[associationName]?.allowDestroy ?? false;
}

/** @internal */
export function isWillBeDestroyed(
  this: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  return isAllowDestroy.call(this, associationName) && hasDestroyFlag(attributes);
}

/** @internal */
export function callRejectIf(
  this: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  if (isWillBeDestroyed.call(this, associationName, attributes)) return false;
  const ctor = this.constructor as typeof Base;
  const rejectIf = ctor.nestedAttributesOptions[associationName]?.rejectIf;
  return typeof rejectIf === "function" ? rejectIf(attributes, this) : false;
}

/** @internal */
export function isRejectNewRecord(
  this: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean {
  return (
    isWillBeDestroyed.call(this, associationName, attributes) ||
    callRejectIf.call(this, associationName, attributes)
  );
}

/** @internal */
export function assignToOrMarkForDestruction(
  record: Base,
  attributes: Record<string, unknown>,
  allowDestroy: boolean,
): Promise<void> | void {
  const pending = record.setAttributes(except(attributes, ...UNASSIGNABLE_KEYS));
  const markIfRequested = (): void => {
    if (hasDestroyFlag(attributes) && allowDestroy) {
      record.markForDestruction();
    }
  };
  return pending ? pending.then(markIfRequested) : markIfRequested();
}

/** @internal */
export function findRecordById(klass: typeof Base, records: Base[], id: unknown): Base | undefined {
  if (Array.isArray((klass as any).primaryKey)) {
    const needle = (Array.isArray(id) ? id : [id]).map(String);
    return records.find((r) => {
      const rid = Array.isArray(r.id) ? r.id : [r.id];
      return rid.map(String).join(",") === needle.join(",");
    });
  }
  return records.find((r) => String(r.id) === String(id));
}

/** @internal */
export function raiseNestedAttributesRecordNotFoundBang(
  record: Base,
  associationName: string,
  recordId: unknown,
): never {
  const ctor = record.constructor as typeof Base;
  const assocDef = (ctor as any)._reflectOnAssociation?.(associationName);
  const modelName = assocDef?.options?.className ?? camelize(singularize(associationName));
  throw new RecordNotFound(
    `Couldn't find ${modelName} with ID=${recordId} for ${ctor.name} with ID=${record.id}`,
    modelName,
    "id",
    recordId,
  );
}

/** @internal */
function resolveNestedLimit(
  limit: number | string | ((...args: unknown[]) => number) | undefined,
  record: Base,
): number | undefined {
  if (limit === undefined) return undefined;
  if (typeof limit === "function") return limit();
  if (typeof limit === "string") {
    const value = (record as unknown as Record<string, unknown>)[limit];
    return typeof value === "function" ? (value as () => number).call(record) : Number(value);
  }
  return limit;
}

/** @internal */
export function checkRecordLimitBang(
  limit: number | ((...args: unknown[]) => number) | undefined,
  attributesCollection: unknown[],
): void {
  if (limit === undefined) return;
  const resolved = typeof limit === "function" ? limit() : limit;
  if (resolved !== undefined && attributesCollection.length > resolved) {
    throw new TooManyRecords(
      `Maximum ${resolved} records are allowed. Got ${attributesCollection.length} records instead.`,
    );
  }
}

/** @internal */
export function generateAssociationWriter(
  this: typeof Base,
  associationName: string,
  type: "collection" | "one_to_one",
): void {
  const modelClass = this;
  const attrName = `${associationName}Attributes`;
  const assign: (record: Base, name: string, value: any) => Promise<void> | void =
    type === "collection"
      ? assignNestedAttributesForCollectionAssociation
      : assignNestedAttributesForOneToOneAssociation;

  Object.defineProperty(modelClass.prototype, `set${camelize(attrName, true)}`, {
    value(this: Base, value: any): Promise<void> | void {
      return assign(this, associationName, value);
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(modelClass.prototype, `${attrName}=`, {
    value(this: Base, value: any): Promise<void> | void {
      return assign(this, associationName, value);
    },
    writable: true,
    configurable: true,
  });
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE the `reflection.polymorphic?` guard Ruby writes inline in assign_nested_attributes (nested_attributes.rb:434).
 */
export function isPolymorphicBelongsTo(record: Base, associationName: string): boolean {
  const assocDef = (record.constructor as any)._reflectOnAssociation?.(associationName);
  return assocDef?.macro === "belongsTo" && Boolean(assocDef?.options?.polymorphic);
}

function assertNestedAttributesAreKnown(
  targetModel: typeof Base,
  assignable: Record<string, unknown>,
): void {
  const keys = Object.keys(assignable);
  if (keys.length === 0) return;
  const attributeTypes = targetModel.attributeTypes();
  if (Object.keys(attributeTypes).length === 0) return;
  let probe: Base | undefined;
  const pk = (targetModel as any).primaryKey;
  const pkColumns = new Set<string>((Array.isArray(pk) ? pk : [pk]).map(String));
  for (const key of keys) {
    if (Object.hasOwn(attributeTypes, key) || pkColumns.has(key)) continue;
    probe ??= new (targetModel as any)() as Base;
    if ((probe as any).hasAttribute(key)) continue;
    throw new UnknownAttributeError(probe as object, key);
  }
}

/** @internal */
interface OneToOneAssociation {
  target: Base | null;
  build(attrs: Record<string, unknown>): Base | null | Promise<Base | null>;
  buildRecord(attrs: Record<string, unknown>): Base | null;
  setNewRecord(record: Base): void | Promise<void>;
  initializeAttributes(record: Base): Promise<void> | void;
  isLoaded(): boolean;
  readonly reader?: Base | null | Promise<Base | null>;
  loadDisplacedForBuild?(): Promise<unknown> | null;
  detachDisplacedTarget?(): Promise<void>;
  displacementNeedsAwait?(): boolean;
}

/** @internal */
async function detachDisplacedThenSetNewRecord(
  assoc: OneToOneAssociation,
  built: Base | null,
): Promise<void> {
  await assoc.loadDisplacedForBuild?.();
  await assoc.detachDisplacedTarget?.();
  if (built) await assoc.setNewRecord(built);
}

/** @internal */
function hasNestedId(attributes: Record<string, unknown>): boolean {
  const id = (attributes as any).id;
  return id !== undefined && id !== null && id !== "";
}

function nestedTypeName(value: unknown): string {
  if (value === null) return "NilClass";
  if (value === undefined) return "undefined";
  switch (typeof value) {
    case "boolean":
      return value ? "TrueClass" : "FalseClass";
    case "number":
      return Number.isInteger(value) ? "Integer" : "Float";
    case "bigint":
      return "Integer";
    case "string":
      return "String";
    case "symbol":
      return "Symbol";
  }
  return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
}

/** @internal */
export function assignNestedAttributesForOneToOneAssociation(
  record: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): Promise<void> | void {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
    throw new Error(
      `Hash expected for \`${associationName}\` attributes, got ${nestedTypeName(attributes)}`,
    );
  }

  const ctor = record.constructor as typeof Base;
  const options = ctor.nestedAttributesOptions[associationName] ?? {};
  const updateOnly = options.updateOnly ?? false;
  const hasId = hasNestedId(attributes);

  const assoc = record.association(associationName) as unknown as OneToOneAssociation;
  if ((hasId || updateOnly) && assoc.isLoaded() === false && "reader" in assoc) {
    const read = assoc.reader;
    if (read instanceof Promise) {
      return read.then(() =>
        assignNestedAttributesForOneToOneAssociation(record, associationName, attributes),
      );
    }
  }
  const existingRecord = assoc.target ?? null;

  if (
    (updateOnly || hasId) &&
    existingRecord &&
    (updateOnly || String(existingRecord.id) === String((attributes as any).id))
  ) {
    if (!callRejectIf.call(record, associationName, attributes)) {
      return assignToOrMarkForDestruction(
        existingRecord,
        attributes,
        options.allowDestroy ?? false,
      );
    }
    return;
  }

  if (hasId) {
    raiseNestedAttributesRecordNotFoundBang(record, associationName, (attributes as any).id);
  }

  if (!isRejectNewRecord.call(record, associationName, attributes)) {
    const assignable = except(attributes, ...UNASSIGNABLE_KEYS);
    const targetModel = resolveCollectionTargetModel(record, associationName);
    if (targetModel) assertNestedAttributesAreKnown(targetModel, assignable);
    if (existingRecord && existingRecord.isNewRecord()) {
      const pending = existingRecord.setAttributes(assignable);
      if (pending) {
        return pending.then(() => assoc.initializeAttributes(existingRecord));
      }
      return assoc.initializeAttributes(existingRecord);
    } else {
      if (isPolymorphicBelongsTo(record, associationName)) {
        const buildMethod = `build${camelize(associationName, true)}`;
        const builder =
          buildMethod in (record as object)
            ? (record as unknown as Record<string, unknown>)[buildMethod]
            : undefined;
        if (typeof builder === "function") {
          (builder as (attrs: Record<string, unknown>) => unknown).call(record, assignable);
        } else {
          throw new Error(
            `Cannot build association \`${associationName}'. ` +
              `Are you trying to build a polymorphic one-to-one association?`,
          );
        }
      } else {
        const built = assoc.buildRecord(assignable);
        if (assoc.displacementNeedsAwait?.() === true) {
          return detachDisplacedThenSetNewRecord(assoc, built);
        }
        if (built) return assoc.setNewRecord(built);
      }
    }
  }
}

/** @internal */
export function assignNestedAttributesForCollectionAssociation(
  record: Base,
  associationName: string,
  attributesCollection: Record<string, unknown>[] | Record<string, Record<string, unknown>>,
): Promise<void> | void {
  if (typeof attributesCollection !== "object" || attributesCollection === null) {
    throw new Error(
      `Hash or Array expected for \`${associationName}\` attributes, got ${nestedTypeName(attributesCollection)}`,
    );
  }
  const ctor = record.constructor as typeof Base;
  const config = ctor.nestedAttributesOptions[associationName];

  let attrs: Record<string, unknown>[];
  if (Array.isArray(attributesCollection)) {
    attrs = attributesCollection;
  } else {
    const keys = Object.keys(attributesCollection);
    if (keys.includes("id")) {
      attrs = [attributesCollection as unknown as Record<string, unknown>];
    } else {
      attrs = keys.map((k) => (attributesCollection as any)[k]);
    }
  }

  checkRecordLimitBang(resolveNestedLimit(config?.limit, record), attrs);

  if (config?.allowDestroy) {
    const loaded = loadedCollectionTarget(record, associationName);
    if (loaded.length > 0) {
      const targetModel = resolveCollectionTargetModel(record, associationName);
      if (targetModel) {
        for (const a of attrs) {
          const id = a.id;
          if (id != null && id !== "" && hasDestroyFlag(a)) {
            const existing = findRecordById(targetModel, loaded, id);
            if (existing) existing.markForDestruction();
          }
        }
      }
    }
  }

  const collectionTargetModel = resolveCollectionTargetModel(record, associationName);
  const association = record.association(associationName) as CollectionAssociation;

  /** @noRailsEquivalent PERMANENT */
  const assignRecords = (existingRecords: Base[]): Promise<void> | void => {
    const nestedTarget: (Base | null)[] = [];
    let pending: Promise<void> | undefined;
    for (const a of attrs) {
      if (!hasNestedId(a)) {
        if (!isRejectNewRecord.call(record, associationName, a)) {
          if (collectionTargetModel)
            assertNestedAttributesAreKnown(collectionTargetModel, except(a, ...UNASSIGNABLE_KEYS));
          nestedTarget.push(
            collectionProxyFor(record, associationName).build(except(a, ...UNASSIGNABLE_KEYS)),
          );
        } else {
          nestedTarget.push(null);
        }
      } else {
        let existingRecord = collectionTargetModel
          ? findRecordById(collectionTargetModel, existingRecords, (a as any).id)
          : undefined;
        if (existingRecord) {
          if (!callRejectIf.call(record, associationName, a)) {
            const targetRecord = findRecordById(
              collectionTargetModel!,
              association.target,
              (a as any).id,
            );
            if (targetRecord) {
              existingRecord = targetRecord;
            } else {
              (association as any).addToTarget(existingRecord, { skipCallbacks: true });
            }

            const allowDestroy = isAllowDestroy.call(record, associationName);
            nestedTarget.push(existingRecord);
            pending = (
              pending
                ? pending.then(() => assignToOrMarkForDestruction(existingRecord!, a, allowDestroy))
                : assignToOrMarkForDestruction(existingRecord, a, allowDestroy)
            ) as Promise<void> | undefined;
          } else {
            nestedTarget.push(null);
          }
        } else {
          raiseNestedAttributesRecordNotFoundBang(record, associationName, (a as any).id);
        }
      }
    }
    association.nestedAttributesTarget = nestedTarget;
    return pending;
  };

  if (association.isLoaded()) return assignRecords(association.target);

  const attributeIds = attrs.map((a) => (a as any).id).filter((id) => id != null && id !== "");
  if (attributeIds.length === 0 || !collectionTargetModel) return assignRecords([]);

  const primaryKey = (collectionTargetModel as any).primaryKey;
  const scope = association.scope();
  /** @missingRailsArgs where — CONVERGEABLE expand-from-hash-drops-the-general-array-key-arm */
  const existingRecordsScope = Array.isArray(primaryKey)
    ? attributeIds
        .map((id) =>
          scope.where(
            Object.fromEntries(
              (primaryKey as string[]).map((column, i) => [
                column,
                (Array.isArray(id) ? id : [id])[i],
              ]),
            ),
          ),
        )
        .reduce((left: any, right: any) => left.or(right))
    : scope.where({ [primaryKey]: attributeIds });
  return existingRecordsScope
    .toArray()
    .then((existingRecords: Base[]) => assignRecords(existingRecords));
}

/** @internal */
function loadedCollectionTarget(record: Base, associationName: string): Base[] {
  const proxy = (record as any)._collectionProxies?.get?.(associationName) as
    | { target?: unknown[] }
    | undefined;
  return Array.isArray(proxy?.target) ? (proxy.target as Base[]) : [];
}

/** @internal */
function resolveCollectionTargetModel(
  record: Base,
  associationName: string,
): typeof Base | undefined {
  const ctor = record.constructor as typeof Base;
  const assocDef = (ctor as any)._reflectOnAssociation?.(associationName);
  if (!assocDef) return undefined;
  return modelRegistry.get(assocDef.className);
}

export const InstanceMethods = {
  _destroy,
  hasDestroyFlag,
  isAllowDestroy,
  isWillBeDestroyed,
  callRejectIf,
  isRejectNewRecord,
  assignToOrMarkForDestruction,
  findRecordById,
  raiseNestedAttributesRecordNotFoundBang,
  checkRecordLimitBang,
  assignNestedAttributesForOneToOneAssociation,
  assignNestedAttributesForCollectionAssociation,
};
