import { Time as RubyTime } from "@blazetrails/date";
import { currentTimeFromProperTimezone } from "./timestamp.js";
import type { Base } from "./base.js";
import type { CounterCacheCounters } from "./counter-cache.js";
import { ArgumentError, SerializeCastValue } from "@blazetrails/activemodel";
import { runCallbacks } from "@blazetrails/activesupport";
import { InsertManager, UpdateManager, DeleteManager, Table as ArelTable } from "@blazetrails/arel";
import {
  ActiveRecordError,
  ReadOnlyRecord,
  RecordNotDestroyed,
  RecordNotSaved,
  UnknownAttributeError,
} from "./errors.js";
import { threadedConnectionFor, withConnection } from "./connection-handling.js";
import * as LockingOptimistic from "./locking/optimistic.js";
import {
  attributesForCreate,
  attributesForUpdate,
  attributesWithValues,
} from "./attribute-methods.js";
import { getStiBase, isStiSubclass, stiName, defineDynamicSelectReaders } from "./inheritance.js";
import { withTransactionReturningStatus } from "./transactions.js";
import { isSuppressed } from "./suppressor.js";
import {
  performValidations,
  raiseValidationError,
  RecordInvalid,
  type ValidationContextArg,
} from "./validations.js";
import { ReadonlyAttributeError } from "./readonly-attributes.js";
import { ScopeRegistry } from "./scoping.js";

interface PersistenceHost {
  new (attrs?: Record<string, unknown>): any;
  _instantiate(
    row: Record<string, unknown>,
    block?: (record: any) => void,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    overrideTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): any;
  /** @internal */
  discriminateClassForRecord?(attributes: Record<string, unknown>): PersistenceHost;
  primaryKey: string | string[];
  _queryConstraintsList?: string[] | null;
  _hasQueryConstraints?: boolean;
  _isBaseClass?: boolean;
  ensureSchemaLoaded(): Promise<void>;
}

export async function create(
  this: PersistenceHost,
  attributes: Record<string, unknown> | Record<string, unknown>[] = {},
  block?: (record: any) => void,
): Promise<any> {
  if (Array.isArray(attributes)) {
    const records: any[] = [];
    for (const a of attributes) {
      records.push(await (this as any).create(a, block));
    }
    return records;
  }
  await this.ensureSchemaLoaded();
  const mergedAttrs = (this as any)._mergeCurrentScopeAttrs(attributes);
  const record = new this(mergedAttrs);
  if (block) block(record);
  await record.save();
  return record;
}

export async function createBang(
  this: PersistenceHost,
  attributes: Record<string, unknown> | Record<string, unknown>[] = {},
  block?: (record: any) => void,
): Promise<any> {
  if (Array.isArray(attributes)) {
    const records: any[] = [];
    for (const a of attributes) {
      records.push(await (this as any).createBang(a, block));
    }
    return records;
  }
  await this.ensureSchemaLoaded();
  const mergedAttrs = (this as any)._mergeCurrentScopeAttrs(attributes);
  const record = new this(mergedAttrs);
  if (block) block(record);
  await record.saveBang();
  return record;
}

export function build(
  this: PersistenceHost,
  attributes?: Record<string, unknown> | Record<string, unknown>[],
  block?: (record: any) => void,
): any {
  if (Array.isArray(attributes)) {
    return attributes.map((a) => build.call(this, a, block));
  }
  const record = new this(attributes ?? {});
  if (block) block(record);
  return record;
}

/** @missingRailsCall instantiate_instance_of — PERMANENT */
export function instantiate(
  this: PersistenceHost,
  attributes: Record<string, unknown>,
  columnTypes: Record<string, unknown> = {},
  block?: (record: any) => void,
): any {
  const klass = this.discriminateClassForRecord
    ? this.discriminateClassForRecord(attributes)
    : this;
  return klass._instantiate(
    attributes,
    block,
    undefined,
    columnTypes as Record<string, { deserialize(value: unknown): unknown }>,
  );
}

export function queryConstraints(this: PersistenceHost, ...columnsList: string[]): void {
  if (columnsList.length === 0) {
    throw new ArgumentError("You must specify at least one column to be used in querying");
  }
  this._queryConstraintsList = columnsList.map(String);
  this._hasQueryConstraints = true;
}

export function hasQueryConstraints(this: PersistenceHost): boolean {
  return !!this._hasQueryConstraints;
}

export function queryConstraintsList(this: PersistenceHost): string[] | null {
  if (this._queryConstraintsList) return this._queryConstraintsList;

  const parent = Object.getPrototypeOf(this) as PersistenceHost | null;
  const parentIsBase = !parent || typeof parent !== "function" || parent.name === "Base";
  const isBase = this._isBaseClass ?? parentIsBase;
  if (isBase) {
    const pk = this.primaryKey;
    return Array.isArray(pk) ? pk : null;
  }

  if (parent && this.primaryKey !== parent.primaryKey) {
    const pk = this.primaryKey;
    return Array.isArray(pk) ? pk : null;
  }

  if (parent && typeof parent === "function") return queryConstraintsList.call(parent);
  return null;
}

