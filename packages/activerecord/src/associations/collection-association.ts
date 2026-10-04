import {
  aryDelete,
  compact,
  isEmpty,
  kernelCatch,
  rbEqual,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import {
  underscore,
  compactBlank,
  indexBy,
  isBlank,
  kernelArray,
  valuesAt,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Association } from "./association.js";
import type { AssociationProxy } from "./collection-proxy.js";
import { Associations } from "../namespaces.js";
import { NotImplementedError, RecordNotFound, RecordNotSaved, Rollback } from "../errors.js";
import { CollectionIdsAssignmentError, CollectionPersistedAssignmentError } from "./errors.js";

export abstract class CollectionAssociation extends Association {
  nestedAttributesTarget: (Base | null)[] | null = null;
  protected _proxy?: AssociationProxy;
  protected _associationIds: unknown[] | null = null;
  _lastRemoveAborted = false;
  /** @internal */
  callback = callback;
  /** @internal */
  callbacksFor = callbacksFor;

  override _targetStore: Base | Base[] | null = [];

  override get target(): Base[] {
    return this._targetStore as Base[];
  }

  override set target(record: Base | Base[] | null) {
    if (!this.reflection.klass?.hasManyInversing) {
      super.target = record;
      return;
    }

    if (record === null) {
    } else if (Array.isArray(record)) {
      super.target = record;
    } else {
      void this.replaceOnTarget(record, true, { replace: true, inversing: true });
    }
  }

  /** @internal */
  _replacedOrAddedTargets = new Set<Base>();

  /** @internal */
  _wasLoaded: boolean | null = null;

  writer(records: Base[]): Promise<Base[] | undefined> | Base[] {
    return this.replace(records);
  }

  /** @noRailsEquivalent CONVERGEABLE sync-collection-mass-assignment-refuses-rails-replace */
  syncWrite(records: Base[]): void {
    for (const val of records) (this as any).raiseOnTypeMismatchBang(val);
    if (
      (this.owner as { isPersisted?: () => boolean }).isPersisted?.() ||
      this.isFindTarget() ||
      this.difference(this.target, records).some((r) => !r.isNewRecord())
    ) {
      throw new CollectionPersistedAssignmentError(this.reflection.name);
    }
    this.replace(records) as Base[];
  }

  /** @noRailsEquivalent CONVERGEABLE sync-collection-mass-assignment-refuses-rails-replace */
  syncIdsWrite(_ids: unknown[]): never {
    throw new CollectionIdsAssignmentError(this.reflection.name);
  }

  /**
   * @missingRailsCall empty? — CONVERGEABLE collection-association-ids-reader-plucks-through-enumerable-pluck
   * @inventedArm if — CONVERGEABLE collection-association-ids-reader-plucks-through-enumerable-pluck
   * @inventedArm readKeys — CONVERGEABLE collection-association-ids-reader-plucks-through-enumerable-pluck
   */
  async idsReader(): Promise<unknown[]> {
    const readKeys = (target: Base[], ...keys: string[]): unknown[] =>
      target.map((record) =>
        keys.length > 1
          ? keys.map((key) => record.readAttribute(key))
          : record.readAttribute(keys[0]),
      );
    if (this.isLoaded()) {
      return readKeys(this.target, ...kernelArray(this.reflection.associationPrimaryKey()));
    } else if (this.target.length > 0) {
      return readKeys(
        await this.loadTarget(),
        ...kernelArray(this.reflection.associationPrimaryKey()),
      );
    } else {
      return (this._associationIds ??= await this.scope().pluck(
        ...kernelArray(this.reflection.associationPrimaryKey()),
      ));
    }
  }

  /** @missingRailsName size — PERMANENT */
  async idsWriter(ids: unknown[]): Promise<void> {
    const primaryKey = this.reflection.associationPrimaryKey();
    const klass = this.klass as any;
    const pkType = klass.typeForAttribute(primaryKey);
    ids = compactBlank(kernelArray(ids));
    ids = ids.map((id) => pkType.cast(id));

    let indexed: Record<string, Base>;
    if (klass.compositePrimaryKey) {
      indexed = indexBy<Base, string>(
        await klass.where(new Map([[primaryKey, ids]])).toArray(),
        (record) =>
          String(
            (primaryKey as string[]).map((primaryKey) =>
              (record as any)._readAttribute(primaryKey),
            ),
          ),
      );
    } else {
      indexed = indexBy<Base, string>(
        await klass.where({ [primaryKey as string]: ids }).toArray(),
        (record) => String((record as any)._readAttribute(primaryKey)),
      );
    }
    const records = compact(valuesAt(indexed, ...ids.map(String)));

    if (records.length !== ids.length) {
      const foundIds = records.map((record) => String((record as any)._readAttribute(primaryKey)));
      const notFoundIds = ids.filter((id) => !foundIds.includes(String(id)));
      klass
        .all()
        .raiseRecordNotFoundExceptionBang(ids, records.length, ids.length, primaryKey, notFoundIds);
    } else {
      await this.replace(records);
    }
  }

  override reset(): void {
    super.reset();
    this.#loadingTarget = null;
    this._targetStore = [];
    this._replacedOrAddedTargets = new Set<Base>();
    this._associationIds = null;
  }

  /** @missingRailsName size — PERMANENT */
  async find(...args: unknown[]): Promise<Base | Base[] | null> {
    if (this.options.inverseOf && this.isLoaded()) {
      const argsFlatten = (args as any[]).flat(Infinity);
      const model = this.scope().model;

      if (isBlank(argsFlatten)) {
        const errorMessage = `Couldn't find ${model.name} without an ID`;
        throw new RecordNotFound(errorMessage, model.name, String(model.primaryKey), args);
      }

      const result = this.findByScan(args);

      const resultSize = kernelArray(result).length;
      if (!result || resultSize !== argsFlatten.length) {
        return this.scope().raiseRecordNotFoundExceptionBang(
          argsFlatten,
          resultSize,
          argsFlatten.length,
        );
      } else {
        return result as Base | Base[];
      }
    } else {
      return this.scope().find(...args);
    }
  }

  build(attributes: Record<string, unknown>[], block?: (record: Base) => void): Base[];
  build(attributes?: Record<string, unknown>, block?: (record: Base) => void): Base;
  build(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    block?: (record: Base) => void,
  ): Base | Base[] {
    if (Array.isArray(attributes)) {
      return attributes.map((attr) => this.build(attr, block));
    } else {
      return this.addToTarget(this.buildRecord(attributes, block)!, { replace: true })!;
    }
  }

  /** @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns */
  concat(...records: Base[]): Promise<Base[] | undefined> | Base[] | undefined {
    records = records.flat();
    if (this.owner.isNewRecord()) {
      const loaded = this.skipStrictLoading(() => this.loadTarget());
      return isThenable(loaded)
        ? loaded.then(() => this.concatRecords(records))
        : this.concatRecords(records);
    }
    return this.transaction(() => this.concatRecords(records));
  }

  /** @internal */
  protected transaction<R>(block: () => Promise<R> | R): Promise<R | undefined> {
    return (this.reflection.klass as any).transaction(block);
  }

  /** @internal */
  protected abstract difference(a: Base[], b: Base[]): Base[];

  /** @internal */
  protected abstract intersection(a: Base[], b: Base[]): Base[];

  /** @internal */
  async insertRecord(
    record: Base,
    validate = true,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<boolean> {
    if (raise) {
      return !!(await (record as any).saveBang({ validate }, block));
    } else {
      return !!(await (record as any).save({ validate }, block));
    }
  }

  /**
   * @internal
   * @inventedArm loop — CONVERGEABLE arms-awaited-block-enumerable-reads-as-invented-loop
   */
  protected override async _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise = false,
    block?: (record: Base) => void | Promise<void>,
  ): Promise<Base | Base[] | null> {
    if (!this.owner.isPersisted()) {
      throw new RecordNotSaved("You cannot call create unless the parent is saved", this.owner);
    }

    if (Array.isArray(attributes)) {
      const records: Base[] = [];
      for (const attr of attributes) {
        records.push((await this._createRecord(attr, raise, block)) as Base);
      }
      return records;
    }

    await this.klass.ensureSchemaLoaded();
    let yielded: unknown;
    const record = this.buildRecord(
      attributes,
      block &&
        ((record: Base) => {
          yielded = block(record);
        }),
    )!;
    await yielded;
    await this.transaction(async () => {
      let result: boolean | undefined = undefined;
      await this.addToTarget(record, {}, async () => {
        result = await this.insertRecord(record, true, raise, () => {
          this._wasLoaded = this.isLoaded();
        });
      });
      if (!result) throw new Rollback();
    });
    return record;
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   * @inventedArm loop — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   * @inventedArm throw — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   */
  protected concatRecords(records: Base[], raise = false): Promise<Base[]> | Base[] {
    let result = true;

    const addRecord = (record: Base): Promise<boolean> | boolean => {
      (this as any).raiseOnTypeMismatchBang(record);
      let inserted = true;
      const added = this.addToTarget(record, {}, () => {
        if (this.owner.isNewRecord() || !result) return;
        return this.insertRecord(record, true, raise, () => {
          this._wasLoaded = this.isLoaded();
        }).then((r) => {
          inserted = r;
        });
      });
      return isThenable(added) ? added.then(() => inserted) : inserted;
    };

    for (let i = 0; i < records.length; i++) {
      const inserted = addRecord(records[i]);
      if (isThenable(inserted)) {
        const rest = records.slice(i + 1);
        return inserted.then(async (first) => {
          result = result && first;
          for (const record of rest) {
            const inserted = await addRecord(record);
            result = result && inserted;
          }
          if (!result) throw new Rollback();
          return records;
        });
      }
      result = result && inserted;
    }

    if (!result) throw new Rollback();

    return records;
  }

  async deleteAll(dependent?: string): Promise<number> {
    if (dependent && !["nullify", "deleteAll"].includes(dependent)) {
      throw new ArgumentError("Valid values are :nullify or :delete_all");
    }

    dependent = dependent
      ? dependent
      : this.options.dependent === "destroy"
        ? "deleteAll"
        : (this.options.dependent as string | undefined);

    const count = await this.deleteOrNullifyAllRecords(dependent);

    this.reset();
    this.loadedBang();
    return count;
  }

  protected async deleteOrNullifyAllRecords(method?: string): Promise<number> {
    if (method === "deleteAll") {
      return this.deleteAllRecords();
    }
    return this.nullifyAllRecords();
  }

  async destroyAll(): Promise<Base[] | undefined> {
    const destroyed = await this.destroy(await this.loadTarget());
    this.reset();
    this.loadedBang();
    return destroyed;
  }

  delete(
    ...records: Array<Base | number | string | bigint>
  ): Promise<Base[] | undefined> | Base[] | undefined {
    return this.deleteOrDestroy(records, this.reflection.options.dependent);
  }

  async destroy(
    ...records: Array<Base | number | string | bigint | Base[]>
  ): Promise<Base[] | undefined> {
    return this.deleteOrDestroy(records as Array<Base | number | string | bigint>, "destroy");
  }

  size(): Promise<number> | number {
    if (!this.isFindTarget() || this.isLoaded()) {
      return this.target.length;
    } else if (this._associationIds) {
      return this._associationIds.length;
    } else if (!isEmpty(this.associationScope().groupValues)) {
      return Promise.resolve(this.loadTarget()).then((target) => target.length);
    } else if (!this.associationScope().distinctValue && !isEmpty(this.target)) {
      const unsavedRecords = this.target.filter((record) => record.isNewRecord());
      return (this as unknown as { countRecords(): Promise<number> })
        .countRecords()
        .then((count) => unsavedRecords.length + count);
    } else {
      return (this as unknown as { countRecords(): Promise<number> }).countRecords();
    }
  }

  async isEmpty(): Promise<boolean> {
    if (this.isLoaded() || this._associationIds || this.reflection.hasActiveCachedCounter?.()) {
      return (await this.size()) === 0;
    }
    return this.target.length === 0 && !(await this.scope().isExists());
  }

  /** @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns */
  replace(otherArray: Base[]): Promise<Base[] | undefined> | Base[] {
    for (const val of otherArray) (this as any).raiseOnTypeMismatchBang(val);
    const replaceAgainst = (originalTarget: Base[]): Promise<Base[] | undefined> | Base[] => {
      if (this.owner.isNewRecord()) {
        return replaceRecords(this, otherArray, originalTarget);
      } else {
        replaceCommonRecordsInMemory(this, otherArray, originalTarget);
        if (!arraysEqual(otherArray, originalTarget)) {
          return this.transaction(() => replaceRecords(this, otherArray, originalTarget));
        } else {
          return otherArray;
        }
      }
    };
    const loaded = this.skipStrictLoading(() => this.loadTarget());
    return isThenable(loaded)
      ? loaded.then((target) => replaceAgainst([...target]))
      : replaceAgainst([...loaded]);
  }

  async isInclude(record: Base): Promise<boolean> {
    const klass = this.klass;
    if (!(record instanceof klass)) return false;

    if (record.isNewRecord()) {
      return await this.isIncludeInMemory(record);
    } else if (this.isLoaded()) {
      return this.target.some((r) => r.equals(record));
    } else {
      const recordId = klass.compositePrimaryKey
        ? Object.fromEntries(
            (klass.primaryKey as string[]).map((key, i) => [key, (record.id as unknown[])[i]]),
          )
        : record.id;
      return await this.scope().isExists(recordId);
    }
  }

  /**
   * @inventedArm loop — CONVERGEABLE arms-awaited-block-enumerable-reads-as-invented-loop
   * @inventedArm if — CONVERGEABLE arms-awaited-block-enumerable-reads-as-invented-loop
   */
  private async isIncludeInMemory(record: Base): Promise<boolean> {
    const reflection = this.reflection as unknown as {
      isThroughReflection?: () => boolean;
      throughReflection?: { name: string } | null;
      sourceReflection?: { name: string } | null;
    };
    if (reflection.isThroughReflection?.()) {
      const assoc = (
        this.owner as unknown as { association: (n: string) => Association }
      ).association(reflection.throughReflection!.name);
      const sourceName = reflection.sourceReflection!.name;
      const reader = (await (assoc as unknown as { reader: unknown }).reader) as Base[];
      for (const source of reader) {
        const targetReflection = await (source as unknown as Record<string, unknown>)[sourceName];
        if (
          Array.isArray(targetReflection)
            ? targetReflection.some((r: Base) => r.equals(record))
            : (targetReflection as Base | null)?.equals(record)
        ) {
          return true;
        }
      }
      return this.target.some((r) => r.equals(record));
    }
    return this.target.some((r) => r.equals(record));
  }

  /** @inventedArm if — CONVERGEABLE collection-association-load-target-in-flight-memo-and-reader-catch */
  override loadTarget(): Promise<Base[]> | Base[] {
    const loaded = (): Base[] => {
      this.loadedBang();
      return this.target;
    };
    if (this.#loadingTarget) return this.#loadingTarget;
    if (this.isFindTarget()) {
      const loading = Promise.resolve(this.findTarget())
        .then((findTarget) => {
          if (!this.isLoaded()) {
            this._targetStore = this.mergeTargetLists(findTarget as Base[], this.target);
          }
          return loaded();
        })
        .finally(() => {
          if (this.#loadingTarget === loading) this.#loadingTarget = null;
        });
      return (this.#loadingTarget = loading);
    }

    return loaded();
  }

  #loadingTarget: Promise<Base[]> | null = null;

  addToTarget(record: Base, options?: { skipCallbacks?: boolean; replace?: boolean }): Base | null;
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean },
    save: () => Promise<void> | void,
  ): Promise<Base | null> | Base | null;
  addToTarget(
    record: Base,
    options: { skipCallbacks?: boolean; replace?: boolean } = {},
    save?: () => Promise<void> | void,
  ): Base | null | Promise<Base | null> {
    const { skipCallbacks = false, replace = false } = options;
    return this.replaceOnTarget(
      record,
      skipCallbacks,
      { replace: replace || this.associationScope().distinctValue },
      save,
    );
  }

  override scope(): any {
    const scope = super.scope();
    if (this.isNullScope()) scope.noneBang();
    return scope;
  }

  isNullScope(): boolean {
    return this.owner.isNewRecord() && !this.foreignKeyPresent();
  }

  isFindFromTarget(): boolean {
    return (
      this.isLoaded() ||
      (this.owner.isStrictLoading() && this.owner.isStrictLoadingAll()) ||
      !!this.reflection.options.strictLoading ||
      this.owner.isNewRecord() ||
      this.target.some((r) => r.isNewRecord() || r.isChanged)
    );
  }

  override isCollection(): boolean {
    return true;
  }

  /**
   * @inventedArm if — CONVERGEABLE collection-association-load-target-in-flight-memo-and-reader-catch
   * @inventedArm try — CONVERGEABLE collection-association-load-target-in-flight-memo-and-reader-catch
   */
  get reader(): AssociationProxy {
    this.ensureKlassExists();

    if (this.isStaleTarget()) {
      const reloaded = this.reload();
      if (reloaded instanceof Promise) reloaded.catch(() => {});
    }

    const CollectionProxy = Associations.CollectionProxy as unknown as {
      create(klass: typeof Base, association: CollectionAssociation): AssociationProxy;
    };
    this._proxy ??= CollectionProxy.create(this.klass, this);
    this._proxy.resetScope();
    return this._proxy;
  }

  private ensureKlassExists(): void {
    try {
      void this.klass;
    } catch (error) {
      throw new Error(`Association ${this.reflection.name}: target class does not exist`, {
        cause: error,
      });
    }
  }

  private foreignKeyColumns(): string[] {
    const foreignKey = this.reflection.foreignKey();
    return Array.isArray(foreignKey) ? foreignKey : [foreignKey];
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  private polymorphicTypeColumn(): string | null {
    const opts = this.reflection.options as { as?: string; foreignType?: string };
    if (!opts.as) return null;
    return opts.foreignType ?? `${underscore(opts.as)}_type`;
  }

  /** @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns */
  protected deleteOrDestroy(
    records: Array<Base | number | string | bigint>,
    method?: string,
  ): Promise<Base[] | undefined> | Base[] | undefined {
    if (records.length === 0) return undefined;
    const coerced = this.coerceToRecords(records);
    const remove = (coerced: Base[]): Promise<Base[] | undefined> | Base[] | undefined => {
      const resolved = (coerced as unknown[]).flat(Infinity) as Base[];
      for (const record of resolved) (this as any).raiseOnTypeMismatchBang(record);
      const existingRecords = resolved.filter((r) => !r.isNewRecord());
      if (existingRecords.length === 0) {
        const removed = this.removeRecords(existingRecords, resolved, method ?? "");
        return isThenable(removed)
          ? removed.then((r) => (r ? resolved : undefined))
          : removed
            ? resolved
            : undefined;
      }
      let removed = false;
      return this.transaction(async () => {
        removed = await this.removeRecords(existingRecords, resolved, method ?? "");
      }).then(() => (removed ? resolved : undefined));
    };
    return isThenable(coerced) ? coerced.then(remove) : remove(coerced);
  }

  /** @internal */
  private coerceToRecords(
    records: Array<Base | number | string | bigint>,
  ): Promise<Base[]> | Base[] {
    const isId = (r: Base | number | string | bigint): r is number | string | bigint =>
      typeof r === "number" || typeof r === "string" || typeof r === "bigint";
    if (!records.some(isId)) return records as Base[];
    const ids = records.map((r) => (isId(r) ? r : (r as any).id));
    return this.find(...ids).then((found) => (Array.isArray(found) ? found : found ? [found] : []));
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   */
  protected removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> | boolean {
    if (
      kernelCatch(":abort", () => {
        for (const record of records) this.callback("beforeRemove", record);
        return records;
      }) == null
    ) {
      this._lastRemoveAborted = true;
      return false;
    }
    this._lastRemoveAborted = false;
    const pruned = (): boolean => {
      this._targetStore = this.target.filter((r) => !records.some((record) => rbEqual(record, r)));
      this._associationIds = null;
      for (const record of records) this.callback("afterRemove", record);
      return true;
    };
    if (existingRecords.length > 0) {
      const deleted = this.deleteRecords(existingRecords, method);
      if (isThenable(deleted)) return deleted.then(pruned);
    }
    return pruned();
  }

  /** @internal */
  protected deleteRecords(_records: Base[], _method: string): Promise<unknown> | unknown {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/associations/collection_association.rb:415
    throw new NotImplementedError();
  }

  /** @internal */
  protected computeNullifiedOwnerAttributes(): Record<string, null> {
    const nullAttrs: Record<string, null> = {};
    for (const fk of this.foreignKeyColumns()) {
      nullAttrs[fk] = null;
    }
    const typeCol = this.polymorphicTypeColumn();
    if (typeCol) {
      nullAttrs[typeCol] = null;
    }
    return nullAttrs;
  }

  protected async nullifyAllRecords(): Promise<number> {
    const nullAttrs = this.computeNullifiedOwnerAttributes();

    const rel = this.scope();
    if (rel && typeof rel.updateAll === "function") {
      return rel.updateAll(nullAttrs);
    }

    await this.loadTarget();
    for (const record of this.target) {
      for (const [attr, val] of Object.entries(nullAttrs)) {
        if (typeof (record as any)._writeAttribute === "function") {
          (record as any)._writeAttribute(attr, val);
        } else {
          (record as any)[attr] = val;
        }
      }
      if (typeof (record as any).save === "function") {
        await (record as any).save();
      }
    }
    return this.target.length;
  }

  private async deleteAllRecords(): Promise<number> {
    const rel = this.scope();
    if (rel && typeof rel.deleteAll === "function") {
      return rel.deleteAll();
    }
    return 0;
  }

  /** @internal */
  /** @internal */
  mergeTargetLists(persisted: Base[], memory: Base[]): Base[] {
    if (memory.length === 0) return persisted;

    const merged = persisted.map((record) => {
      const memRecord = aryDelete(memory, record);
      if (memRecord != null) {
        const memAttributeNames = new Set(memRecord.attributeNames());
        const changedAttributeNamesToSave = new Set(memRecord.changedAttributeNamesToSave);
        const attrReadonly = (memRecord.constructor as unknown as { _attrReadonly: string[] })
          ._attrReadonly;
        for (const name of record
          .attributeNames()
          .filter((name) => memAttributeNames.has(name))
          .filter((name) => !changedAttributeNamesToSave.has(name))
          .filter((name) => !attrReadonly.includes(name))) {
          memRecord._writeAttribute(name, record.get(name));
        }

        return memRecord;
      } else {
        return record;
      }
    });

    return [...merged, ...memory.filter((record) => !record.isPersisted())];
  }

  private findByScan(args: unknown[]): Base | Array<Base | undefined> | undefined {
    const expectsArray = Array.isArray(args[0]);
    const ids = [
      ...new Set(
        args
          .flat(Infinity)
          .filter((id) => id != null)
          .map((id) => String(id)),
      ),
    ];

    if (ids.length === 1) {
      const id = ids[0];
      const record = this.target.find((r) => id === String((r as any).id));
      return expectsArray ? [record] : record;
    }

    return this.target.filter((r) => ids.includes(String((r as any).id)));
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE converge-collection-writer-isthenable-dual-returns
   */
  replaceOnTarget(
    record: Base,
    skipCallbacks: boolean,
    { replace, inversing = false }: { replace: boolean; inversing?: boolean },
    block?: () => Promise<void> | void,
  ): Base | null | Promise<Base | null> {
    const targetIndex = (): number =>
      this.target.findIndex((r) => r === record || r.equals(record));

    let index =
      replace && (!record.isNewRecord() || this._replacedOrAddedTargets.has(record))
        ? targetIndex()
        : -1;

    const afterYield = (): Base => {
      const target = this.target;
      if (index === -1 && this._replacedOrAddedTargets.has(record)) index = targetIndex();
      if (inversing || index !== -1 || record.isNewRecord()) {
        this._replacedOrAddedTargets.add(record);
      }
      if (index !== -1) {
        target[index] = record;
      } else if (this._wasLoaded || !this.isLoaded()) {
        (this as any)._associationIds = null;
        target.push(record);
      }
      if (!skipCallbacks) this.callback("afterAdd", record);
      return record;
    };

    let yielded = false;
    try {
      if (
        !skipCallbacks &&
        kernelCatch(":abort", () => {
          this.callback("beforeAdd", record);
          return true;
        }) == null
      ) {
        return null;
      }
      this.setInverseInstance(record);
      this._wasLoaded = true;
      if (block) {
        const yield_ = block();
        if (isThenable(yield_)) {
          yielded = true;
          return yield_.then(afterYield).finally(() => {
            this._wasLoaded = null;
          });
        }
        return afterYield();
      }
      return afterYield();
    } finally {
      if (!yielded) this._wasLoaded = null;
    }
  }
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE converge-collection-writer-isthenable-dual-returns
 */
export function isThenable<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

/** @internal */
function diffHooks(assoc: CollectionAssociation): {
  difference(a: Base[], b: Base[]): Base[];
  intersection(a: Base[], b: Base[]): Base[];
} {
  return assoc as unknown as {
    difference(a: Base[], b: Base[]): Base[];
    intersection(a: Base[], b: Base[]): Base[];
  };
}

/** @internal */
function replaceRecords(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): Promise<Base[]> | Base[] {
  const diff = diffHooks(assoc);
  const deleted = assoc.delete(...diff.difference(assoc.target, newTarget));
  const restoreAndRaise = (e?: unknown): never => {
    if (e !== undefined && !(e instanceof Rollback)) throw e;
    assoc._writeTargetStore(originalTarget);
    throw new RecordNotSaved(
      `Failed to replace ${assoc.reflection.name} because one or more of the new records ` +
        `could not be saved.`,
      assoc.owner,
    );
  };
  const check = (records: Base[] | undefined): Base[] =>
    records ? assoc.target : restoreAndRaise();
  const concatenate = (): Promise<Base[]> | Base[] => {
    try {
      const concatenated = assoc.concat(...diff.difference(newTarget, assoc.target));
      return isThenable(concatenated)
        ? concatenated.then(check, restoreAndRaise)
        : check(concatenated);
    } catch (e) {
      return restoreAndRaise(e);
    }
  };
  return isThenable(deleted) ? deleted.then(concatenate) : concatenate();
}

/** @internal */
function replaceCommonRecordsInMemory(
  assoc: CollectionAssociation,
  newTarget: Base[],
  originalTarget: Base[],
): void {
  const common = diffHooks(assoc).intersection(newTarget, originalTarget);
  for (const record of common) {
    const skipCallbacks = true;
    assoc.replaceOnTarget(record, skipCallbacks, { replace: true }) as Base | null;
  }
}

/** @internal */
export interface CallbackHost {
  owner: Base;
  reflection: { name: string; options: object };
  /** @internal */
  callback(method: string, record: Base): void;
  /** @internal */
  callbacksFor(callbackName: string): unknown[];
}

/** @internal */
export function callback(this: CallbackHost, method: string, record: Base): void {
  for (const cb of this.callbacksFor(method)) {
    if (typeof cb !== "function") continue;
    (cb as any)(method, this.owner, record);
  }
}

/** @internal */
export function callbacksFor(this: CallbackHost, callbackName: string): unknown[] {
  const fullCallbackName = `${callbackName}For${this.reflection.name.charAt(0).toUpperCase()}${this.reflection.name.slice(1)}`;
  if (rbObjRespondTo(this.owner.constructor, fullCallbackName)) {
    return (this.owner.constructor as any)[fullCallbackName];
  } else {
    return [];
  }
}

function arraysEqual(a: Base[], b: Base[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.equals(b[i]));
}
