import type { Base } from "./base.js";
import type { CollectionAssociation } from "./associations/collection-association.js";
import { modelRegistry } from "./associations.js";
import { ActiveRecordError, RecordNotFound } from "./errors.js";
import {
  assertValidKeys,
  camelize,
  classAttribute,
  extractOptionsBang,
  included,
  isBlank,
  singularize,
} from "@blazetrails/activesupport";
import { except, rbFSend, rbObjMethod, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { defineAutosaveValidationCallbacks } from "./autosave-association.js";
import { ArgumentError, BooleanType } from "@blazetrails/activemodel";

export class TooManyRecords extends ActiveRecordError {}

TooManyRecords.prototype.name = "ActiveRecord::NestedAttributes::TooManyRecords";

export function _destroy(this: Base): boolean {
  return this.markedForDestruction();
}

export const REJECT_ALL_BLANK_PROC = (attributes: Record<string, unknown>): boolean =>
  Object.entries(attributes).every(([key, value]) => key === "_destroy" || isBlank(value));

export interface NestedAttributeOptions {
  allowDestroy?: boolean;
  rejectIf?: ((attributes: Record<string, unknown>) => boolean) | string;
  limit?: number | string | ((...args: unknown[]) => number);
  updateOnly?: boolean;
}

export function acceptsNestedAttributesFor(
  this: typeof Base,
  ...attrNames: (string | NestedAttributeOptions)[]
): void {
  const options: NestedAttributeOptions = { allowDestroy: false, updateOnly: false };
  Object.assign(options, extractOptionsBang(attrNames));
  assertValidKeys(
    options as Record<string, unknown>,
    "allowDestroy",
    "rejectIf",
    "limit",
    "updateOnly",
  );
  if (options.rejectIf === "all_blank") options.rejectIf = REJECT_ALL_BLANK_PROC;

  for (const associationName of attrNames as string[]) {
    const reflection = (this as any)._reflectOnAssociation?.(associationName);
    if (reflection) {
      reflection.autosave = true;
      defineAutosaveValidationCallbacks.call(this, reflection);

      const nestedAttributesOptions = { ...this.nestedAttributesOptions };
      nestedAttributesOptions[associationName] = options;
      this.nestedAttributesOptions = nestedAttributesOptions;

      const type = reflection.isCollection() ? "collection" : "one_to_one";
      this.generateAssociationWriter(associationName, type);
    } else {
      throw new ArgumentError(
        `No association found for name \`${associationName}'. Has it been defined yet?`,
      );
    }
  }
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
): boolean | undefined {
  if (isWillBeDestroyed.call(this, associationName, attributes)) return false;

  const callback = (this.constructor as typeof Base).nestedAttributesOptions[associationName]
    .rejectIf;
  if (typeof callback === "string") {
    return (
      rbObjMethod(this, callback).arity() === 0
        ? rbFSend(this, callback)
        : rbFSend(this, callback, attributes)
    ) as boolean;
  } else if (typeof callback === "function") {
    return callback(attributes);
  }
}

/** @internal */
export function isRejectNewRecord(
  this: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): boolean | undefined {
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
export function checkRecordLimitBang(
  this: Base,
  limit: number | string | (() => number) | null | undefined,
  attributesCollection: unknown[] | Record<string, unknown>,
): void {
  if (limit != null) {
    if (typeof limit === "string") {
      limit = rbFSend(this, limit) as number | null | undefined;
    } else if (typeof limit === "function") {
      limit = limit();
    }

    const size = Array.isArray(attributesCollection)
      ? attributesCollection.length
      : Object.keys(attributesCollection).length;
    if (limit != null && size > limit) {
      throw new TooManyRecords(
        `Maximum ${limit} records are allowed. Got ${size} records instead.`,
      );
    }
  }
}

/** @internal */
export function generateAssociationWriter(
  this: typeof Base,
  associationName: string,
  type: "collection" | "one_to_one",
): void {
  const attrName = `${associationName}Attributes`;
  const assign: (record: Base, name: string, value: any) => Promise<void> | void =
    type === "collection"
      ? assignNestedAttributesForCollectionAssociation
      : assignNestedAttributesForOneToOneAssociation;

  this.generatedAssociationMethods().moduleEval((m) => {
    for (const methodName of [`set${camelize(attrName, true)}`, `${attrName}=`]) {
      Object.defineProperty(m, methodName, {
        value(this: Base, value: any): Promise<void> | void {
          return assign(this, associationName, value);
        },
        writable: true,
        configurable: true,
      });
    }
  });
}

/** @internal */
interface OneToOneAssociation {
  target: Base | null;
  initializeAttributes(record: Base): Promise<void> | void;
  isLoaded(): boolean;
  readonly reader?: Base | null | Promise<Base | null>;
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
    throw new ArgumentError(
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
    if (existingRecord && existingRecord.isNewRecord()) {
      const pending = existingRecord.setAttributes(assignable);
      if (pending) {
        return pending.then(() => assoc.initializeAttributes(existingRecord));
      }
      return assoc.initializeAttributes(existingRecord);
    } else {
      const method = `build${camelize(associationName, true)}`;
      if (rbObjRespondTo(record, method)) {
        const built = rbFSend(record, method, assignable);
        if (built instanceof Promise) return built.then(() => {});
      } else {
        throw new ArgumentError(
          `Cannot build association \`${associationName}'. ` +
            `Are you trying to build a polymorphic one-to-one association?`,
        );
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
  const options = (record.constructor as typeof Base).nestedAttributesOptions[associationName];
  if (rbObjRespondTo(attributesCollection, "permitted")) {
    attributesCollection = (attributesCollection as unknown as { toH(): never }).toH();
  }

  if (typeof attributesCollection !== "object" || attributesCollection === null) {
    throw new ArgumentError(
      `Hash or Array expected for \`${associationName}\` attributes, got ${nestedTypeName(attributesCollection)}`,
    );
  }

  checkRecordLimitBang.call(record, options.limit, attributesCollection);

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

  const collectionTargetModel = resolveCollectionTargetModel(record, associationName);
  const association = record.association(associationName) as CollectionAssociation;

  const assignRecords = (existingRecords: Base[]): Promise<void> | void => {
    const nestedTarget: (Base | null)[] = [];
    let pending: Promise<void> | undefined;
    for (let a of attrs) {
      if (rbObjRespondTo(a, "permitted")) {
        a = (a as unknown as { toH(): Record<string, unknown> }).toH();
      }

      if (!hasNestedId(a)) {
        if (!isRejectNewRecord.call(record, associationName, a)) {
          nestedTarget.push(
            (record.association(associationName) as CollectionAssociation).reader.build(
              except(a, ...UNASSIGNABLE_KEYS),
            ),
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
  return scope
    .where(new Map([[primaryKey, attributeIds]]))
    .toArray()
    .then((existingRecords: Base[]) => assignRecords(existingRecords));
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

export const NestedAttributes = {
  [included](base: object): void {
    classAttribute.call(base, "nestedAttributesOptions", { instanceWriter: false, default: {} });
  },
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