export function compositeQueryConstraintsList(this: PersistenceHost): string[] {
  const list = queryConstraintsList.call(this);
  if (list) return list;
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk : [pk];
}

export async function _insertRecord(
  this: PersistenceHost,
  connection: {
    insert?(arel: unknown, ...args: unknown[]): Promise<unknown>;
    executeMutation?(sql: string, binds?: unknown[]): Promise<number>;
    toSql(arel: unknown): string;
    emptyInsertStatementValue?(pk?: string | null): string;
  },
  values: Record<string, unknown>,
  returning?: string[] | null,
): Promise<unknown> {
  const ctor = this as any;
  const primaryKey = ctor.primaryKey;
  let primaryKeyValue: unknown = null;
  if (ctor.isPrefetchPrimaryKey?.() && primaryKey && !Array.isArray(primaryKey)) {
    if (values[primaryKey] == null) {
      primaryKeyValue = ctor.nextSequenceValue?.();
      values[primaryKey] = ctor
        ._defaultAttributes()
        .getAttribute(primaryKey)
        .withCastValue(primaryKeyValue);
    }
  }

  const arelTable: ArelTable = ctor.arelTable;
  const im = new InsertManager(arelTable);

  const entries = Object.entries(values);
  if (entries.length > 0) {
    im.insert(entries.map(([col, val]) => [arelTable.get(col), val]));
  }

  if (typeof connection.insert === "function") {
    const cols = typeof ctor.columns === "function" ? (ctor.columns() as { name: string }[]) : [];
    const pkExists = cols.length === 0 || cols.some((c) => c.name === primaryKey);
    const pkArg: string | false =
      !Array.isArray(primaryKey) && primaryKey && pkExists ? primaryKey : false;
    if (entries.length === 0) {
      im.insert(
        connection.emptyInsertStatementValue!(!Array.isArray(primaryKey) ? primaryKey : null),
      );
    }
    return connection.insert(im, `${ctor.name} Create`, pkArg, primaryKeyValue, undefined, [], {
      returning: returning ?? null,
    });
  }

  const sql = connection.toSql(im);
  const finalSql =
    entries.length > 0
      ? sql
      : `${sql} ${connection.emptyInsertStatementValue?.() ?? "DEFAULT VALUES"}`;
  return connection.executeMutation!(finalSql);
}

export async function _updateRecord(
  this: PersistenceHost,
  values: Record<string, unknown>,
  constraints: Record<string, unknown>,
): Promise<number> {
  const setEntries = Object.entries(values);
  if (setEntries.length === 0) return 0;

  const arelTable: ArelTable = (this as any).arelTable;
  const um = new UpdateManager();
  um.table(arelTable);
  um.set(setEntries.map(([col, val]) => [arelTable.get(col), val]));

  for (const [col, val] of Object.entries(constraints)) {
    um.where(arelTable.get(col).eq(val));
  }

  applyDefaultAndGlobalConstraints(um as any, this as any);

  const adapter = threadedConnectionFor((this as any).constructor) ?? (this as any).connection;
  if (typeof adapter.update === "function") {
    return adapter.update(um, `${(this as any).name} Update`);
  }
  const sql = adapter.toSql(um);
  return adapter.executeMutation(sql);
}

/**
 * Builds and executes a DELETE with the given constraints.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods#_delete_record
 *
 * @missingRailsCall with_connection — CONVERGEABLE: persistence.rb:294-296 `with_connection {
 *   |c| c.delete(dm, ...) }` — trails resolves the adapter through
 *   `threadedConnectionFor(...) ?? this.connection` (persistence.ts:366) rather
 *   than the block form; converging the whole package onto `withConnection` is
 *   RFC 0073's permanent-connection-checkout flip, tracked there.
 */
export async function _deleteRecord(
  this: PersistenceHost,
  constraints: Record<string, unknown>,
): Promise<number> {
  const arelTable: ArelTable = (this as any).arelTable;
  const dm = new DeleteManager(arelTable);

  for (const [col, val] of Object.entries(constraints)) {
    dm.where(arelTable.get(col).eq(val));
  }

  applyDefaultAndGlobalConstraints(dm as any, this as any);

  const adapter = threadedConnectionFor((this as any).constructor) ?? (this as any).connection;
  if (typeof adapter.delete === "function") {
    return adapter.delete(dm);
  }
  const sql = adapter.toSql(dm);
  return adapter.executeMutation(sql);
}

interface PersistenceRecordFields {
  _newRecord: boolean;
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
}

interface PersistenceRecordDispatch {
  isNewRecord(): boolean;
  isDestroyed(): boolean;
}

export function isNewRecord(this: PersistenceRecordFields): boolean {
  return this._newRecord;
}

export function isPersisted(this: PersistenceRecordFields): boolean {
  return !this._newRecord && !this._destroyed;
}

export function isDestroyed(this: PersistenceRecordFields): boolean {
  return this._destroyed;
}

export function isPreviouslyNewRecord(this: PersistenceRecordFields): boolean {
  return this._previouslyNewRecord;
}

export function isPreviouslyPersisted(this: PersistenceRecordDispatch): boolean {
  return !this.isNewRecord() && this.isDestroyed();
}

