import { Time as RubyTime } from "@blazetrails/date";
import { type TouchArgs, type TouchOptions } from "./timestamp.js";
import {
  basicObjRespondTo,
  isEmpty,
  keys,
  rbEqual,
  rbFPublicSend,
  rbObjAsString,
  rbObjSingletonClass,
  rtest,
  union,
  zip,
  eachPair,
  rbCallSuper,
} from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type { CounterCacheCounters } from "./counter-cache.js";
import type { IndexedRow } from "./result.js";
import {
  ArgumentError,
  AttributeMethods,
  type PermittedAttributes,
} from "@blazetrails/activemodel";
import { extractOptionsBang, indexWith, transformKeys } from "@blazetrails/activesupport";
import {
  InsertManager,
  UpdateManager,
  DeleteManager,
  Table as ArelTable,
  Nodes,
} from "@blazetrails/arel";
import { ActiveRecordError, ReadOnlyRecord, RecordNotDestroyed, RecordNotSaved } from "./errors.js";
import { attributesWithValues } from "./attribute-methods.js";
import { withTransactionReturningStatus } from "./transactions.js";
import { isDefaultScopes } from "./scoping/default.js";
import { RecordInvalid } from "./validations.js";
import { ActiveRecord } from "./namespaces.js";

interface PersistenceHost {
  new (attrs?: Record<string, unknown> | PermittedAttributes, block?: (record: any) => void): any;
  /** @internal */
  primaryKey: string | string[];
  _queryConstraintsList?: string[] | null;
  _hasQueryConstraints?: string[] | false;
  isBaseClass(): boolean;
  baseClass: PersistenceHost;
  ensureSchemaLoaded(): Promise<void>;
  /** @internal */
  discriminateClassForRecord(record: Record<string, unknown> | IndexedRow): typeof Base;
  /** @internal */
  instantiateInstanceOf(
    klass: typeof Base,
    attributes: Record<string, unknown> | IndexedRow,
    columnTypes?: Record<string, unknown>,
    block?: (r: any) => void,
  ): any;
}

export async function create(
  this: typeof Base,
  attributes: Record<string, unknown> | PermittedAttributes | Record<string, unknown>[] = {},
  block?: (record: any) => void | Promise<void>,
): Promise<any> {
  if (Array.isArray(attributes)) {
    const records: any[] = [];
    for (const attr of attributes) records.push(await this.create(attr, block));
    return records;
  }
  await this.ensureSchemaLoaded();
  let yielded: unknown;
  const record = new this(
    attributes,
    block &&
      ((record: any) => {
        yielded = block(record);
      }),
  );
  await yielded;
  await record.save();
  return record;
}

export async function createBang(
  this: typeof Base,
  attributes: Record<string, unknown> | PermittedAttributes | Record<string, unknown>[] = {},
  block?: (record: any) => void | Promise<void>,
): Promise<any> {
  if (Array.isArray(attributes)) {
    const records: any[] = [];
    for (const attr of attributes) records.push(await this.createBang(attr, block));
    return records;
  }
  await this.ensureSchemaLoaded();
  let yielded: unknown;
  const record = new this(
    attributes,
    block &&
      ((record: any) => {
        yielded = block(record);
      }),
  );
  await yielded;
  await record.saveBang();
  return record;
}

export function build(
  this: PersistenceHost,
  attributes?: Record<string, unknown> | Record<string, unknown>[],
  block?: (record: any) => void,
): any {
  if (Array.isArray(attributes)) {
    return attributes.map((attr) => build.call(this, attr, block));
  } else {
    return new this(attributes, block);
  }
}

export function instantiate(
  this: PersistenceHost,
  attributes: Record<string, unknown> | IndexedRow,
  columnTypes: Record<string, unknown> = {},
  block?: (record: any) => void,
): any {
  const klass = this.discriminateClassForRecord(attributes);
  return this.instantiateInstanceOf(klass, attributes, columnTypes, block);
}

