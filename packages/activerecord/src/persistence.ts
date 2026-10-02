import { Time as RubyTime } from "@blazetrails/date";
import { type TouchArgs, type TouchOptions } from "./timestamp.js";
import { merge, rbEqual, rbObjAsString, rtest, union, zip } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type { CounterCacheCounters } from "./counter-cache.js";
import type { IndexedRow } from "./result.js";
import { ArgumentError, type PermittedAttributes } from "@blazetrails/activemodel";
import { extractOptionsBang, indexWith, transformKeys } from "@blazetrails/activesupport";
import {
  InsertManager,
  UpdateManager,
  DeleteManager,
  Table as ArelTable,
  Nodes,
} from "@blazetrails/arel";
import { ActiveRecordError, ReadOnlyRecord, RecordNotDestroyed, RecordNotSaved } from "./errors.js";
import { attributesForUpdate, attributesWithValues } from "./attribute-methods.js";
import { getStiBase, isStiSubclass } from "./inheritance.js";
import { withTransactionReturningStatus } from "./transactions.js";
import { registry } from "./suppressor.js";
import { isDefaultScopes } from "./scoping/default.js";
import {
  performValidations,
  raiseValidationError,
  RecordInvalid,
  type ValidationContextArg,
} from "./validations.js";

interface PersistenceHost {
  new (attrs?: Record<string, unknown>, block?: (record: any) => void): any;
  _instantiate(
    row: Record<string, unknown> | IndexedRow,
    block?: (record: any) => void,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): any;
  /** @internal */
  primaryKey: string | string[];
  _queryConstraintsList?: string[] | null;
  _hasQueryConstraints?: boolean;
  isBaseClass(): boolean;
  baseClass: PersistenceHost;
  ensureSchemaLoaded(): Promise<void>;
  /** @internal */
  discriminateClassForRecord(record: Record<string, unknown> | IndexedRow): typeof Base;
}