interface AttributeIO {
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  attributeWriterMissing(name: string, value: unknown): void;
}

type TouchOption = boolean | string | string[];

interface CounterBangRecord extends AttributeIO {
  id: unknown;
  attributeInDatabase(name: string): unknown;
  clearAttributeChange(name: string): void;
  constructor: {
    updateCounters(id: unknown, counters: CounterCacheCounters): Promise<number>;
  };
}

interface ToggleBangRecord extends AttributeIO {
  updateAttribute(name: string, value: unknown): Promise<boolean | undefined>;
}

export function increment<T extends AttributeIO>(this: T, attribute: string, by: number = 1): T {
  const name = resolveAttributeAlias(this, attribute);
  const current = Number(this.readAttribute(name)) || 0;
  this.writeAttribute(name, current + by);
  return this;
}

function resolveAttributeAlias(record: object, attribute: string): string {
  const aliases = (record.constructor as { attributeAliases?: Record<string, string> })
    .attributeAliases;
  return aliases?.[attribute] ?? attribute;
}

export function decrement<T extends AttributeIO & { increment(a: string, b?: number): T }>(
  this: T,
  attribute: string,
  by: number = 1,
): T {
  return this.increment(attribute, -by);
}

export function toggle<T extends AttributeIO>(this: T, attribute: string): T {
  this.writeAttribute(attribute, !this.readAttribute(attribute));
  return this;
}

export async function incrementBang<T extends CounterBangRecord>(
  this: T & { increment(attribute: string, by?: number): T },
  attribute: string,
  by: number = 1,
  options: { touch?: TouchOption } = {},
) {
  if (attribute === undefined) {
    throw new Error("wrong number of arguments (given 0, expected 1..3)");
  }
  attribute = resolveAttributeAlias(this, attribute);
  this.increment(attribute, by);
  const change =
    Number(this.readAttribute(attribute)) - (Number(this.attributeInDatabase(attribute)) || 0);
  await this.constructor.updateCounters(this.id, { [attribute]: change, touch: options.touch });
  this.clearAttributeChange(attribute);
  if (options.touch != null) {
    const ctor = this.constructor as unknown as { prototype: object };
    await runCallbacks(this, "touch");
  }
  return this;
}

export async function decrementBang<
  T extends CounterBangRecord & {
    incrementBang(a: string, b?: number, o?: { touch?: TouchOption }): Promise<T>;
  },
>(this: T, attribute: string, by: number = 1, options: { touch?: TouchOption } = {}): Promise<T> {
  return this.incrementBang(attribute, -by, options);
}

export async function toggleBang<T extends ToggleBangRecord>(
  this: T & { toggle(attribute: string): T },
  attribute: string,
): Promise<boolean | undefined> {
  return this.toggle(attribute).updateAttribute(attribute, this.readAttribute(attribute));
}

interface UpdateRecord extends AttributeIO {
  save(options?: { validate?: boolean }): Promise<boolean | undefined>;
  saveBang(options?: { validate?: boolean }): Promise<true | undefined>;
}

/** @missingRailsCall assign_attributes — CONVERGEABLE update-must-call-assign-attributes-not-set-attributes */
export async function update<T extends UpdateRecord>(
  this: T,
  attributes: Record<string, unknown>,
): Promise<boolean | undefined> {
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    await self.setAttributes(attributes);
    return self.save() as Promise<boolean | undefined>;
  }) as Promise<boolean | undefined>;
}

/** @missingRailsCall assign_attributes — CONVERGEABLE update-must-call-assign-attributes-not-set-attributes */
export async function updateBang<T extends UpdateRecord>(
  this: T,
  attributes: Record<string, unknown>,
): Promise<true | undefined> {
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    await self.setAttributes(attributes);
    return self.saveBang() as Promise<true | undefined>;
  }) as Promise<true | undefined>;
}

