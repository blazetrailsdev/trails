import type { Base } from "./base.js";
import type { CollectionAssociation } from "./associations/collection-association.js";
import { ActiveRecordError, RecordNotFound } from "./errors.js";
import {
  assertValidKeys,
  camelize,
  classAttribute,
  extractOptionsBang,
  included,
  isBlank,
  isPresent,
  kernelArray,
} from "@blazetrails/activesupport";
import {
  except,
  rbEqual,
  rbFSend,
  rbObjMethod,
  rbObjRespondTo,
  size,
} from "@blazetrails/ruby-compat";
import { defineAutosaveValidationCallbacks } from "./autosave-association.js";
import { isCompositePrimaryKey } from "./attribute-methods/primary-key.js";
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

/**
 * @internal
 * @inventedArm if — CONVERGEABLE nested-attributes-maybe-promise-assignment-arms
 */
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
  if (isCompositePrimaryKey.call(klass)) {
    id = kernelArray(id).map(String);
    return records.find((record) => rbEqual(kernelArray(record.id).map(String), id));
  } else {
    return records.find((record) => String(record.id) === String(id));
  }
}

/** @internal */
export function raiseNestedAttributesRecordNotFoundBang(
  this: Base,
  associationName: string,
  recordId: unknown,
): never {
  const model = (this.constructor as typeof Base)._reflectOnAssociation(associationName)!.klass
    .name;
  throw new RecordNotFound(
    `Couldn't find ${model} with ID=${recordId} for ${this.constructor.name} with ID=${this.id}`,
    model,
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

    if (limit != null && size(attributesCollection) > limit) {
      throw new TooManyRecords(
        `Maximum ${limit} records are allowed. Got ${size(attributesCollection)} records instead.`,
      );
    }
  }
}

/**
 * @internal
 * @inventedArm loop — PERMANENT
 */
export function generateAssociationWriter(
  this: typeof Base,
  associationName: string,
  type: "collection" | "one_to_one",
): void {
  const attrName = `${associationName}Attributes`;

  this.generatedAssociationMethods().moduleEval((m) => {
    for (const methodName of [`set${camelize(attrName, true)}`, `${attrName}=`]) {
      Object.defineProperty(m, methodName, {
        value(this: Base, attributes: unknown): Promise<void> | void {
          return rbFSend(
            this,
            `assignNestedAttributesFor${camelize(type)}Association`,
            associationName,
            attributes,
          ) as Promise<void> | void;
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

/**
 * @internal
 * @inventedArm if — CONVERGEABLE nested-attributes-maybe-promise-assignment-arms
 */
export function assignNestedAttributesForOneToOneAssociation(
  this: Base,
  associationName: string,
  attributes: Record<string, unknown>,
): Promise<void> | void {
  if (rbObjRespondTo(attributes, "isPermitted")) {
    attributes = (attributes as unknown as { toH(): Record<string, unknown> }).toH();
  }

  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
    throw new ArgumentError(
      `Hash expected for \`${associationName}\` attributes, got ${nestedTypeName(attributes)}`,
    );
  }

  const options = (this.constructor as typeof Base).nestedAttributesOptions[associationName];

  const assoc = this.association(associationName) as unknown as OneToOneAssociation;
  if (
    (options.updateOnly || !isBlank(attributes["id"])) &&
    assoc.isLoaded() === false &&
    "reader" in assoc
  ) {
    const read = assoc.reader;
    if (read instanceof Promise) {
      return read.then(() =>
        assignNestedAttributesForOneToOneAssociation.call(this, associationName, attributes),
      );
    }
  }
  const existingRecord = assoc.target ?? null;

  if (
    (options.updateOnly || !isBlank(attributes["id"])) &&
    existingRecord &&
    (options.updateOnly || String(existingRecord.id) === String(attributes["id"]))
  ) {
    if (!callRejectIf.call(this, associationName, attributes)) {
      return assignToOrMarkForDestruction(existingRecord, attributes, options.allowDestroy!);
    }
  } else if (isPresent(attributes["id"])) {
    raiseNestedAttributesRecordNotFoundBang.call(this, associationName, attributes["id"]);
  } else if (!isRejectNewRecord.call(this, associationName, attributes)) {
    const assignableAttributes = except(attributes, ...UNASSIGNABLE_KEYS);

    if (existingRecord && existingRecord.isNewRecord()) {
      const pending = existingRecord.setAttributes(assignableAttributes);
      if (pending) {
        return pending.then(() => assoc.initializeAttributes(existingRecord));
      }
      return assoc.initializeAttributes(existingRecord);
    } else {
      const method = `build${camelize(associationName, true)}`;
      if (rbObjRespondTo(this, method)) {
        const built = rbFSend(this, method, assignableAttributes);
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

/**
 * @internal
 * @inventedArm if — CONVERGEABLE reopen-rfc-0087-constructor-arm-for-association-io-at-assignment
 */
export function assignNestedAttributesForCollectionAssociation(
  this: Base,
  associationName: string,
  attributesCollection: Record<string, unknown>[] | Record<string, Record<string, unknown>>,
): Promise<void> | void {
  const options = (this.constructor as typeof Base).nestedAttributesOptions[associationName];
  if (rbObjRespondTo(attributesCollection, "isPermitted")) {
    attributesCollection = (attributesCollection as unknown as { toH(): never }).toH();
  }

  if (typeof attributesCollection !== "object" || attributesCollection === null) {
    throw new ArgumentError(
      `Hash or Array expected for \`${associationName}\` attributes, got ${nestedTypeName(attributesCollection)}`,
    );
  }

  checkRecordLimitBang.call(this, options.limit, attributesCollection);

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

  const association = this.association(associationName) as CollectionAssociation;

  const assignRecords = (existingRecords: Base[]): Promise<void> | void => {
    const nestedTarget: (Base | null)[] = [];
    let pending: Promise<void> | undefined;
    for (let a of attrs) {
      if (rbObjRespondTo(a, "isPermitted")) {
        a = (a as unknown as { toH(): Record<string, unknown> }).toH();
      }

      if (isBlank(a["id"])) {
        if (!isRejectNewRecord.call(this, associationName, a)) {
          nestedTarget.push(association.reader.build(except(a, ...UNASSIGNABLE_KEYS)));
        } else {
          nestedTarget.push(null);
        }
      } else {
        let existingRecord = findRecordById(association.klass, existingRecords, (a as any).id);
        if (existingRecord) {
          if (!callRejectIf.call(this, associationName, a)) {
            const targetRecord = findRecordById(
              association.klass,
              association.target,
              (a as any).id,
            );
            if (targetRecord) {
              existingRecord = targetRecord;
            } else {
              (association as any).addToTarget(existingRecord, { skipCallbacks: true });
            }

            const allowDestroy = isAllowDestroy.call(this, associationName);
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
          raiseNestedAttributesRecordNotFoundBang.call(this, associationName, a["id"]);
        }
      }
    }
    association.nestedAttributesTarget = nestedTarget;
    return pending;
  };

  if (association.isLoaded()) return assignRecords(association.target);

  const attributeIds = attrs.map((a) => a["id"]).filter((id) => id != null && id !== false);
  if (attributeIds.length === 0) return assignRecords([]);
  if (attrs.every((a) => isBlank(a["id"]))) return assignRecords([]);

  const primaryKey = association.klass.primaryKey;
  const scope = association.scope();
  return scope
    .where(new Map([[primaryKey, attributeIds]]))
    .toArray()
    .then((existingRecords: Base[]) => assignRecords(existingRecords));
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