export class ClassMethods {
  static update<T extends typeof Base>(
    this: T,
    attributes: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static update<T extends typeof Base>(
    this: T,
    id: ":all",
    attributes: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static update<T extends typeof Base>(
    this: T,
    id: unknown[],
    attributes: Record<string, unknown>[],
  ): Promise<InstanceType<T>[]>;
  static update<T extends typeof Base>(
    this: T,
    id: unknown,
    attributes: Record<string, unknown>,
  ): Promise<InstanceType<T>>;
  static async update<T extends typeof Base>(
    this: T,
    id: unknown,
    attributes?: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    if (attributes === undefined) [id, attributes] = [":all", id as Record<string, unknown>];
    if (Array.isArray(id)) {
      if (id.some((oneId) => oneId instanceof ActiveRecord.Base)) {
        throw new ArgumentError(
          "You are passing an array of ActiveRecord::Base instances to `update`. " +
            "Please pass the ids of the objects by calling `pluck(:id)` or `map(&:id)`.",
        );
      }
      const objects: InstanceType<T>[] = [];
      for (const oneId of id) objects.push(await this.find(oneId));
      for (const [idx, object] of objects.entries()) {
        await object.update((attributes as Record<string, unknown>[])[idx]);
      }
      return objects;
    } else if (id === ":all") {
      const records = await this.all();
      for (const record of records) await record.update(attributes as Record<string, unknown>);
      return records;
    } else {
      if (id instanceof ActiveRecord.Base) {
        throw new ArgumentError(
          "You are passing an instance of ActiveRecord::Base to `update`. " +
            "Please pass the id of the object by calling `.id`.",
        );
      }
      const object = await this.find(id);
      await object.update(attributes as Record<string, unknown>);
      return object;
    }
  }

  static updateBang<T extends typeof Base>(
    this: T,
    attributes: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static updateBang<T extends typeof Base>(
    this: T,
    id: ":all",
    attributes: Record<string, unknown>,
  ): Promise<InstanceType<T>[]>;
  static updateBang<T extends typeof Base>(
    this: T,
    id: unknown[],
    attributes: Record<string, unknown>[],
  ): Promise<InstanceType<T>[]>;
  static updateBang<T extends typeof Base>(
    this: T,
    id: unknown,
    attributes: Record<string, unknown>,
  ): Promise<InstanceType<T>>;
  static async updateBang<T extends typeof Base>(
    this: T,
    id: unknown,
    attributes?: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<InstanceType<T> | InstanceType<T>[]> {
    if (attributes === undefined) [id, attributes] = [":all", id as Record<string, unknown>];
    if (Array.isArray(id)) {
      if (id.some((oneId) => oneId instanceof ActiveRecord.Base)) {
        throw new ArgumentError(
          "You are passing an array of ActiveRecord::Base instances to `update!`. " +
            "Please pass the ids of the objects by calling `pluck(:id)` or `map(&:id)`.",
        );
      }
      const objects: InstanceType<T>[] = [];
      for (const oneId of id) objects.push(await this.find(oneId));
      for (const [idx, object] of objects.entries()) {
        await object.updateBang((attributes as Record<string, unknown>[])[idx]);
      }
      return objects;
    } else if (id === ":all") {
      const records = await this.all();
      for (const record of records) await record.updateBang(attributes as Record<string, unknown>);
      return records;
    } else {
      if (id instanceof ActiveRecord.Base) {
        throw new ArgumentError(
          "You are passing an instance of ActiveRecord::Base to `update!`. " +
            "Please pass the id of the object by calling `.id`.",
        );
      }
      const object = await this.find(id);
      await object.updateBang(attributes as Record<string, unknown>);
      return object;
    }
  }

  static queryConstraintsList = queryConstraintsList;
}

export function queryConstraints(this: PersistenceHost, ...columnsList: string[]): void {
  if (columnsList.length === 0) {
    throw new ArgumentError("You must specify at least one column to be used in querying");
  }
  this._queryConstraintsList = columnsList.map(String);
  this._hasQueryConstraints = this._queryConstraintsList;
}

export function hasQueryConstraints(this: PersistenceHost): string[] | false {
  return Object.hasOwn(this, "_hasQueryConstraints") ? this._hasQueryConstraints! : false;
}

export function queryConstraintsList(this: PersistenceHost): string[] | null {
  return (
    Object.getOwnPropertyDescriptor(this, "_queryConstraintsList")?.value ||
    (this._queryConstraintsList =
      this.isBaseClass() || !rbEqual(this.primaryKey, this.baseClass.primaryKey)
        ? Array.isArray(this.primaryKey)
          ? this.primaryKey
          : null
        : queryConstraintsList.call(this.baseClass))
  );
}

export function compositeQueryConstraintsList(this: PersistenceHost): string[] {
  const list = queryConstraintsList.call(this);
  if (list) return list;
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk : [pk];
}

export async function _insertRecord(
  this: typeof Base,
  connection: {
    insert(arel: unknown, ...args: unknown[]): Promise<unknown>;
    emptyInsertStatementValue(pk?: string | null): string;
  },
  values: Record<string, unknown>,
  returning?: string[] | null,
): Promise<unknown> {
  const primaryKey = this.primaryKey as string;
  let primaryKeyValue: unknown = null;
  if (this.isPrefetchPrimaryKey() && primaryKey) {
    if (!rtest(values[primaryKey])) {
      values[primaryKey] = (() => {
        primaryKeyValue = this.nextSequenceValue();
        return this._defaultAttributes().getAttribute(primaryKey).withCastValue(primaryKeyValue);
      })();
    }
  }

  const arelTable: ArelTable = this.arelTable;
  const im = new InsertManager(arelTable);

  if (isEmpty(values)) {
    im.insert(connection.emptyInsertStatementValue(primaryKey));
  } else {
    im.insert(transformKeys(values, (name) => arelTable.get(name)));
  }

  return connection.insert(
    im,
    `${this.name} Create`,
    primaryKey || false,
    primaryKeyValue,
    undefined,
    [],
    {
      returning: returning ?? null,
    },
  );
}

export async function _updateRecord(
  this: typeof Base,
  values: Record<string, unknown>,
  constraints: Record<string, unknown>,
): Promise<number> {
  const arelTable: ArelTable = this.arelTable;
  const wheres = Object.entries(constraints).map(([name, value]) =>
    this.predicateBuilder.get(name, value),
  );

  const defaultConstraint = buildDefaultConstraint.call(this);
  if (defaultConstraint != null) wheres.push(defaultConstraint as Nodes.Node);

  const currentScope = this.globalCurrentScope();
  if (currentScope) {
    wheres.push(currentScope.whereClause.ast);
  }

  const um = new UpdateManager(arelTable);
  um.set(transformKeys(values, (name) => arelTable.get(name)));
  um.wheres = wheres;

  return this.withConnection((c) => c.update(um, `${this.name} Update`));
}

export async function _deleteRecord(
  this: typeof Base,
  constraints: Record<string, unknown>,
): Promise<number> {
  const wheres = Object.entries(constraints).map(([name, value]) =>
    this.predicateBuilder.get(name, value),
  );

  const defaultConstraint = buildDefaultConstraint.call(this);
  if (defaultConstraint != null) wheres.push(defaultConstraint as Nodes.Node);

  const currentScope = this.globalCurrentScope();
  if (currentScope) {
    wheres.push(currentScope.whereClause.ast);
  }

  const dm = new DeleteManager(this.arelTable);
  dm.wheres = wheres;

  return this.withConnection((c) => c.delete(dm, `${this.name} Destroy`));
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
  get(attrName: string): unknown;
  set(attrName: string, value: unknown): void;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  attributeWriterMissing(name: string, value: unknown): void;
}

type TouchOption = boolean | string | string[];

interface CounterBangRecord extends AttributeIO {
  id: unknown;
  constructor: {
    updateCounters(id: unknown, counters: CounterCacheCounters): Promise<number>;
  };
}

interface ToggleBangRecord extends AttributeIO {
  updateAttribute(name: string, value: unknown): Promise<boolean | undefined>;
}

export function increment<T extends AttributeIO>(this: T, attribute: string, by: number = 1): T {
  if (!rtest(this.get(attribute))) this.set(attribute, 0);
  this.set(attribute, (this.get(attribute) as number) + by);
  return this;
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
    throw new ArgumentError("wrong number of arguments (given 0, expected 1..3)");
  }
  this.increment(attribute, by);
  const inDatabase = rbFPublicSend(this, `${attribute}InDatabase`);
  const change =
    (rbFPublicSend(this, attribute) as number) - (rtest(inDatabase) ? (inDatabase as number) : 0);
  await this.constructor.updateCounters(this.id, { [attribute]: change, touch: options.touch });
  rbFPublicSend(this, `clear${attribute.charAt(0).toUpperCase()}${attribute.slice(1)}Change`);
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

/** @missingRailsCall assign_attributes — CONVERGEABLE update-must-call-assign-attributes-carried-from-0087 */
export async function update(
  this: Base,
  attributes: Record<string, unknown> | PermittedAttributes,
): Promise<boolean | undefined> {
  return withTransactionReturningStatus.call(this, async () => {
    await this.setAttributes(attributes);
    return this.save();
  }) as Promise<boolean | undefined>;
}

/** @missingRailsCall assign_attributes — CONVERGEABLE update-must-call-assign-attributes-carried-from-0087 */
export async function updateBang(
  this: Base,
  attributes: Record<string, unknown> | PermittedAttributes,
): Promise<true | undefined> {
  return withTransactionReturningStatus.call(this, async () => {
    await this.setAttributes(attributes);
    return this.saveBang();
  }) as Promise<true | undefined>;
}

async function deleteRow<T extends Base>(this: T): Promise<T> {
  if (this.isPersisted()) await _deleteRow.call(this);
  this._destroyed = true;
  this._previouslyNewRecord = false;
  this.freeze();
  return this;
}

export { deleteRow as delete };

export async function save(
  this: Base,
  options?: { validate?: boolean; touch?: boolean },
  block?: (record: any) => void,
): Promise<boolean> {
  try {
    return await this.createOrUpdate(options?.touch ?? true, block);
  } catch (e) {
    if (e instanceof RecordInvalid) return false;
    throw e;
  }
}

export async function saveBang(
  this: Base,
  options?: { validate?: boolean; touch?: boolean },
  block?: (record: any) => void,
): Promise<true> {
  if (!(await this.createOrUpdate(options?.touch ?? true, block))) {
    throw new RecordNotSaved("Failed to save the record", this);
  }
  return true;
}

export async function destroy<T extends Base>(this: T): Promise<T> {
  if (this.isReadonly()) this._raiseReadonlyRecordError();
  await this.destroyAssociations();
  this._triggerDestroyCallback ||= this.isPersisted() && (await this.destroyRow()) > 0;
  this._destroyed = true;
  this._previouslyNewRecord = false;
  return this.freeze();
}

export async function destroyBang<T extends Base>(this: T): Promise<T> {
  return (await this.destroy()) || this._raiseRecordNotDestroyed();
}

export async function updateAttribute(
  this: Base,
  name: string,
  value: unknown,
): Promise<boolean | undefined> {
  name = String(name);
  verifyReadonlyAttribute.call(this, name);
  (this as unknown as Record<string, unknown>)[name] = value;
  return this.save({ validate: false });
}

export async function updateAttributeBang(
  this: Base,
  name: string,
  value: unknown,
): Promise<true | undefined> {
  name = String(name);
  verifyReadonlyAttribute.call(this, name);
  (this as unknown as Record<string, unknown>)[name] = value;
  return this.saveBang({ validate: false });
}

interface UpdateColumnsRecord {
  isNewRecord(): boolean;
  isDestroyed(): boolean;
  isReadonly(): boolean;
  _raiseReadonlyRecordError(): never;
  verifyReadonlyAttribute(name: string): void;
  _queryConstraintsHash(): Record<string, unknown>;
  clearAttributeChange(name: string): void;
  _attributes: {
    writeCastValue(name: string, value: unknown): unknown;
  };
  constructor: {
    attributeAliases: Record<string, string>;
    _updateRecord(
      values: Record<string, unknown>,
      constraints: Record<string, unknown>,
    ): Promise<number>;
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
  attributes: Record<string, unknown> | Map<string, unknown>,
): Promise<boolean> {
  if (this.isNewRecord()) throw new ActiveRecordError("cannot update a new record");
  if (this.isDestroyed()) throw new ActiveRecordError("cannot update a destroyed record");
  if (this.isReadonly()) this._raiseReadonlyRecordError();

  attributes = transformKeys(attributes, (key) => {
    let name = String(key);
    name = this.constructor.attributeAliases[name] || name;
    this.verifyReadonlyAttribute(name);
    return name;
  });

  const updateConstraints = this._queryConstraintsHash();
  const h: Record<string, unknown> = {};
  eachPair(attributes, (k, v) => {
    h[k] = this._attributes.writeCastValue(k, v);
    this.clearAttributeChange(k);
  });
  attributes = h;

  const affectedRows = await this.constructor._updateRecord(attributes, updateConstraints);

  return affectedRows === 1;
}

interface ReloadRecord {
  _attributes: { keys(): Iterable<string> };
  _newRecord: boolean;
  _previouslyNewRecord: boolean;
  _associationCache: Map<string, { owner: unknown }>;
  isApplyScoping(options: object | null): unknown;
  _findRecord(options: object | null): Promise<unknown>;
  constructor: {
    prototype: object;
    connectionPool(): { clearQueryCache(): void };
    unscoped<R>(block: () => R | Promise<R>): Promise<R>;
  };
}

export async function reload<T extends ReloadRecord>(
  this: T,
  options: { lock?: boolean | string; unscoped?: boolean } | null = null,
): Promise<T> {
  this.constructor.connectionPool().clearQueryCache();

  const freshObject = (await (this.isApplyScoping(options)
    ? this._findRecord({ ...(options || {}), allQueries: true })
    : this.constructor.unscoped(() => this._findRecord(options)))) as ReloadRecord;

  this._associationCache = freshObject._associationCache;
  for (const association of this._associationCache.values()) association.owner = this;
  this._attributes = freshObject._attributes;
  if (Object.getPrototypeOf(this) !== this.constructor.prototype) {
    AttributeMethods.ClassMethods.undefineAttributeMethods.call(rbObjSingletonClass(this) as never);
  }
  for (const name of this._attributes.keys()) {
    if (!basicObjRespondTo(this, name, false)) {
      (rbObjSingletonClass(this) as unknown as typeof Base).defineAttributeMethod(name);
    }
  }
  this._newRecord = false;
  this._previouslyNewRecord = false;
  return this;
}

interface BecomesRecord {
  _attributes: { reverseMergeBang(target: unknown): unknown };
  _newRecord: boolean;
  _destroyed: boolean;
  _mutationsFromDatabase: unknown;
  errors: { copyBang(other: unknown): unknown };
}

/** @missingRailsName instanceVariableGet — PERMANENT */
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
  const hadOwn = Object.hasOwn(ctor, "_suppressStiNewDispatch");
  const prev = ctor._suppressStiNewDispatch;
  ctor._suppressStiNewDispatch = klass;
  const hadOwnAbstract = Object.hasOwn(ctor, "_suppressAbstractCheck");
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
      becoming.errors.copyBang(this.errors);
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
  const became = this.becomes(klass);
  let stiType: string | null = null;
  if (!klass.isDescendsFromActiveRecord()) {
    stiType = klass.stiName();
  }
  (became as unknown as Record<string, unknown>)[klass.inheritanceColumn!] = stiType;
  return became;
}

/** @internal */
export function initInternals(this: Base): void {
  rbCallSuper(this, initInternals);
  this._triggerDestroyCallback = this._triggerUpdateCallback = null;
  this._previouslyNewRecord = false;
}

/** @internal */
export function strictLoadedAssociations(this: Base): string[] {
  return [...(this._associationCache ?? [])]
    .filter(
      ([, assoc]) =>
        assoc?.owner?.isStrictLoading?.() && !assoc?.owner?.isStrictLoadingNPlusOneOnly?.(),
    )
    .map(([name]) => name);
}

/** @internal */
export function _findRecord(
  this: Base,
  options?: { lock?: boolean | string; allQueries?: boolean | null },
): Promise<unknown> {
  const ctor = this.constructor;
  const preloads = strictLoadedAssociations.call(this);
  let scope = ctor.all({ allQueries: options?.allQueries ?? null });
  if (preloads.length > 0) scope = scope.preload(...preloads);
  if (options?.lock) scope = scope.lock(options.lock);
  return scope.findByBang(this._inMemoryQueryConstraintsHash());
}

/** @internal */
export function _inMemoryQueryConstraintsHash(this: Base): Record<string, unknown> {
  if (queryConstraintsList.call(this.constructor) == null) {
    return { [this._primaryKey as string]: this.id };
  } else {
    return indexWith(queryConstraintsList.call(this.constructor)!, (columnName) =>
      this.attribute(columnName),
    );
  }
}

/** @internal */
export function isApplyScoping(this: Base, options?: { unscoped?: boolean } | null): unknown {
  return (
    !(options && options.unscoped) &&
    (isDefaultScopes.call(this.constructor, { allQueries: true }) ||
      this.constructor.globalCurrentScope())
  );
}

/** @internal */
export function _queryConstraintsHash(this: Base): Record<string, unknown> {
  if (queryConstraintsList.call(this.constructor) == null) {
    return { [this._primaryKey as string]: this.idInDatabase };
  } else {
    return indexWith(queryConstraintsList.call(this.constructor)!, (columnName) =>
      this.attributeInDatabase(columnName),
    );
  }
}

/** @internal */
export function destroyAssociations(this: Base): void {}

/** @internal */
export function destroyRow(this: Base): Promise<number> {
  return _deleteRow.call(this);
}

/** @internal */
export function _deleteRow(this: Base): Promise<number> {
  return this.constructor._deleteRecord(this._queryConstraintsHash());
}

export async function touch(this: Base, ...names: TouchArgs): Promise<boolean> {
  const { time = null } = extractOptionsBang(names as unknown[]) as TouchOptions;
  if (!this.isPersisted()) this._raiseRecordNotTouchedError();
  if (this.isReadonly()) this._raiseReadonlyRecordError();

  let attributeNames: readonly string[] = this.timestampAttributesForUpdateInModel();
  attributeNames = union(attributeNames, names as string[]).map((name) => {
    name = String(name);
    name = this.constructor.attributeAliases[name] || name;
    this.verifyReadonlyAttribute(name);
    return name;
  });

  if (attributeNames.length > 0) {
    const affectedRows = await this._touchRow(attributeNames, time);
    return (this._triggerUpdateCallback = affectedRows === 1);
  } else {
    return true;
  }
}

/** @internal */
export async function _touchRow(
  this: Base,
  attributeNames: readonly string[],
  time?: RubyTime | null,
): Promise<number> {
  time ||= await this.currentTimeFromProperTimezone();

  for (const attrName of attributeNames) {
    this._writeAttribute(attrName, time);
  }

  return this._updateRow(attributeNames, "touch");
}

/** @internal */
export function _updateRow(
  this: Base,
  attributeNames: readonly string[],
  _attemptedAction = "update",
): Promise<number> {
  return this.constructor._updateRecord(
    attributesWithValues.call(this, attributeNames),
    this._queryConstraintsHash(),
  );
}

/** @internal */
export async function createOrUpdate(this: Base, block?: (record: any) => void): Promise<boolean> {
  if (this.isReadonly()) this._raiseReadonlyRecordError();
  if (this.isDestroyed()) return false;
  const result = this.isNewRecord()
    ? await this._createRecord(undefined, block)
    : await this._updateRecord(undefined, block);
  return result !== false;
}

export const Persistence = {
  save,
  saveBang,
  destroy,
  touch,
  _queryConstraintsHash,
  destroyRow,
  _touchRow,
  _updateRow,
  createOrUpdate,
  /** @internal */
  _updateRecord: async function _updateRecord(
    this: Base,
    attributeNames?: string[],
    block?: (record: any) => void,
  ): Promise<number> {
    attributeNames = this.attributesForUpdate(attributeNames ?? this.attributeNames());

    let affectedRows: number;
    if (attributeNames.length === 0) {
      affectedRows = 0;
      this._triggerUpdateCallback = true;
    } else {
      affectedRows = await this._updateRow(attributeNames);
      this._triggerUpdateCallback = affectedRows === 1;
    }

    this._previouslyNewRecord = false;
    block?.(this);
    return affectedRows;
  },
  _createRecord,
  initInternals,
  incrementBang,
  reload,
};

/** @internal */
export async function _createRecord(
  this: Base,
  attributeNames: string[] = this.attributeNames(),
  block?: (record: any) => void,
): Promise<unknown> {
  attributeNames = this.attributesForCreate(attributeNames);

  await this.constructor.withConnection(async (connection: any) => {
    const returningColumns = await this.constructor._returningColumnsForInsert(connection);

    const returningValues = (await _insertRecord.call(
      this.constructor,
      connection,
      this.attributesWithValues(attributeNames),
      returningColumns,
    )) as unknown[] | null | undefined;

    if (returningValues != null) {
      for (const [column, value] of zip<string, unknown>(returningColumns, returningValues)) {
        if (!rtest(this._readAttribute(column as string))) {
          this._writeAttribute(
            column as string,
            this.typeForAttribute(column as string)!.deserialize(value),
          );
        }
      }
    }
  });

  this._newRecord = false;
  this._previouslyNewRecord = true;

  if (block) block(this);

  return this.id;
}

/** @internal */
export function verifyReadonlyAttribute(this: Base, name: string): void {
  if (this.constructor.isReadonlyAttribute(name)) {
    throw new ActiveRecordError(`${name} is marked as readonly`);
  }
}

/** @internal */
export function _raiseRecordNotDestroyed(this: Base): never {
  this._associationDestroyException ??= null;
  const key = this.constructor.primaryKey;
  try {
    throw (
      this._associationDestroyException ??
      new RecordNotDestroyed(
        `Failed to destroy ${this.constructor.name} with ${rbObjAsString(key)}=${rbObjAsString(this.id)}`,
        this,
      )
    );
  } finally {
    this._associationDestroyException = null;
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

/**
 * @internal
 * @inventedArm loop — PERMANENT
 * @inventedArm if — PERMANENT
 * @inventedArm keys — PERMANENT
 * @inventedArm basicObjRespondTo — PERMANENT
 * @inventedArm rbObjSingletonClass — PERMANENT
 * @inventedArm defineAttributeMethod — PERMANENT
 */
export function instantiateInstanceOf(
  this: PersistenceHost,
  klass: typeof Base,
  attributes: Record<string, unknown> | IndexedRow,
  columnTypes: Record<string, unknown> = {},
  block?: (r: any) => void,
): any {
  const names = keys(attributes as Record<string, unknown>);
  attributes = (klass as any).attributesBuilder().buildFromDatabase(attributes, columnTypes);
  const record = klass.allocate();
  for (const name of names) {
    if (!basicObjRespondTo(record, name, false)) {
      (rbObjSingletonClass(record) as unknown as typeof Base).defineAttributeMethod(name);
    }
  }
  return record.initWithAttributes(attributes, false, block);
}

/** @internal */
function discriminateClassForRecord<T>(klass: T, _record: Record<string, unknown> | IndexedRow): T {
  return klass;
}

/** @internal */
export function buildDefaultConstraint(this: typeof Base): unknown {
  if (!this.defaultScopes?.some((s) => s.allQueries)) return undefined;
  const defaultWhereClause = this.defaultScoped({ allQueries: true }).whereClause;
  return defaultWhereClause.isEmpty() ? undefined : defaultWhereClause.ast;
}