interface DeleteRecord {
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
  id: unknown;
  idInDatabase: unknown;
  isPersisted(): boolean;
  freeze(): unknown;
  constructor: {
    arelTable: InstanceType<typeof ArelTable>;
    _buildQueryConstraintsWhereNode(
      constraints: Record<string, unknown>,
    ): Parameters<DeleteManager["where"]>[0];
    connection: {
      delete(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number>;
    };
  };
}

export async function deleteRow<T extends DeleteRecord>(this: T): Promise<T> {
  const ctor = this.constructor;
  if (this.isPersisted()) {
    const dm = new DeleteManager()
      .from(ctor.arelTable)
      .where(ctor._buildQueryConstraintsWhereNode(_queryConstraintsHash.call(this as any)));
    const adapter =
      threadedConnectionFor(ctor as unknown as typeof import("./base.js").Base) ?? ctor.connection;
    await adapter.delete(dm, "Delete");
  }
  this._destroyed = true;
  this._previouslyNewRecord = false;
  this.freeze();
  return this;
}

interface SaveRecord {
  _destroyed: boolean;
  _readonly: boolean;
  _newRecord: boolean;
  _attributes: { writeCastValue(key: string, val: unknown): void };
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  errors: { any: boolean };
  isValid(context?: ValidationContextArg): Promise<boolean>;
  constructor: {
    name: string;
  };
}

export async function save<T extends SaveRecord>(
  this: T,
  options?: { validate?: boolean; touch?: boolean },
  block?: (record: T) => void,
): Promise<boolean | undefined> {
  if (isSuppressed(this.constructor as unknown as Parameters<typeof isSuppressed>[0])) {
    return true;
  }
  await (
    this.constructor as unknown as { ensureSchemaLoaded(): Promise<void> }
  ).ensureSchemaLoaded();
  const self = this as any;
  const ctor = this.constructor;

  try {
    return (await withTransactionReturningStatus.call(self, async () => {
      if (options?.validate !== false && typeof self._runBelongsToDefaults === "function") {
        await self._runBelongsToDefaults();
        self._belongsToDefaultsApplied = true;
      }
      let validationsPassed: boolean;
      try {
        validationsPassed = await performValidations.call(this, options);
      } finally {
        self._belongsToDefaultsApplied = false;
      }
      if (!validationsPassed) return false;
      if (this._readonly) {
        throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
      }
      if (this._destroyed) {
        return false;
      }

      if (this._newRecord && isStiSubclass(ctor)) {
        const col = getStiBase(ctor).inheritanceColumn;
        if (col && !this._readAttribute(col)) {
          this._attributes.writeCastValue(col, this.constructor.name);
        }
      }

      return self.createOrUpdate(options?.touch ?? true, block);
    })) as boolean | undefined;
  } catch (e) {
    if (e instanceof RecordInvalid) return false;
    throw e;
  }
}

export async function saveBang<
  T extends SaveRecord & {
    save(
      o?: { validate?: boolean; touch?: boolean },
      block?: (record: T) => void,
    ): Promise<boolean | undefined>;
  },
>(
  this: T,
  options?: { validate?: boolean; touch?: boolean },
  block?: (record: T) => void,
): Promise<true | undefined> {
  const result = await this.save(options, block);
  if (result === false) {
    if ((this as unknown as { errors: { any: boolean } }).errors.any) {
      raiseValidationError(this);
    }
    throw new RecordNotSaved("Failed to save the record", this as unknown as object);
  }
  return result;
}

interface DestroyRecord {
  isReadonly(): boolean;
  constructor: { name: string };
}

export async function destroy<T extends DestroyRecord>(this: T): Promise<T | false> {
  if (this.isReadonly()) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }

  const self = this as any;
  if (self._destroyCallbackAlreadyCalled) return this;
  self._destroyCallbackAlreadyCalled = true;
  try {
    const result = await withTransactionReturningStatus.call(self, () => self._destroyRow());
    return result ? this : false;
  } finally {
    self._destroyCallbackAlreadyCalled = false;
  }
}

export async function destroyBang<T extends DestroyRecord & { destroy(): Promise<T | false> }>(
  this: T,
): Promise<T> {
  const result = await this.destroy();
  if (result === false) (this as any)._raiseRecordNotDestroyed();
  return result as T;
}

export function slice(this: AttributeIO, ...keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = this.readAttribute(key);
  }
  return result;
}

export function valuesAt(this: AttributeIO, ...keys: string[]): unknown[] {
  return keys.map((key) => this.readAttribute(key));
}

interface AttributeSingleSave {
  writeAttribute(name: string, value: unknown): void;
  save(options?: { validate?: boolean }): Promise<boolean | undefined>;
  saveBang(options?: { validate?: boolean }): Promise<true | undefined>;
}

export async function updateAttribute<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<boolean | undefined> {
  name = String(name);
  verifyReadonlyAttribute.call(this as unknown as PersistencePrivateHost, name);
  this.writeAttribute(name, value);
  return this.save({ validate: false });
}

export async function updateAttributeBang<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<true | undefined> {
  name = String(name);
  verifyReadonlyAttribute.call(this as unknown as PersistencePrivateHost, name);
  this.writeAttribute(name, value);
  return this.saveBang({ validate: false });
}

interface UpdateColumnsRecord {
  isReadonly(): boolean;
  _attributes: {
    fetchValue(name: string): unknown;
    writeCastValue(name: string, value: unknown): void;
  };
  id: unknown;
  isPersisted(): boolean;
  changesApplied(): void;
  constructor: {
    name: string;
    primaryKey: string | string[];
    arelTable: InstanceType<typeof ArelTable>;
    attributeTypes(): Record<string, unknown>;
    _defaultAttributes(): {
      isKey(name: string): boolean;
      getAttribute(name: string): { value: unknown };
    };
    typeForAttribute(name: string): {
      cast(v: unknown): unknown;
      serialize?(v: unknown): unknown;
      type?(): string;
    };
    _buildPkWhereNode(id: unknown): Parameters<UpdateManager["where"]>[0];
    connection: {
      update(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number>;
      quote?(value: unknown): string;
      quoteColumnName?(name: string): string;
      quoteTableName?(name: string): string;
      toSql(arel: unknown): string;
    };
  };
}

export async function updateColumn<T extends UpdateColumnsRecord>(
  this: T & { updateColumns(attrs: Record<string, unknown>): Promise<boolean> },
  name: string,
  value: unknown,
): Promise<boolean> {
  return this.updateColumns({ [name]: value });
}

export async function updateColumns<T extends UpdateColumnsRecord>(
  this: T,
  attributes: Record<string, unknown>,
): Promise<boolean> {
  if (this.isReadonly()) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }
  if (!this.isPersisted()) {
    throw new Error("Cannot update columns on a new or destroyed record");
  }