export async function create(
  this: PersistenceHost,
  attributes: Record<string, unknown> | Record<string, unknown>[] = {},
  block?: (record: any) => void | Promise<void>,
): Promise<any> {
  if (Array.isArray(attributes)) {
    const records: any[] = [];
    for (const attr of attributes) records.push(await (this as any).create(attr, block));
    return records;
  }
  await this.ensureSchemaLoaded();
  const mergedAttrs = (this as any)._mergeCurrentScopeAttrs(attributes);
  let yielded: unknown;
  const record = new this(
    mergedAttrs,
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
  this: PersistenceHost,
  attributes: Record<string, unknown> | Record<string, unknown>[] = {},
  block?: (record: any) => void | Promise<void>,
): Promise<any> {
  if (Array.isArray(attributes)) {
    const records: any[] = [];
    for (const attr of attributes) records.push(await (this as any).createBang(attr, block));
    return records;
  }
  await this.ensureSchemaLoaded();
  const mergedAttrs = (this as any)._mergeCurrentScopeAttrs(attributes);
  let yielded: unknown;
  const record = new this(
    mergedAttrs,
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
  return instantiateInstanceOf(klass, attributes, columnTypes, block);
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
  this: PersistenceHost,
  connection: {
    insert(arel: unknown, ...args: unknown[]): Promise<unknown>;
    emptyInsertStatementValue(pk?: string | null): string;
  },
  values: Record<string, unknown>,
  returning?: string[] | null,
): Promise<unknown> {
  const ctor = this as any;
  const primaryKey = ctor.primaryKey;
  let primaryKeyValue: unknown = null;
  if (ctor.isPrefetchPrimaryKey() && primaryKey) {
    if (!rtest(values[primaryKey])) {
      values[primaryKey] = (() => {
        primaryKeyValue = ctor.nextSequenceValue();
        return ctor._defaultAttributes().getAttribute(primaryKey).withCastValue(primaryKeyValue);
      })();
    }
  }

  const arelTable: ArelTable = ctor.arelTable;
  const im = new InsertManager(arelTable);

  const entries = Object.entries(values);
  if (entries.length === 0) {
    im.insert(connection.emptyInsertStatementValue(primaryKey));
  } else {
    im.insert(entries.map(([col, val]) => [arelTable.get(col), val]));
  }

  return connection.insert(
    im,
    `${ctor.name} Create`,
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
  this: PersistenceHost,
  values: Record<string, unknown>,
  constraints: Record<string, unknown>,
): Promise<number> {
  const klass = this as unknown as typeof Base;
  const arelTable: ArelTable = klass.arelTable;
  const wheres = Object.entries(constraints).map(([name, value]) =>
    klass.predicateBuilder.get(name, value),
  );

  const defaultConstraint = buildDefaultConstraint.call(klass as any);
  if (defaultConstraint != null) wheres.push(defaultConstraint as Nodes.Node);

  const currentScope = klass.globalCurrentScope();
  if (currentScope) {
    wheres.push(currentScope.whereClause.ast);
  }

  const um = new UpdateManager(arelTable);
  um.set(Object.entries(values).map(([name, value]) => [arelTable.get(name), value]));
  um.wheres = wheres;

  return klass.withConnection((c) => c.update(um, `${klass.name} Update`));
}

export async function _deleteRecord(
  this: PersistenceHost,
  constraints: Record<string, unknown>,
): Promise<number> {
  const klass = this as unknown as typeof Base;
  const wheres = Object.entries(constraints).map(([name, value]) =>
    klass.predicateBuilder.get(name, value),
  );

  const defaultConstraint = buildDefaultConstraint.call(klass as any);
  if (defaultConstraint != null) wheres.push(defaultConstraint as Nodes.Node);

  const currentScope = klass.globalCurrentScope();
  if (currentScope) {
    wheres.push(currentScope.whereClause.ast);
  }

  const dm = new DeleteManager(klass.arelTable);
  dm.wheres = wheres;

  return klass.withConnection((c) => c.delete(dm, `${klass.name} Destroy`));
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
    throw new ArgumentError("wrong number of arguments (given 0, expected 1..3)");
  }
  attribute = resolveAttributeAlias(this, attribute);
  this.increment(attribute, by);
  const change =
    Number(this.readAttribute(attribute)) - (Number(this.attributeInDatabase(attribute)) || 0);
  await this.constructor.updateCounters(this.id, { [attribute]: change, touch: options.touch });
  this.clearAttributeChange(attribute);
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

/** @missingRailsCall assign_attributes — CONVERGEABLE update-must-call-assign-attributes-carried-from-0087 */
export async function update<T extends UpdateRecord>(
  this: T,
  attributes: Record<string, unknown> | PermittedAttributes,
): Promise<boolean | undefined> {
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    await self.setAttributes(attributes);
    return self.save() as Promise<boolean | undefined>;
  }) as Promise<boolean | undefined>;
}

/** @missingRailsCall assign_attributes — CONVERGEABLE update-must-call-assign-attributes-carried-from-0087 */
export async function updateBang<T extends UpdateRecord>(
  this: T,
  attributes: Record<string, unknown> | PermittedAttributes,
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

async function deleteRow<T extends DeleteRecord>(this: T): Promise<T> {
  if (this.isPersisted()) await _deleteRow.call(this as any);
  this._destroyed = true;
  this._previouslyNewRecord = false;
  this.freeze();
  return this;
}

export { deleteRow as delete };

interface SaveRecord {
  _destroyed: boolean;
  _readonly: boolean;
  _newRecord: boolean;
  _attributes: { writeCastValue(key: string, val: unknown): void };
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  errors: { isAny(): boolean; isEmpty(): boolean };
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
  if (registry()[(this.constructor as { name: string }).name]) {
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
    if ((this as unknown as { errors: { isAny(): boolean } }).errors.isAny()) {
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

interface AttributeSingleSave {
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
  (this as unknown as Record<string, unknown>)[name] = value;
  return this.save({ validate: false });
}

export async function updateAttributeBang<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<true | undefined> {
  name = String(name);
  verifyReadonlyAttribute.call(this as unknown as PersistencePrivateHost, name);
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
  attributes: Record<string, unknown>,
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
  for (const [k, v] of Object.entries(attributes)) {
    h[k] = this._attributes.writeCastValue(k, v);
    this.clearAttributeChange(k);
  }
  attributes = h;

  const affectedRows = await this.constructor._updateRecord(attributes, updateConstraints);

  return affectedRows === 1;
}

interface ReloadRecord {
  _attributes: unknown;
  _newRecord: boolean;
  _previouslyNewRecord: boolean;
  _associationCache: Map<string, { owner: unknown }>;
  isApplyScoping(options: object | null): unknown;
  _findRecord(options: object | null): Promise<unknown>;
  constructor: {
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
    ? this._findRecord(merge(options || {}, { allQueries: true }))
    : this.constructor.unscoped(() => this._findRecord(options)))) as ReloadRecord;

  this._associationCache = freshObject._associationCache;
  for (const association of this._associationCache.values()) association.owner = this;
  this._attributes = freshObject._attributes;
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

interface PersistencePrivateHost {
  _newRecord: boolean;
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
  _readonly?: boolean;
  attribute(attrName: string): unknown;
  _inMemoryQueryConstraintsHash(): Record<string, unknown>;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  isNewRecord(): boolean;
  isDestroyed(): boolean;
  id: unknown;
  idInDatabase: unknown;
  attributeInDatabase(col: string): unknown;
  _primaryKey?: string | string[] | null;
  _associationCache?: Map<
    string,
    { owner?: { isStrictLoading?(): boolean; isStrictLoadingNPlusOneOnly?(): boolean } } | null
  >;
  constructor: {
    name: string;
    primaryKey: string | string[];
    currentScope?: unknown | (() => unknown);
    defaultScoped(): { whereClause: { isEmpty(): boolean; ast: unknown } };
    isReadonlyAttribute?(name: string): boolean;
    withConnection?(fn: (conn: unknown) => Promise<void>): Promise<void>;
    connection: { delete(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number> };
  };
}

type PersistenceInternalHost = PersistencePrivateHost & {
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, val: unknown): void;
  _triggerUpdateCallback?: boolean | null;
  _attributes?: { keys?(): Iterable<string> };
  currentTimeFromProperTimezone(): RubyTime;
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
  typeForAttribute(name: string): { deserialize(value: unknown): unknown };
  attributesForCreate(attributeNames: string[]): string[];
  attributesWithValues(attributeNames: string[]): Record<string, unknown>;
};

/** @internal */
export function initInternals(this: PersistencePrivateHost, super_: () => void): void {
  super_();
  (this as any)._triggerDestroyCallback = (this as any)._triggerUpdateCallback = null;
  this._previouslyNewRecord = false;
}

/** @internal */
export function strictLoadedAssociations(this: PersistencePrivateHost): string[] {
  return [...(this._associationCache ?? [])]
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
  return scope.findByBang(this._inMemoryQueryConstraintsHash());
}

/** @internal */
export function _inMemoryQueryConstraintsHash(
  this: PersistencePrivateHost,
): Record<string, unknown> {
  const constraintsList = queryConstraintsList.call(this.constructor as any);
  if (!constraintsList) {
    const pk = this.constructor.primaryKey as string;
    return { [pk]: this.id };
  }
  return Object.fromEntries(
    constraintsList.map((columnName) => [columnName, this.attribute(columnName)]),
  );
}

/** @internal */
export function isApplyScoping(
  this: PersistencePrivateHost,
  options?: { unscoped?: boolean } | null,
): unknown {
  return (
    !(options && options.unscoped) &&
    (isDefaultScopes.call(this.constructor as any, { allQueries: true }) ||
      (this.constructor as any).globalCurrentScope())
  );
}

/** @internal */
export function _queryConstraintsHash(this: PersistencePrivateHost): Record<string, unknown> {
  if (queryConstraintsList.call(this.constructor as any) == null) {
    return { [this._primaryKey as string]: this.idInDatabase };
  } else {
    return Object.fromEntries(
      indexWith(queryConstraintsList.call(this.constructor as any)!, (columnName) =>
        this.attributeInDatabase(columnName),
      ),
    );
  }
}

/** @internal */
export function destroyAssociations(this: PersistencePrivateHost): void {}

/** @internal */
export function destroyRow(this: PersistencePrivateHost): Promise<number> {
  return _deleteRow.call(this);
}

/** @internal */
export function _deleteRow(this: PersistencePrivateHost): Promise<number> {
  return (this.constructor as any)._deleteRecord((this as any)._queryConstraintsHash());
}

export async function touch(this: Base, ...names: TouchArgs): Promise<boolean> {
  const { time = null } = extractOptionsBang(names as unknown[]) as TouchOptions;
  if (!this.isPersisted()) (this as any)._raiseRecordNotTouchedError();
  if (this.isReadonly()) (this as any)._raiseReadonlyRecordError();

  let attributeNames: string[] = (this as any).timestampAttributesForUpdateInModel();
  attributeNames = union(attributeNames, names as string[]).map((name) => {
    name = String(name);
    name = (this.constructor as typeof Base).attributeAliases[name] || name;
    (this as any).verifyReadonlyAttribute(name);
    return name;
  });

  if (attributeNames.length > 0) {
    const affectedRows = await (this as any)._touchRow(attributeNames, time);
    return ((this as any)._triggerUpdateCallback = affectedRows === 1);
  } else {
    return true;
  }
}

/** @internal */
export function _touchRow(
  this: PersistenceInternalHost,
  attributeNames: string[],
  time?: RubyTime | null,
): Promise<number> {
  time ||= this.currentTimeFromProperTimezone();

  for (const attrName of attributeNames) {
    this._writeAttribute(attrName, time);
  }

  return (this as any)._updateRow(attributeNames, "touch");
}

/** @internal */
export function _updateRow(
  this: PersistencePrivateHost,
  attributeNames: string[],
  _attemptedAction = "update",
): Promise<number> {
  return (this.constructor as any)._updateRecord(
    attributesWithValues.call(this as any, attributeNames),
    (this as any)._queryConstraintsHash(),
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
            this.typeForAttribute(column as string).deserialize(value),
          );
        }
      }
    }
  });

  this._newRecord = false;
  this._previouslyNewRecord = true;

  if (block) block(this);

  return (this as any).id;
}

/** @internal */
export function verifyReadonlyAttribute(this: PersistencePrivateHost, name: string): void {
  if ((this.constructor as any).isReadonlyAttribute(name)) {
    throw new ActiveRecordError(`${name} is marked as readonly`);
  }
}

/** @internal */
export function _raiseRecordNotDestroyed(this: PersistencePrivateHost): never {
  (this as any)._associationDestroyException ??= null;
  const key = this.constructor.primaryKey;
  try {
    throw (
      (this as any)._associationDestroyException ??
      new RecordNotDestroyed(
        `Failed to destroy ${this.constructor.name} with ${rbObjAsString(key)}=${rbObjAsString(this.id)}`,
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
      attrs: Record<string, unknown> | IndexedRow,
      block?: (r: any) => void,
      columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    ): any;
  },
  attributes: Record<string, unknown> | IndexedRow,
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
function discriminateClassForRecord<T>(klass: T, _record: Record<string, unknown> | IndexedRow): T {
  return klass;
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

/** @noRailsEquivalent CONVERGEABLE comparator-reads-a-module-named-const-as-the-instance-seat */
export const InstanceMethods = {
  _updateRecord: instanceUpdateRecord,
};
