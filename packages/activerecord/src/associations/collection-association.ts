import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import {
  underscore,
  isAbortSignal,
  compactBlank,
  indexBy,
  valuesAt,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Association } from "./association.js";
import type { AssociationProxy } from "./collection-proxy.js";
import { _CollectionProxyCtor } from "./collection-proxy-slot.js";
import { foreignKeyPresentFor, ownerForeignKeyColumns } from "./foreign-association.js";
import type { AssociationReflection } from "../reflection.js";
import { RecordNotFound, RecordNotSaved, Rollback } from "../errors.js";
import { CollectionIdsAssignmentError, CollectionPersistedAssignmentError } from "./errors.js";

export class CollectionAssociation extends Association {
  nestedAttributesTarget: (Base | null)[] | null = null;
  protected _proxy?: AssociationProxy;
  protected _associationIds: unknown[] | null = null;
  _lastRemoveAborted = false;
  /** @internal */
  callback = callback;
  /** @internal */
  callbacksFor = callbacksFor;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
    this._targetStore = [];
  }

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

  syncWrite(records: Base[]): void {
    for (const val of records) (this as any).raiseOnTypeMismatchBang(val);
    if (
      (this.owner as { isPersisted?: () => boolean }).isPersisted?.() ||
      this.findTargetNeeded() ||
      this.difference(this.target, records).some((r) => !r.isNewRecord())
    ) {
      throw new CollectionPersistedAssignmentError(this.reflection.name);
    }
    this.replace(records) as Base[];
  }

  syncIdsWrite(_ids: unknown[]): never {
    throw new CollectionIdsAssignmentError(this.reflection.name);
  }

  /** @missingRailsCall empty? — PERMANENT */
  async idsReader(): Promise<unknown[]> {
    const pk = this.associationPrimaryKey();
    const keys = Array.isArray(pk) ? pk : [pk];
    const readKey = (r: Base): unknown => {
      const vals = keys.map((key) =>
        typeof (r as any)._readAttribute === "function"
          ? (r as any)._readAttribute(key)
          : (r as any)[key],
      );
      return vals.length === 1 ? vals[0] : vals;
    };
    if (this.isLoaded()) {
      return this.target.map(readKey);
    }
    if (this.target.length > 0) {
      await this.loadTarget();
      return this.target.map(readKey);
    }
    if (this._associationIds) return this._associationIds;
    const rel = this.scope();
    if (rel && typeof rel.pluck === "function") {
      this._associationIds = await rel.pluck(...keys);
      return this._associationIds!;
    }
    return [];
  }

  protected associationPrimaryKey(): string | string[] {
    return this.reflection.associationPrimaryKey?.() ?? (this.klass as any).primaryKey ?? "id";
  }

  async idsWriter(ids: unknown[]): Promise<void> {
    const klass = this.klass as any;
    const primaryKey = this.associationPrimaryKey();
    const pkType = klass.typeForAttribute(primaryKey);
    ids = compactBlank(ids == null ? [] : Array.isArray(ids) ? ids : [ids]);
    ids = ids.map((id) => pkType.cast(id));

    const indexKey = (key: unknown): string =>
      Array.isArray(key) ? key.map(String).join(",") : String(key);
    let indexed: Record<string, Base>;
    if (klass.compositePrimaryKey) {
      const rows: Base[] = await klass.where(primaryKey, ids).toArray();
      indexed = indexBy<Base, string>(rows, (record) =>
        indexKey(
          (primaryKey as string[]).map((primaryKey) => (record as any)._readAttribute(primaryKey)),
        ),
      );
    } else {
      const rows: Base[] = await klass.where({ [primaryKey as string]: ids }).toArray();
      indexed = indexBy<Base, string>(rows, (record) =>
        indexKey((record as any)._readAttribute(primaryKey as string)),
      );
    }
    const records: Base[] = valuesAt(indexed, ...ids.map(indexKey)).filter(
      (record): record is Base => record != null,
    );

    if (records.length !== ids.length) {
      const foundIds = records.map((record) =>
        Array.isArray(primaryKey)
          ? primaryKey.map((primaryKey) => (record as any)._readAttribute(primaryKey))
          : (record as any)._readAttribute(primaryKey),
      );
      const foundKeys = new Set(foundIds.map(indexKey));
      const notFoundIds = ids.filter((id) => !foundKeys.has(indexKey(id)));
      klass
        .all()
        .raiseRecordNotFoundExceptionBang(ids, records.length, ids.length, primaryKey, notFoundIds);
    } else {
      await this.replace(records);
    }
  }

  override reset(): void {
    super.reset();
    this._targetStore = [];
    this._replacedOrAddedTargets = new Set<Base>();
    this._associationIds = null;
  }

  async find(...args: unknown[]): Promise<Base | Base[] | null> {
    const scope = this.scope();

    if (this.reflection.options.inverseOf && this.isLoaded()) {
      const argsFlatten = (args as any[]).flat(Infinity);
      const model = scope.model;

      if (argsFlatten.length === 0) {
        throw new RecordNotFound(
          `Couldn't find ${model.name} without an ID`,
          model.name,
          String(model.primaryKey),
          args,
        );
      }

      const result = this.findByScan(args);

      const resultSize = Array.isArray(result) ? result.length : result == null ? 0 : 1;
      if (!result || resultSize !== argsFlatten.length) {
        scope.raiseRecordNotFoundExceptionBang(argsFlatten, resultSize, argsFlatten.length);
      }
      return result as Base | Base[];
    }

    if (scope && typeof scope.find === "function") {
      return await scope.find(...args);
    }
    return null;
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
    const klass = (this.reflection as any).klass ?? this.klass;
    if (klass && typeof klass.transaction === "function") {
      return klass.transaction(() => Promise.resolve(block()));
    }
    return Promise.resolve(block());
  }

  /** @internal */
  protected difference(_a: Base[], _b: Base[]): Base[] {
    throw new Error("difference is implemented by CollectionAssociation subclasses");
  }

  /** @internal */
  protected intersection(_a: Base[], _b: Base[]): Base[] {
    throw new Error("intersection is implemented by CollectionAssociation subclasses");
  }

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

  /** @internal */
  protected override async _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise = false,
    block?: (record: Base) => void,
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

    const record = this.buildRecord(attributes, block);
    if (!record) return null;
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

  /** @internal */
  protected concatRecords(records: Base[], raise = false): Promise<Base[]> | Base[] {
    const looped = concatRecordsLoop(records, (record, resultStillTrue) => {
      (this as any).raiseOnTypeMismatchBang(record);
      let inserted = true;
      const added = this.addToTarget(record, {}, () => {
        if (this.owner.isNewRecord() || !resultStillTrue) return;
        return this.insertRecord(record, true, raise, () => {
          this._wasLoaded = this.isLoaded();
        }).then((result) => {
          inserted = result;
        });
      });
      return isThenable(added) ? added.then(() => inserted) : inserted;
    });
    return isThenable(looped) ? looped.then(() => records) : records;
  }

  async deleteAll(dependent?: string): Promise<number> {
    if (
      dependent &&
      dependent !== "nullify" &&
      dependent !== "delete_all" &&
      dependent !== "deleteAll"
    ) {
      throw new ArgumentError("Valid values are :nullify or :delete_all");
    }

    const optionDep = this.options.dependent;
    dependent =
      dependent === "delete_all"
        ? "deleteAll"
        : dependent
          ? dependent
          : optionDep === "destroy" || optionDep === "delete"
            ? "deleteAll"
            : optionDep;

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

  /** @missingRailsCall empty? — PERMANENT */
  size(): Promise<number> | number {
    if (!this.findTargetNeeded() || this.isLoaded()) {
      return this.target.length;
    } else if (this._associationIds) {
      return this._associationIds.length;
    } else if (
      ((this.associationScope() as { groupValues?: unknown[] } | undefined)?.groupValues ?? [])
        .length > 0
    ) {
      return Promise.resolve(this.loadTarget()).then((target) => target.length);
    } else if (
      !(this.associationScope() as { distinctValue?: boolean } | undefined)?.distinctValue &&
      this.target.length > 0
    ) {
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
    return this.target.length === 0 && !(await this.scope().exists());
  }

  replace(otherArray: Base[]): Promise<Base[] | undefined> | Base[] {
    this.raiseIfLoadInFlight();
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
      return this.target.includes(record);
    } else {
      const recordId = klass.compositePrimaryKey
        ? Object.fromEntries(
            (klass.primaryKey as string[]).map((key, i) => [key, (record.id as unknown[])[i]]),
          )
        : record.id;
      return await this.scope().exists(recordId);
    }
  }

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
      const reader = (await assoc.reader) as Base[];
      const targetReflections = await Promise.all(
        reader.map((source) => (source as unknown as Record<string, unknown>)[sourceName]),
      );
      return (
        targetReflections.some((targetReflection) =>
          Array.isArray(targetReflection)
            ? targetReflection.includes(record)
            : targetReflection === record,
        ) || this.target.includes(record)
      );
    }
    return this.target.includes(record);
  }

  override loadTarget(): Promise<Base[]> | Base[] {
    const loaded = (): Base[] => {
      this.loadedBang();
      return this.target;
    };
    if (this.findTargetNeeded()) {
      return Promise.resolve(this.findTarget()).then((findTarget) => {
        this._targetStore = this.mergeTargetLists(findTarget as Base[], this.target);
        return loaded();
      });
    }

    return loaded();
  }

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
    const distinctValue = !!(this.associationScope() as { distinctValue?: boolean } | undefined)
      ?.distinctValue;
    const shouldReplace = replace || distinctValue;
    if (save) {
      return this.replaceOnTarget(record, skipCallbacks, { replace: shouldReplace }, save);
    }
    return this.replaceOnTarget(record, skipCallbacks, { replace: shouldReplace }) as Base | null;
  }

  override scope(): any {
    const s = super.scope();
    if (this.isNullScope() && s && typeof s.none === "function") {
      const nulled = s.none();
      nulled._seededNoneNewOwner = true;
      nulled._seedWherePredicates = [...nulled.whereClause.predicates];
      return nulled;
    }
    return s;
  }

  protected override foreignKeyPresent(): boolean {
    return foreignKeyPresentFor(this.reflection as unknown as AssociationReflection, this.owner);
  }

  isNullScope(): boolean {
    return this.owner.isNewRecord() && !this.foreignKeyPresent();
  }

  isFindFromTarget(loaded?: boolean): boolean {
    return (
      (loaded ?? this.isLoaded()) ||
      (this.owner.isStrictLoading() && this.owner.isStrictLoadingAll()) ||
      !!this.reflection.options.strictLoading ||
      this.owner.isNewRecord() ||
      this.target.some((r) => r.isNewRecord() || r.isChanged)
    );
  }

  override isCollection(): boolean {
    return true;
  }

  override get reader(): Promise<Base[]> {
    this.ensureKlassExists();

    return (async () => {
      if (this.isStaleTarget()) {
        await this.reload();
      }

      const CollectionProxy = _CollectionProxyCtor as unknown as {
        create(klass: typeof Base, association: CollectionAssociation): AssociationProxy;
      };
      this._proxy ??= CollectionProxy.create(this.klass, this);
      this._proxy.resetScope();
      return this._proxy;
    })();
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

  protected setOwnerAttributes(record: Base): void {
    if (this.reflection.options.through) return;

    const ctor = this.owner.constructor as any;
    const fks = this.foreignKeyColumns();
    const richPk = (
      ctor._reflectOnAssociation?.(this.reflection.name) as
        | { activeRecordPrimaryKey?: string | string[] }
        | undefined
    )?.activeRecordPrimaryKey;
    const configuredPk = this.reflection.options.primaryKey ?? richPk ?? ctor.primaryKey ?? "id";
    const pks = Array.isArray(configuredPk) ? configuredPk : [configuredPk];

    for (let i = 0; i < fks.length; i++) {
      const pkCol = pks[i] ?? pks[0];
      const pkValue =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(pkCol)
          : (this.owner as any)[pkCol];

      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(fks[i], pkValue);
      } else {
        (record as any)[fks[i]] = pkValue;
      }
    }

    if (this.reflection.options.as) {
      const typeCol = this.polymorphicTypeColumn()!;
      const typeName = (ctor as typeof Base).polymorphicName();
      if (typeof (record as any)._writeAttribute === "function") {
        (record as any)._writeAttribute(typeCol, typeName);
      } else {
        (record as any)[typeCol] = typeName;
      }
    }
  }

  private foreignKeyColumns(): string[] {
    return ownerForeignKeyColumns(
      this.owner.constructor as typeof Base,
      this.reflection.name,
      this.reflection.options as Parameters<typeof ownerForeignKeyColumns>[2],
    );
  }

  private foreignKeyColumn(): string {
    return this.foreignKeyColumns()[0];
  }

  private polymorphicTypeColumn(): string | null {
    const opts = this.reflection.options as { as?: string; foreignType?: string };
    if (!opts.as) return null;
    return opts.foreignType ?? `${underscore(opts.as)}_type`;
  }

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
    if (this.reflection.options.through) {
      return Promise.resolve(this.loadTarget()).then((target) =>
        ids.map((id) => {
          const found = target.find((r) => String((r as any).id) === String(id));
          if (!found) throw new Error(`Couldn't find ${this.klass.name} with ID ${String(id)}`);
          return found;
        }),
      );
    }
    return this.find(...ids).then((found) => (Array.isArray(found) ? found : found ? [found] : []));
  }

  /** @internal */
  protected removeRecords(
    existingRecords: Base[],
    records: Base[],
    method: string,
  ): Promise<boolean> | boolean {
    try {
      for (const record of records) this.callback("beforeRemove", record);
    } catch (e) {
      if (!isAbortSignal(e)) throw e;
      this._lastRemoveAborted = true;
      return false;
    }
    this._lastRemoveAborted = false;
    const pruned = (): boolean => {
      this._targetStore = this.target.filter((r) => !includesRecord(records, r));
      for (const record of records) {
        if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
          continue;
        this.removeInverseInstance(record);
      }
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
  protected deleteRecords(_records: Base[], _method: string): Promise<number> | number {
    throw new Error(`deleteRecords must be implemented by ${this.constructor.name}`);
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

  private recordIdentity(record: Base): string | Base {
    const pk = (this.klass as any).primaryKey ?? "id";
    const keys = Array.isArray(pk) ? pk : [pk];
    const values = keys.map((key: string) =>
      typeof (record as any)._readAttribute === "function"
        ? (record as any)._readAttribute(key)
        : (record as any)[key],
    );
    if (values.some((v) => v == null)) return record;
    const ids = values.map((v) => (typeof v === "bigint" ? v.toString() : v));
    return JSON.stringify(ids.length === 1 ? ids[0] : ids);
  }

  private async deleteAllRecords(): Promise<number> {
    const rel = this.scope();
    if (rel && typeof rel.deleteAll === "function") {
      return rel.deleteAll();
    }
    return 0;
  }

  /** @internal */
  _mergeLoaderResults(rows: Base[]): void {
    this._targetStore = this.mergeTargetLists(rows, this.target);
    this.loadedBang();
  }

  /** @internal */
  mergeTargetLists(persisted: Base[], memory: Base[]): Base[] {
    if (memory.length === 0) return persisted;

    const memoryByIdentity = new Map<string | Base, Base>();
    for (const record of memory) memoryByIdentity.set(this.recordIdentity(record), record);

    const merged = persisted.map((record) => {
      const identity = this.recordIdentity(record);
      const memRecord = memoryByIdentity.get(identity);
      if (memRecord) {
        memoryByIdentity.delete(identity);

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

    return [...merged, ...[...memoryByIdentity.values()].filter((record) => !record.isPersisted())];
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

  /** @internal */
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
      if (!skipCallbacks) {
        try {
          this.callback("beforeAdd", record);
        } catch (e) {
          if (!isAbortSignal(e)) throw e;
          return null;
        }
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
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function concatRecordsLoop(
  records: Base[],
  addRecord: (record: Base, resultStillTrue: boolean) => Promise<boolean> | boolean,
): Promise<void> | void {
  let result = true;
  for (let i = 0; i < records.length; i++) {
    const inserted = addRecord(records[i], result);
    if (isThenable(inserted)) {
      const rest = records.slice(i + 1);
      return inserted.then(async (first) => {
        result = result && first;
        for (const record of rest) {
          const inserted = await addRecord(record, result);
          result = result && inserted;
        }
        if (!result) throw new Rollback();
      });
    }
    result = result && inserted;
  }
  if (!result) throw new Rollback();
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
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

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function includesRecord(records: Base[], record: Base): boolean {
  return records.some((r) => (r as unknown as { equals(o: unknown): boolean }).equals(record));
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
  const fullName = `${callbackName}For${this.reflection.name.charAt(0).toUpperCase()}${this.reflection.name.slice(1)}`;
  const owner = this.owner.constructor as any;
  const stored = owner[fullName];
  if (typeof stored === "function") return stored();
  if (Array.isArray(stored)) return stored;
  const fromOptions = (this.reflection.options as Record<string, unknown>)[callbackName];
  return Array.isArray(fromOptions) ? fromOptions : fromOptions != null ? [fromOptions] : [];
}

function arraysEqual(a: Base[], b: Base[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r === b[i]);
}