  if (Object.keys(attributes).length === 0) {
    return true;
  }

  const ctor = this.constructor;
  const table = ctor.arelTable as unknown as InstanceType<typeof ArelTable> & {
    get(name: string): unknown;
  };

  const updateConstraints = _queryConstraintsHash.call(this as unknown as PersistencePrivateHost);

  const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
  const aliases: Record<string, string> =
    (
      ctor as unknown as {
        attributeAliases?: Record<string, string>;
      }
    ).attributeAliases ?? {};
  const resolvedEntries = Object.entries(attributes).map(
    ([rawKey, value]) => [aliases[rawKey] ?? rawKey, value] as const,
  );
  for (const [key] of resolvedEntries) {
    verifyReadonlyAttribute.call(this as unknown as PersistencePrivateHost, key);
  }

  const setPairs: Array<[unknown, unknown]> = [];
  const updatedKeys: string[] = [];
  const attributeTypes = ctor.attributeTypes();
  for (const [key, value] of resolvedEntries) {
    updatedKeys.push(key);
    const known = Object.hasOwn(attributeTypes, key);
    if (!known && !pkCols.includes(key)) {
      throw new UnknownAttributeError(this, key);
    }
    const attrType = known ? ctor.typeForAttribute(key) : undefined;
    const cast = attrType ? attrType.cast(value) : value;
    this._attributes.writeCastValue(key, cast);
    const type = attrType as
      | {
          serializeCastValue(v: unknown): unknown;
          serialize(v: unknown): unknown;
          itselfIfSerializeCastValueCompatible?(): unknown;
        }
      | undefined;
    const dbValue =
      type && typeof type.serialize === "function"
        ? SerializeCastValue.serialize(type, cast)
        : cast;
    setPairs.push([table.get(key), dbValue]);
  }

  const um = new UpdateManager();
  um.table(table);
  um.set(setPairs as Parameters<UpdateManager["set"]>[0]);
  um.where(
    (
      ctor as unknown as {
        _buildQueryConstraintsWhereNode(
          c: Record<string, unknown>,
        ): Parameters<UpdateManager["where"]>[0];
      }
    )._buildQueryConstraintsWhereNode(updateConstraints),
  );
  applyDefaultAndGlobalConstraints(um as never, ctor as never);

  const adapter =
    (threadedConnectionFor(ctor as unknown as typeof import("./base.js").Base) as
      | typeof ctor.connection
      | null) ?? ctor.connection;
  const affectedRows = await adapter.update(um, "Update Columns");

  const clearer = this as unknown as { clearAttributeChange?(name: string): void };
  if (typeof clearer.clearAttributeChange === "function") {
    for (const k of updatedKeys) clearer.clearAttributeChange(k);
  } else {
    this.changesApplied();
  }
  return affectedRows === 1;
}

interface ReloadRecord {
  _attributes: unknown;
  _newRecord: boolean;
  _previouslyNewRecord: boolean;
  _mutationsBeforeLastSave: unknown;
  _mutationsFromDatabase: unknown;
  _associationInstances: Map<string, { owner: unknown }>;
  _collectionProxies: Map<string, unknown>;
  _resetAssociationCaches(): void;
  id: unknown;
  constructor: {
    name: string;
    primaryKey: string | string[];
    clearQueryCachesForCurrentThread?(): void;
    unscoped<R>(block: () => R | Promise<R>): Promise<R>;
  };
}

/**
 * Re-fetch the record from the database and overwrite in-memory attributes,
 * resetting dirty tracking and clearing association/proxy caches.
 *
 * The refetch routes through `_findRecord` so default scopes apply exactly as
 * Rails' `apply_scoping?` dictates: with an all_queries default scope (or a
 * global current scope) and no `unscoped: true`, `_findRecord` runs with
 * `all_queries: true`; otherwise the fetch is wrapped in `unscoped { }`. This
 * also makes reload raise `RecordNotFound` when the active scope excludes the
 * just-saved row (Rails uses `find_by!`).
 *
 * Mirrors: ActiveRecord::Persistence#reload
 *
 * @missingRailsCall merge — PERMANENT: persistence.rb:746 `(options ||
 *   {}).merge(all_queries: true)` — Ruby Hash#merge returning a new hash is JS
 *   object spread (`{ ...findOptions, allQueries: true }`, persistence.ts:1422);
 *   there is no Hash object to call `merge` on. Language shortcoming.
 */
export async function reload<T extends ReloadRecord>(
  this: T,
  options?: { lock?: boolean | string; unscoped?: boolean },
): Promise<T> {
  const ctor = this.constructor;
  ctor.clearQueryCachesForCurrentThread?.();

  const findOptions = { lock: options?.lock };
  const fresh = (
    isApplyScoping.call(this as never, options)
      ? await _findRecord.call(this as never, { ...findOptions, allQueries: true })
      : await ctor.unscoped(() => _findRecord.call(this as never, findOptions))
  ) as {
    _attributes: unknown;
    _associationInstances: Map<string, { owner: unknown }>;
    _collectionProxies: Map<string, unknown>;
  };

  this._attributes = fresh._attributes;
  defineDynamicSelectReaders(this as unknown as import("./base.js").Base);
  this._newRecord = false;
  this._previouslyNewRecord = false;
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;

  this._resetAssociationCaches();
  for (const [name, value] of fresh._associationInstances) {
    this._associationInstances.set(name, value);
  }
  for (const [name, value] of fresh._collectionProxies) {
    this._collectionProxies.set(name, value);
  }
  for (const association of this._associationInstances.values()) {
    association.owner = this;
  }
  return this;
}

interface CloneRecord {
  _attributes: unknown;
  _previouslyNewRecord: boolean;
  errors: { constructor: new (base: unknown) => unknown };
}

export function clone<T extends CloneRecord>(this: T): T {
  const copy = Object.create(Object.getPrototypeOf(this)) as T;
  Object.assign(copy, this);
  (copy as unknown as CloneRecord)._attributes = this._attributes;
  (copy as unknown as CloneRecord)._previouslyNewRecord = false;
  (copy as unknown as { errors: unknown }).errors = new this.errors.constructor(copy);
  return copy;
}

interface BecomesRecord {
  _attributes: { reverseMergeBang(target: unknown): unknown };
  _newRecord: boolean;
  _destroyed: boolean;
  _mutationsFromDatabase: unknown;
  errors: unknown;
}

export function becomes<
  T extends BecomesRecord,
  K extends new (
    attrs: Record<string, unknown>,
    initBlock?: (record: BecomesRecord) => void,
  ) => BecomesRecord,
>(this: T, klass: K): InstanceType<K> {
  const ctor = klass as unknown as {
    _suppressStiNewDispatch?: unknown;
    _suppressAbstractCheck?: boolean;
  };
  const hadOwn = Object.prototype.hasOwnProperty.call(ctor, "_suppressStiNewDispatch");
  const prev = ctor._suppressStiNewDispatch;
  ctor._suppressStiNewDispatch = klass;
  const hadOwnAbstract = Object.prototype.hasOwnProperty.call(ctor, "_suppressAbstractCheck");
  const prevAbstract = ctor._suppressAbstractCheck;
  ctor._suppressAbstractCheck = true;
  let instance: InstanceType<K>;
  try {
    instance = new klass({}, (becoming) => {
      this._attributes.reverseMergeBang(becoming._attributes);
      becoming._attributes = this._attributes;
      becoming._newRecord = this._newRecord;
      becoming._destroyed = this._destroyed;
      becoming._mutationsFromDatabase = this._mutationsFromDatabase ?? null;
      const targetErrors = becoming.errors as { copyBang?(other: unknown): void };
      if (typeof targetErrors.copyBang === "function") {
        targetErrors.copyBang(this.errors);
      }
    }) as InstanceType<K>;
  } finally {
    if (hadOwn) ctor._suppressStiNewDispatch = prev;
    else delete ctor._suppressStiNewDispatch;
    if (hadOwnAbstract) ctor._suppressAbstractCheck = prevAbstract;
    else delete ctor._suppressAbstractCheck;
  }
  return instance;
}

export function becomesBang<
  T extends BecomesRecord & { becomes: typeof becomes },
  K extends typeof import("./base.js").Base,
>(this: T, klass: K): InstanceType<K> {
  const instance = this.becomes(klass);
  const base = getStiBase(klass);
  const inheritanceCol = base.inheritanceColumn;
  if (inheritanceCol) {
    const value = klass.isDescendsFromActiveRecord() ? null : stiName(klass);
    (instance as unknown as { writeAttribute(name: string, value: unknown): void }).writeAttribute(
      inheritanceCol,
      value,
    );
  }
  return instance;
}

interface PersistencePrivateHost {
  _newRecord: boolean;
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
  _readonly?: boolean;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  isNewRecord(): boolean;
  isDestroyed(): boolean;
  id: unknown;
  idInDatabase: unknown;
  attributeInDatabase?(col: string): unknown;
  _associationInstances?: Map<
    string,
    { owner?: { isStrictLoading?(): boolean; isStrictLoadingNPlusOneOnly?(): boolean } } | null
  >;
  constructor: {
    name: string;
    primaryKey: string | string[];
    currentScope?: unknown | (() => unknown);
    defaultScoped(): { whereClause: { isEmpty(): boolean; ast: unknown } };
    readonlyAttributeQ?(name: string): boolean;
    withConnection?(fn: (conn: unknown) => Promise<void>): Promise<void>;
    connection: { delete(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number> };
  };
}

type PersistenceInternalHost = PersistencePrivateHost & {
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, val: unknown): void;
  _triggerUpdateCallback?: boolean | null;
  _attributes?: { keys?(): Iterable<string> };
  constructor: PersistencePrivateHost["constructor"] & {
    columnNames?(): string[];
    _counterCacheColumns?: string[];
  };
};

type PersistenceInstanceChainHost = {
  constructor: any;
  _newRecord: boolean;
  _previouslyNewRecord: boolean;
  _attributes: any;
  attributeNames(): string[];
  readAttribute(name: string): unknown;
  isWillSaveChangeToAttribute(name: string): boolean;
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
};

/** @internal */
export function initInternals(this: PersistencePrivateHost, super_: () => void): void {
  super_();
  (this as any)._triggerDestroyCallback = (this as any)._triggerUpdateCallback = null;
  this._previouslyNewRecord = false;
}

/** @internal */
export function strictLoadedAssociations(this: PersistencePrivateHost): string[] {
  return [...(this._associationInstances ?? [])]
    .filter(
      ([, assoc]) =>
        assoc?.owner?.isStrictLoading?.() && !assoc?.owner?.isStrictLoadingNPlusOneOnly?.(),
    )
    .map(([name]) => name);
}

/** @internal */
export function _findRecord(
  this: PersistencePrivateHost & { constructor: any },
  options?: { lock?: boolean | string; allQueries?: boolean | null },
): Promise<unknown> {
  const ctor = this.constructor;
  const preloads = strictLoadedAssociations.call(this);
  let scope = ctor.all({ allQueries: options?.allQueries ?? null });
  if (preloads.length > 0) scope = scope.preload(...preloads);
  if (options?.lock) scope = scope.lock(options.lock);
  return scope.findByBang(_inMemoryQueryConstraintsHash.call(this));
}

/**
 * @internal
 * @missingRailsCall attribute — PERMANENT
 */
export function _inMemoryQueryConstraintsHash(
  this: PersistencePrivateHost,
): Record<string, unknown> {
  const constraintsList = queryConstraintsList.call(this.constructor as any);
  if (!constraintsList) {
    const pk = this.constructor.primaryKey as string;
    return { [pk]: this.id };
  }
  return Object.fromEntries(constraintsList.map((col) => [col, this.readAttribute(col)]));
}

/** @internal */
export function isApplyScoping(
  this: PersistencePrivateHost,
  options?: { unscoped?: boolean },
): boolean {
  if (options?.unscoped) return false;
  const ctor = this.constructor as any;
  const hasAllQueriesDefaultScope = !!ctor.defaultScopes?.some((s: any) => s.allQueries);
  return !!(hasAllQueriesDefaultScope || ctor.globalCurrentScope());
}

/** @internal */
export function _queryConstraintsHash(this: PersistencePrivateHost): Record<string, unknown> {
  const constraintsList = queryConstraintsList.call(this.constructor as any);
  if (!constraintsList) {
    const pk = this.constructor.primaryKey as string;
    return { [pk]: this.idInDatabase };
  }
  return Object.fromEntries(
    constraintsList.map((columnName: string) => [
      columnName,
      this.attributeInDatabase
        ? this.attributeInDatabase(columnName)
        : this.readAttribute(columnName),
    ]),
  );
}

/** @internal */
export function destroyAssociations(this: PersistencePrivateHost): void {}

/** @internal */
export function destroyRow(this: PersistencePrivateHost): Promise<number> {
  return _deleteRow.call(this);
}

/** @internal */
export function _deleteRow(this: PersistencePrivateHost): Promise<number> {
  return _deleteRecord.call(this.constructor as any, _queryConstraintsHash.call(this));
}

/** @internal */
export function _touchRow(
  this: PersistenceInternalHost,
  attributeNames: string[],
  time?: RubyTime | null,
): Promise<number> {
  const t = time ?? currentTimeFromProperTimezone();
  for (const attr of attributeNames) {
    this._writeAttribute(attr, t);
  }
  return (this as any)._updateRow(attributeNames, "touch");
}

/** @internal */
export function _updateRow(
  this: PersistencePrivateHost,
  attributeNames: string[],
  _attemptedAction = "update",
): Promise<number> {
  return _updateRecord.call(
    this.constructor as any,
    attributesWithValues.call(this as any, attributeNames),
    _queryConstraintsHash.call(this),
  );
}

/** @internal */
async function instanceUpdateRecord(
  this: PersistenceInstanceChainHost,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<number> {
  attributeNames = attributesForUpdate.call(this as any, attributeNames ?? this.attributeNames());

  let affectedRows: number;
  if (attributeNames.length === 0) {
    affectedRows = 0;
    (this as any)._triggerUpdateCallback = true;
  } else {
    affectedRows = await (this as any)._updateRow(attributeNames);
    (this as any)._triggerUpdateCallback = affectedRows === 1;
  }

  this._previouslyNewRecord = false;
  block?.(this);
  return affectedRows;
}

/** @internal */
export async function _createRecord(
  this: PersistenceInstanceChainHost,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<unknown> {
  const ctor = this.constructor;
  if (ctor.lockingEnabled) {
    const lockCol = ctor.lockingColumn;
    const defaults = ctor._defaultAttributes();
    if (defaults.isKey(lockCol) && this._readAttribute(lockCol) == null) {
      this._writeAttribute(lockCol, defaults.getAttribute(lockCol).value);
    }
  }

  const attrs = this._attributes.valuesForDatabase();
  const names = LockingOptimistic._createRecord.call(
    this as any,
    attributeNames ?? this.attributeNames(),
    (n: string[]) => n,
  ) as string[];
  const columns = attributesForCreate.call(this as any, names);

  await withConnection.call(ctor as unknown as typeof Base, async (connection) => {
    const returningColumns = await ctor._returningColumnsForInsert(connection);
    const supportsReturning =
      (await (
        connection as { supportsInsertReturning?(): Promise<boolean> }
      ).supportsInsertReturning?.()) ?? false;
    const returning = supportsReturning && returningColumns.length > 0 ? returningColumns : null;

    const returningValues = await _insertRecord.call(
      ctor,
      connection,
      attributesWithValues.call(this as any, columns),
      returning,
    );

    const writeBack = (column: string, value: unknown): boolean => {
      if (value == null) return false;
      const current = this._readAttribute(column);
      if (current != null && current !== false) return false;
      const type = ctor.typeForAttribute?.(column);
      this._writeAttribute(column, type?.deserialize ? type.deserialize(value) : value);
      return true;
    };

    if (returning) {
      const returnValues = Array.isArray(returningValues) ? returningValues : [returningValues];
      returning.forEach((column: string, i: number) => writeBack(column, returnValues[i]));
    } else {
      const insertedId = Array.isArray(returningValues) ? returningValues[0] : returningValues;
      for (const column of returningColumns) {
        if (writeBack(column, insertedId)) break;
      }
    }
  });
  if (ctor.lockingEnabled) {
    const lockCol = ctor.lockingColumn;
    const writtenLockValue = attrs[lockCol] ?? null;
    this._attributes.writeFromDatabase(lockCol, writtenLockValue);
  }

  this._previouslyNewRecord = true;
  this._newRecord = false;
  block?.(this);
  return (this as any).id;
}

/** @internal */
export function verifyReadonlyAttribute(this: PersistencePrivateHost, name: string): void {
  if ((this.constructor as any).readonlyAttributeQ?.(name)) {
    throw new ReadonlyAttributeError(name);
  }
}

/** @internal */
export function _raiseRecordNotDestroyed(this: PersistencePrivateHost): never {
  (this as any)._associationDestroyException ??= null;
  const key = this.constructor.primaryKey;
  const keyStr = Array.isArray(key) ? key.join(", ") : key;
  try {
    throw (
      (this as any)._associationDestroyException ??
      new RecordNotDestroyed(
        `Failed to destroy ${this.constructor.name} with ${keyStr}=${String(this.id)}`,
        this as unknown as object,
      )
    );
  } finally {
    (this as any)._associationDestroyException = null;
  }
}

/** @internal */
export function _raiseReadonlyRecordError(this: { constructor: { name: string } }): never {
  throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
}

/** @internal */
export function _raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using persisted?, new_record?, or destroyed? before touching.",
  );
}

/** @internal */
function instantiateInstanceOf(
  klass: {
    _instantiate(
      attrs: Record<string, unknown>,
      block?: (r: any) => void,
      columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    ): any;
  },
  attributes: Record<string, unknown>,
  columnTypes: Record<string, unknown> = {},
  block?: (r: any) => void,
): any {
  return klass._instantiate(
    attributes,
    block,
    columnTypes as Record<string, { deserialize(value: unknown): unknown }>,
  );
}

/** @internal */
function discriminateClassForRecord<T>(klass: T, _record: Record<string, unknown>): T {
  return klass;
}

/**
 * Append the default constraint and the global-current-scope WHERE clause
 * (if any) to an Arel UpdateManager or DeleteManager. Mirrors the constraint
 * stacking in Rails `persistence.rb` `_update_record` / `_delete_record`.
 * @internal
 * @noRailsEquivalent CONVERGEABLE the constraint stacking Ruby writes inline in _update_record / _delete_record (persistence.rb:263).
 */
export function applyDefaultAndGlobalConstraints(
  manager: { where(node: unknown): unknown },
  ctor: object,
): void {
  const defaultConstraint = buildDefaultConstraint.call(ctor as any);
  if (defaultConstraint != null) manager.where(defaultConstraint);
  const globalScope = ScopeRegistry.globalCurrentScope(ctor);
  if (globalScope) {
    const ast = globalScope.whereClause?.ast;
    if (ast != null) manager.where(ast);
  }
}

/** @internal */
export function buildDefaultConstraint(this: {
  defaultScopes?: { allQueries: boolean; scope: (rel: any) => any }[];
  defaultScoped(options: { allQueries?: boolean | null }): {
    whereClause: { isEmpty(): boolean; ast: unknown };
  };
}): unknown {
  if (!this.defaultScopes?.some((s) => s.allQueries)) return undefined;
  const defaultWhereClause = this.defaultScoped({ allQueries: true }).whereClause;
  return defaultWhereClause.isEmpty() ? undefined : defaultWhereClause.ast;
}

export const InstanceMethods = {
  _updateRecord: instanceUpdateRecord,
};
