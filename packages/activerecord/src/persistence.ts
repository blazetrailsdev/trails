/**
 * Persistence — class methods for creating, instantiating, and
 * configuring query constraints on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods
 */

import {
  InsertManager,
  UpdateManager,
  DeleteManager,
  Table as ArelTable,
  star as arelStar,
} from "@blazetrails/arel";
import {
  AttributeAssignmentError,
  ReadOnlyRecord,
  RecordNotDestroyed,
  RecordNotFound,
  RecordNotSaved,
  UnknownAttributeError,
} from "./errors.js";
import { clearAutosaveState } from "./autosave-association.js";
import { getStiBase, getInheritanceColumn, isStiSubclass } from "./inheritance.js";
import { withTransactionReturningStatus } from "./transactions.js";
import { RecordInvalid, performValidations } from "./validations.js";

interface PersistenceHost {
  new (attrs?: Record<string, unknown>): any;
  _instantiate(row: Record<string, unknown>, columnTypes?: Record<string, any>): any;
  discriminateClassForRecord?(attributes: Record<string, unknown>): PersistenceHost;
  primaryKey: string | string[];
  _queryConstraintsList?: string[] | null;
  _hasQueryConstraints?: boolean;
  _isBaseClass?: boolean;
}

/**
 * Build a new instance (or array of instances) without saving.
 * Mirrors: ActiveRecord::Persistence::ClassMethods#build
 */
export function build(
  this: PersistenceHost,
  attrs?: Record<string, unknown> | Record<string, unknown>[],
  block?: (record: any) => void,
): any {
  if (Array.isArray(attrs)) {
    return attrs.map((a) => build.call(this, a, block));
  }
  const record = new this(attrs ?? {});
  if (block) block(record);
  return record;
}

/**
 * Instantiate a record from database attributes, dispatching through
 * STI if applicable.
 * Mirrors: ActiveRecord::Persistence::ClassMethods#instantiate
 */
export function instantiate(
  this: PersistenceHost,
  attributes: Record<string, unknown>,
  columnTypes: Record<string, any> = {},
  block?: (record: any) => void,
): any {
  // Rails: klass = discriminate_class_for_record(attributes)
  //        instantiate_instance_of(klass, attributes, column_types, &block)
  const klass = this.discriminateClassForRecord
    ? this.discriminateClassForRecord(attributes)
    : this;
  const record = klass._instantiate(attributes, columnTypes);
  if (block) block(record);
  return record;
}

/**
 * Mirrors: ActiveRecord::Persistence::ClassMethods#query_constraints
 */
export function queryConstraints(this: PersistenceHost, ...columns: string[]): void {
  if (columns.length === 0) {
    throw new Error("You must specify at least one column to be used in querying");
  }
  this._queryConstraintsList = columns.map(String);
  this._hasQueryConstraints = true;
}

/**
 * Mirrors: ActiveRecord::Persistence::ClassMethods#has_query_constraints?
 */
export function hasQueryConstraints(this: PersistenceHost): boolean {
  return !!this._hasQueryConstraints;
}

/**
 * Returns the list of query constraint columns, falling back to the
 * base class's list or the composite primary key.
 * Mirrors: ActiveRecord::Persistence::ClassMethods#query_constraints_list
 */
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

/**
 * Mirrors: ActiveRecord::Persistence::ClassMethods#composite_query_constraints_list
 */
export function compositeQueryConstraintsList(this: PersistenceHost): string[] {
  const list = queryConstraintsList.call(this);
  if (list) return list;
  const pk = this.primaryKey;
  return Array.isArray(pk) ? pk : [pk];
}

/**
 * Builds and executes an INSERT for the given values.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods#_insert_record
 */
export async function _insertRecord(
  this: PersistenceHost,
  connection: {
    insert?(arel: unknown, ...args: unknown[]): Promise<unknown>;
    executeMutation?(sql: string, binds?: unknown[]): Promise<number>;
    toSql?(arel: unknown): string;
    emptyInsertStatementValue?(): string;
  },
  values: Record<string, unknown>,
): Promise<number> {
  const table: ArelTable = (this as any).arelTable;
  const im = new InsertManager(table);

  const entries = Object.entries(values);
  if (entries.length > 0) {
    im.insert(entries.map(([col, val]) => [table.get(col), val]));
  }

  if (typeof connection.insert === "function") {
    const result = await connection.insert(im);
    return typeof result === "number" ? result : 0;
  }

  // Fallback for simple adapters without insert()
  const sql = connection.toSql ? connection.toSql(im) : im.toSql();
  const finalSql =
    entries.length > 0
      ? sql
      : `${sql} ${connection.emptyInsertStatementValue?.() ?? "DEFAULT VALUES"}`;
  return connection.executeMutation!(finalSql);
}

/**
 * Builds and executes an UPDATE with the given values and constraints.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods#_update_record
 */
export async function _updateRecord(
  this: PersistenceHost,
  values: Record<string, unknown>,
  constraints: Record<string, unknown>,
): Promise<number> {
  const setEntries = Object.entries(values);
  if (setEntries.length === 0) return 0;

  const table: ArelTable = (this as any).arelTable;
  const um = new UpdateManager();
  um.table(table);
  um.set(setEntries.map(([col, val]) => [table.get(col), val]));

  for (const [col, val] of Object.entries(constraints)) {
    um.where(table.get(col).eq(val));
  }

  const adapter = (this as any).adapter;
  if (typeof adapter.update === "function") {
    return adapter.update(um);
  }
  const sql = adapter.toSql ? adapter.toSql(um) : um.toSql();
  return adapter.executeMutation(sql);
}

/**
 * Builds and executes a DELETE with the given constraints.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods#_delete_record
 */
export async function _deleteRecord(
  this: PersistenceHost,
  constraints: Record<string, unknown>,
): Promise<number> {
  const table: ArelTable = (this as any).arelTable;
  const dm = new DeleteManager();
  dm.from(table);

  for (const [col, val] of Object.entries(constraints)) {
    dm.where(table.get(col).eq(val));
  }

  const adapter = (this as any).adapter;
  if (typeof adapter.delete === "function") {
    return adapter.delete(dm);
  }
  const sql = adapter.toSql ? adapter.toSql(dm) : dm.toSql();
  return adapter.executeMutation(sql);
}

// ---------------------------------------------------------------------------
// Instance predicates — Rails' ActiveRecord::Persistence module.
// These live alongside `destroy` / `save` in Rails' persistence.rb; here
// they're module-level functions mixed into Base via include() so the
// implementation file matches Rails' source location.
// ---------------------------------------------------------------------------

interface PersistenceRecordFields {
  _newRecord: boolean;
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
}

interface PersistenceRecordDispatch {
  isNewRecord(): boolean;
  isDestroyed(): boolean;
}

/** Mirrors: ActiveRecord::Persistence#new_record? — `@new_record` */
export function isNewRecord(this: PersistenceRecordFields): boolean {
  return this._newRecord;
}

/**
 * Mirrors: ActiveRecord::Persistence#persisted? — `!(@new_record || @destroyed)`.
 * Rails reads the ivars directly, so subclasses overriding `new_record?` /
 * `destroyed?` don't change `persisted?`.
 */
export function isPersisted(this: PersistenceRecordFields): boolean {
  return !this._newRecord && !this._destroyed;
}

/** Mirrors: ActiveRecord::Persistence#destroyed? — `@destroyed` */
export function isDestroyed(this: PersistenceRecordFields): boolean {
  return this._destroyed;
}

/** Mirrors: ActiveRecord::Persistence#previously_new_record? — `@previously_new_record` */
export function isPreviouslyNewRecord(this: PersistenceRecordFields): boolean {
  return this._previouslyNewRecord;
}

/**
 * Mirrors: ActiveRecord::Persistence#previously_persisted? — `!new_record? && destroyed?`.
 * Rails dispatches through `self` here, so subclass overrides of
 * `new_record?` / `destroyed?` do affect this predicate.
 */
export function isPreviouslyPersisted(this: PersistenceRecordDispatch): boolean {
  return !this.isNewRecord() && this.isDestroyed();
}

// ---------------------------------------------------------------------------
// Increment / decrement / toggle — ActiveRecord::Persistence#increment /
// #decrement / #toggle and their bang counterparts. The plain forms mutate
// in memory; the bang forms dispatch through `this`. `increment!` and
// `decrement!` persist via `constructor.updateCounters(...)` (atomic UPDATE,
// skipping validations and model callbacks); `toggle!` persists via
// `save({ validate: false })` (skipping validations but still running
// callbacks), matching Rails' `toggle.update_attribute(...)` chain.
// ---------------------------------------------------------------------------

/** Read/write contract used by every increment/decrement/toggle function. */
interface AttributeIO {
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
}

type TouchOption = boolean | string | string[];

/** Class-level updateCounters + dirty-tracking needed by incrementBang. */
interface CounterBangRecord extends AttributeIO {
  id: unknown;
  clearAttributeChanges(attributes: string[]): void;
  constructor: {
    updateCounters(
      id: unknown,
      counters: Record<string, number>,
      options?: { touch?: TouchOption },
    ): Promise<number>;
  };
}

/** Save path used by toggleBang. */
interface ToggleBangRecord extends AttributeIO {
  save(options?: { validate?: boolean }): Promise<boolean>;
}

/** Mirrors: ActiveRecord::Persistence#increment */
export function increment<T extends AttributeIO>(this: T, attribute: string, by: number = 1): T {
  const current = Number(this.readAttribute(attribute)) || 0;
  this.writeAttribute(attribute, current + by);
  return this;
}

/**
 * Mirrors: ActiveRecord::Persistence#decrement — `increment(attribute, -by)`.
 * Dispatched through `this` so subclass overrides of `increment` flow into
 * `decrement`.
 */
export function decrement<T extends AttributeIO & { increment(a: string, b?: number): T }>(
  this: T,
  attribute: string,
  by: number = 1,
): T {
  return this.increment(attribute, -by);
}

/** Mirrors: ActiveRecord::Persistence#toggle */
export function toggle<T extends AttributeIO>(this: T, attribute: string): T {
  this.writeAttribute(attribute, !this.readAttribute(attribute));
  return this;
}

/**
 * Mirrors: ActiveRecord::Persistence#increment! — dispatches `increment`
 * through `this`, then emits an atomic `UPDATE ... SET attr = attr + by`
 * via Class.updateCounters so concurrent increments don't stomp each
 * other. Validations and callbacks are skipped. Accepts Rails' `touch`
 * option (updates the named timestamp(s) in the same statement).
 */
export async function incrementBang<T extends CounterBangRecord>(
  this: T & { increment(attribute: string, by?: number): T },
  attribute: string,
  by: number = 1,
  options: { touch?: TouchOption } = {},
) {
  this.increment(attribute, by);
  await this.constructor.updateCounters(this.id, { [attribute]: by }, { touch: options.touch });
  // Rails: `public_send(:"clear_#{attribute}_change")` — the in-memory
  // increment is now durably persisted, so the attribute should no longer
  // appear dirty (otherwise a later save() would re-persist it).
  this.clearAttributeChanges([attribute]);
  return this;
}

/**
 * Mirrors: ActiveRecord::Persistence#decrement! —
 * `increment!(attribute, -by, touch: touch)`. Dispatched through `this` so
 * subclass overrides of `incrementBang` flow into `decrementBang`.
 */
export async function decrementBang<
  T extends CounterBangRecord & {
    incrementBang(a: string, b?: number, o?: { touch?: TouchOption }): Promise<T>;
  },
>(this: T, attribute: string, by: number = 1, options: { touch?: TouchOption } = {}): Promise<T> {
  return this.incrementBang(attribute, -by, options);
}

/**
 * Mirrors: ActiveRecord::Persistence#toggle! —
 * `toggle(attribute).update_attribute(attribute, self[attribute])`.
 * Unlike `increment!` / `decrement!`, Rails' `toggle!` goes through
 * `update_attribute` which runs callbacks (but still skips validations).
 */
export async function toggleBang<T extends ToggleBangRecord>(
  this: T & { toggle(attribute: string): T },
  attribute: string,
): Promise<boolean> {
  this.toggle(attribute);
  // Rails' `update_attribute(name, value)` is effectively `self[name] = value;
  // save(validate: false)`. Our toggle() already wrote the toggled value;
  // calling updateAttribute would re-write the same value (potentially
  // clearing dirty tracking). Save directly to preserve the dirty change and
  // still run callbacks. Returns the same boolean Rails' toggle! exposes
  // through update_attribute — `false` when a before/around save callback
  // aborted, `true` otherwise.
  return this.save({ validate: false });
}

// ---------------------------------------------------------------------------
// update / update! / delete — instance mutators.
//   update / update!  → write attrs, delegate to save / save!
//   delete            → callback-free DELETE + mark destroyed/frozen
// Mirrors ActiveRecord::Persistence#update, #update!, #delete.
// ---------------------------------------------------------------------------

interface UpdateRecord extends AttributeIO {
  constructor: {
    lockingColumn: string;
    lockingEnabled: boolean;
  };
  save(options?: { validate?: boolean }): Promise<boolean>;
  saveBang(options?: { validate?: boolean }): Promise<true>;
}

function assertLockingColumnNotExplicitly(
  record: UpdateRecord,
  attrs: Record<string, unknown>,
): void {
  const ctor = record.constructor;
  const lockCol = ctor.lockingColumn;
  if (Object.hasOwn(attrs, lockCol) && ctor.lockingEnabled) {
    throw new Error(`${lockCol} cannot be updated explicitly`);
  }
}

/**
 * Mirrors: ActiveRecord::Persistence#update — assign + save. Returns the
 * boolean from save so callers can detect validation / callback aborts
 * without catching exceptions.
 *
 * Note: Rails wraps this in `with_transaction_returning_status` so DB
 * side-effects of the assignment (e.g. nested-attributes creating child
 * records) roll back with the save. We don't yet — our callback
 * infrastructure fires after_commit twice when inner + outer transactions
 * both complete. Tracked as a separate fidelity fix; preserve the
 * pre-extraction behavior here.
 */
export async function update<T extends UpdateRecord>(
  this: T,
  attrs: Record<string, unknown>,
): Promise<boolean> {
  assertLockingColumnNotExplicitly(this, attrs);
  // Rails' #update delegates to `assign_attributes`, which iterates setters
  // and lets their exceptions propagate raw. Our Base#assignAttributes wraps
  // every writeAttribute failure in AttributeAssignmentError — more aggressive
  // than Rails. Use a raw writeAttribute loop here to preserve original error
  // classes (pre-extraction behavior; closer to Rails than wrapping).
  for (const [key, value] of Object.entries(attrs)) {
    this.writeAttribute(key, value);
  }
  return this.save();
}

/**
 * Mirrors: ActiveRecord::Persistence#update! — assign + save!. Raises
 * `RecordInvalid` on validation failure.
 */
export async function updateBang<T extends UpdateRecord>(
  this: T,
  attrs: Record<string, unknown>,
): Promise<true> {
  assertLockingColumnNotExplicitly(this, attrs);
  // See update(): raw loop preserves original error classes (matches Rails,
  // avoids Base#assignAttributes's AttributeAssignmentError wrap).
  for (const [key, value] of Object.entries(attrs)) {
    this.writeAttribute(key, value);
  }
  return this.saveBang();
}

interface DeleteRecord {
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
  id: unknown;
  isPersisted(): boolean;
  freeze(): unknown;
  constructor: {
    arelTable: InstanceType<typeof ArelTable>;
    _buildPkWhereNode(id: unknown): Parameters<DeleteManager["where"]>[0];
    adapter: { execDelete(sql: string, name: string): Promise<number> };
  };
}

/**
 * Rails emits a DELETE only for persisted records, then unconditionally
 * marks the instance destroyed + frozen and clears the new-record flag.
 * No callbacks, no validations.
 *
 * Mirrors: ActiveRecord::Persistence#delete
 */
export async function deleteRow<T extends DeleteRecord>(this: T): Promise<T> {
  const ctor = this.constructor;
  if (this.isPersisted()) {
    const dm = new DeleteManager().from(ctor.arelTable).where(ctor._buildPkWhereNode(this.id));
    await ctor.adapter.execDelete(dm.toSql(), "Delete");
  }
  this._destroyed = true;
  this._previouslyNewRecord = false;
  this.freeze();
  return this;
}

// ---------------------------------------------------------------------------
// save / save! / destroy / destroy! — the callback- and transaction-wrapped
// entry points. They rely on Base-provided internal helpers/state
// (_createOrUpdate, _destroyRow, _performInsert, _performUpdate,
// _skipTouch, _pendingOperation) which remain `private` on Base; the
// extracted functions reach them through `(this as any)` since those
// members intentionally aren't part of the public Persistence API.
// Mirrors ActiveRecord::Persistence#save, #save!, #destroy, #destroy!
// (merged with Transactions#save / #destroy and Validations#save which, in
// Rails, override the same method through module layering).
// ---------------------------------------------------------------------------

interface SaveRecord {
  _destroyed: boolean;
  _readonly: boolean;
  _newRecord: boolean;
  _attributes: { set(key: string, val: unknown): void };
  readAttribute(name: string): unknown;
  constructor: {
    name: string;
    _attributeDefinitions: Map<string, unknown>;
  };
}

/**
 * Mirrors: ActiveRecord::Base#save — runs validations, opens a
 * transaction-returning-status, and delegates the insert/update to
 * `_createOrUpdate` (Rails' Persistence#save super).
 */
export async function save<T extends SaveRecord>(
  this: T,
  options?: { validate?: boolean; touch?: boolean },
): Promise<boolean> {
  if (this._destroyed) {
    throw new RecordNotSaved(
      `Cannot save a destroyed ${this.constructor.name}`,
      this as unknown as object,
    );
  }
  if (this._readonly) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }
  if (!performValidations.call(this, options)) return false;
  const self = this as any;
  if (options?.validate !== false) {
    if (!(await self._runAsyncValidations())) return false;
  }

  self._skipTouch = options?.touch === false;
  const ctor = this.constructor as unknown as Parameters<typeof isStiSubclass>[0];

  // Auto-set STI type column on new records
  if (this._newRecord && isStiSubclass(ctor)) {
    const col = getInheritanceColumn(getStiBase(ctor));
    if (col && !this.readAttribute(col)) {
      this._attributes.set(col, this.constructor.name);
    }
  }

  // Mirrors: ActiveRecord::Transactions#save
  try {
    return await withTransactionReturningStatus(self, () => self._createOrUpdate());
  } finally {
    self._skipTouch = false;
  }
}

/** Mirrors: ActiveRecord::Base#save! */
export async function saveBang<
  T extends SaveRecord & { save(o?: { validate?: boolean; touch?: boolean }): Promise<boolean> },
>(this: T): Promise<true> {
  const result = await this.save();
  if (!result) {
    throw new RecordInvalid(this as unknown as object);
  }
  return true;
}

interface DestroyRecord {
  _readonly: boolean;
  constructor: { name: string };
}

/** Mirrors: ActiveRecord::Base#destroy */
export async function destroy<T extends DestroyRecord>(this: T): Promise<T | false> {
  if (this._readonly) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }

  // Mirrors: ActiveRecord::Transactions#destroy
  const self = this as any;
  const result = await withTransactionReturningStatus(self, () => self._destroyRow());
  return result ? this : false;
}

/** Mirrors: ActiveRecord::Base#destroy! */
export async function destroyBang<T extends DestroyRecord & { destroy(): Promise<T | false> }>(
  this: T,
): Promise<T> {
  const result = await this.destroy();
  if (result === false) {
    throw new RecordNotDestroyed("Failed to destroy the record", this as unknown as object);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Instance read-helpers — slice / valuesAt / assignAttributes.
// Mirror ActiveRecord::Base#slice / #values_at / #assign_attributes.
// ---------------------------------------------------------------------------

/** Mirrors: ActiveRecord::Base#slice */
export function slice(this: AttributeIO, ...keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = this.readAttribute(key);
  }
  return result;
}

/** Mirrors: ActiveRecord::Base#values_at */
export function valuesAt(this: AttributeIO, ...keys: string[]): unknown[] {
  return keys.map((key) => this.readAttribute(key));
}

/**
 * Mirrors: ActiveRecord::AttributeAssignment#assign_attributes. Rails'
 * version lets setter exceptions propagate raw; ours additionally wraps
 * them in AttributeAssignmentError with the offending key/value for
 * debugging. (That wrapping is stricter than Rails but longstanding —
 * preserved by this extraction; revisiting the Rails-fidelity gap can
 * happen in a follow-up.)
 */
export function assignAttributes(this: AttributeIO, attrs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attrs)) {
    try {
      this.writeAttribute(key, value);
    } catch (e) {
      let repr: string;
      try {
        repr = JSON.stringify(value);
      } catch {
        repr = String(value);
      }
      throw new AttributeAssignmentError(
        `error on assignment ${repr} to ${key} (${e instanceof Error ? e.message : String(e)})`,
        e instanceof Error ? e : undefined,
        key,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// updateAttribute / updateAttributeBang / updateColumn(s) — single- and
// multi-column writers. Rails' update_attribute runs callbacks (skips
// validations); update_column(s) skips both.
// ---------------------------------------------------------------------------

interface AttributeSingleSave {
  writeAttribute(name: string, value: unknown): void;
  save(options?: { validate?: boolean }): Promise<boolean>;
}

/** Mirrors: ActiveRecord::Persistence#update_attribute */
export async function updateAttribute<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<boolean> {
  this.writeAttribute(name, value);
  return this.save({ validate: false });
}

/**
 * Mirrors: ActiveRecord::Persistence#update_attribute! —
 * `public_send("#{name}=", value); save!(validate: false)`.
 * Skips validations, raises RecordNotSaved when a callback aborts.
 */
export async function updateAttributeBang<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<true> {
  this.writeAttribute(name, value);
  const saved = await this.save({ validate: false });
  if (!saved) {
    const ctorName = (this.constructor as { name?: string }).name || "record";
    throw new RecordNotSaved(`Failed to save the ${ctorName} while updating \`${name}\``, this);
  }
  return true;
}

interface UpdateColumnsRecord {
  _readonly: boolean;
  _attributes: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
  id: unknown;
  isPersisted(): boolean;
  changesApplied(): void;
  constructor: {
    name: string;
    primaryKey: string | string[];
    arelTable: InstanceType<typeof ArelTable>;
    _attributeDefinitions: Map<string, { type: { cast(v: unknown): unknown } }>;
    _buildPkWhereNode(id: unknown): Parameters<UpdateManager["where"]>[0];
    adapter: {
      execUpdate(sql: string, name?: string, binds?: unknown[]): Promise<number>;
      update?(arel: InstanceType<typeof UpdateManager>): Promise<number>;
      quote?(value: unknown): string;
      quoteColumnName?(name: string): string;
      quoteTableName?(name: string): string;
      toSql?(arel: unknown): string;
    };
  };
}

/** Mirrors: ActiveRecord::Persistence#update_column */
export async function updateColumn<T extends UpdateColumnsRecord>(
  this: T & { updateColumns(attrs: Record<string, unknown>): Promise<void> },
  name: string,
  value: unknown,
): Promise<void> {
  return this.updateColumns({ [name]: value });
}

/**
 * Mirrors: ActiveRecord::Persistence#update_columns. Writes the given
 * attributes to the database bypassing validations, callbacks and
 * timestamps. Resets dirty tracking so the written values are the new
 * baseline.
 *
 * Builds the UPDATE with Arel's UpdateManager. When the adapter
 * provides update() / toSql(), compilation routes through the adapter
 * (picking up its quoting layer for SET values and identifiers); else
 * falls back to Arel's generic SQL generation. Either path replaces
 * the previous raw-string interpolation, which mishandled embedded
 * single-quote-like sequences, binary columns, and adapter-specific
 * date / JSON formatting.
 */
export async function updateColumns<T extends UpdateColumnsRecord>(
  this: T,
  attrs: Record<string, unknown>,
): Promise<void> {
  if (this._readonly) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }
  if (!this.isPersisted()) {
    throw new Error("Cannot update columns on a new or destroyed record");
  }

  // Rails' update_columns returns true for empty attrs without running a
  // SQL statement. Our UpdateManager would emit `UPDATE t WHERE ...` with
  // no SET clause, which is invalid SQL.
  if (Object.keys(attrs).length === 0) {
    return;
  }

  const ctor = this.constructor;
  const table = ctor.arelTable as unknown as InstanceType<typeof ArelTable> & {
    get(name: string): unknown;
  };

  // Capture the PK *before* applying attrs — if the caller is updating a
  // PK column, we still need to target the row by its existing id, not
  // the new value we're about to write.
  const originalId = this.id;

  // Cast values through their declared attribute types (no dirty tracking —
  // this path bypasses writeAttribute deliberately) and collect the cast
  // values for the UPDATE's SET clause. Reject unknown keys up-front so a
  // malicious/invalid key can't sneak an un-schema'd identifier into the
  // SQL identifier position. Primary-key columns are implicit on Base and
  // aren't always in _attributeDefinitions, so allow them through.
  const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
  const setPairs: Array<[unknown, unknown]> = [];
  for (const [key, value] of Object.entries(attrs)) {
    const def = ctor._attributeDefinitions.get(key);
    if (!def && !pkCols.includes(key)) {
      throw new UnknownAttributeError(this, key);
    }
    const cast = def ? def.type.cast(value) : value;
    this._attributes.set(key, cast);
    setPairs.push([table.get(key), cast]);
  }

  const um = new UpdateManager();
  um.table(table);
  um.set(setPairs as Parameters<UpdateManager["set"]>[0]);
  um.where(ctor._buildPkWhereNode(originalId));

  const adapter = ctor.adapter;
  if (typeof adapter.update === "function") {
    await adapter.update(um);
  } else {
    const sql = adapter.toSql ? adapter.toSql(um) : um.toSql();
    await adapter.execUpdate(sql, "Update Columns");
  }

  this.changesApplied();
}

// ---------------------------------------------------------------------------
// reload — refetch from DB and reset in-memory state.
// ---------------------------------------------------------------------------

interface ReloadRecord {
  _attributes: {
    set(name: string, value: unknown): void;
  };
  _dirty: { snapshot(attrs: unknown): void };
  _collectionProxies: Map<string, unknown>;
  _preloadedAssociations: Map<string, unknown>;
  _associationInstances: Map<string, unknown>;
  _cachedAssociations?: Map<string, unknown>;
  id: unknown;
  constructor: {
    name: string;
    primaryKey: string | string[];
    arelTable: { project(...cols: unknown[]): { where(node: unknown): { toSql(): string } } };
    _buildPkWhereNode(id: unknown): unknown;
    adapter: {
      selectAll(
        sql: string,
        name: string,
      ): Promise<{ first(): Record<string, unknown> | undefined }>;
    };
  };
}

/**
 * Re-fetch the record from the database and overwrite in-memory attributes,
 * resetting dirty tracking and clearing association/proxy caches.
 *
 * Mirrors: ActiveRecord::Persistence#reload
 */
export async function reload<T extends ReloadRecord>(this: T): Promise<T> {
  const ctor = this.constructor;
  const sm = ctor.arelTable.project(arelStar).where(ctor._buildPkWhereNode(this.id));
  const result = await ctor.adapter.selectAll(sm.toSql(), "Reload");
  const row = result.first();

  if (row === undefined) {
    throw new RecordNotFound(
      `${ctor.name} with ${String(ctor.primaryKey)}=${String(this.id)} not found`,
      ctor.name,
      String(ctor.primaryKey),
      this.id,
    );
  }

  for (const [key, value] of Object.entries(row)) {
    this._attributes.set(key, value);
  }

  this._dirty.snapshot(this._attributes);
  this._collectionProxies.clear();
  this._preloadedAssociations.clear();
  this._associationInstances.clear();
  this._cachedAssociations?.clear();
  clearAutosaveState(this as unknown as Parameters<typeof clearAutosaveState>[0]);
  return this;
}

// ---------------------------------------------------------------------------
// dup / clone / becomes / becomes! — shape-preserving copies & class swaps.
// ---------------------------------------------------------------------------

interface DupRecord {
  attributes: Record<string, unknown>;
  constructor: new (attrs: Record<string, unknown>) => unknown;
}

/**
 * Build an unsaved duplicate: same non-PK attributes, new_record = true.
 *
 * Mirrors: ActiveRecord::Inheritance#dup (Rails 7.2+ moved it from Core to
 * Inheritance; the behavior is: copy attributes minus primary key[s]).
 */
export function dup<T extends DupRecord>(this: T): T {
  const ctor = this.constructor as typeof this.constructor & {
    primaryKey: string | string[];
  };
  const attrs = { ...this.attributes };
  const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
  for (const col of pkCols) {
    delete attrs[col];
  }
  return new ctor(attrs) as T;
}

interface CloneRecord {
  _attributes: unknown;
  _previouslyNewRecord: boolean;
  errors: { constructor: new (base: unknown) => unknown };
}

/**
 * Shallow clone preserving the primary key and persisted state. The
 * attribute map is shared with the original (Rails' Core#clone semantic).
 * Ours also resets `_previouslyNewRecord` on the copy, since a clone of a
 * post-save record is a fresh in-memory snapshot.
 *
 * Mirrors: ActiveRecord::Core#clone
 */
export function clone<T extends CloneRecord>(this: T): T {
  const copy = Object.create(Object.getPrototypeOf(this)) as T;
  Object.assign(copy, this);
  (copy as unknown as CloneRecord)._attributes = this._attributes;
  (copy as unknown as CloneRecord)._previouslyNewRecord = false;
  (copy as unknown as { errors: unknown }).errors = new this.errors.constructor(copy);
  return copy;
}

interface BecomesRecord {
  _attributes: unknown;
  _newRecord: boolean;
  _destroyed: boolean;
  _dirty: { snapshot(attrs: unknown): void };
  errors: unknown;
  changesApplied(): void;
}

/**
 * Returns an instance of `klass` that shares this record's attribute set,
 * new-record / destroyed flags, dirty snapshot, and errors. Useful for STI
 * where the same row should be viewed through a different subclass.
 *
 * Mirrors: ActiveRecord::Persistence#becomes — "shares the same attributes
 * hash" + copies new_record? / destroyed? / errors.
 */
export function becomes<
  T extends BecomesRecord,
  K extends new (attrs: Record<string, unknown>) => BecomesRecord,
>(this: T, klass: K): InstanceType<K> {
  const instance = new klass({}) as InstanceType<K>;
  const target = instance as unknown as BecomesRecord;
  target._attributes = this._attributes;
  target._newRecord = this._newRecord;
  target._destroyed = this._destroyed;
  if (!this._newRecord) {
    target._dirty.snapshot(target._attributes);
    target.changesApplied();
  }
  // Rails: `becoming.errors.copy!(errors)` — propagate pending validation
  // errors across the class swap. Noop if the errors object doesn't expose
  // a `copy` method (defensive for hosts that stub errors differently).
  const targetErrors = target.errors as { copy?(other: unknown): void };
  if (typeof targetErrors.copy === "function") {
    targetErrors.copy(this.errors);
  }
  return instance;
}

/**
 * Same as #becomes but sets the STI type column so the row can be
 * persisted under the new class going forward.
 *
 * Mirrors: ActiveRecord::Persistence#becomes!
 */
export function becomesBang<
  T extends BecomesRecord & { becomes: typeof becomes },
  K extends typeof import("./base.js").Base,
>(this: T, klass: K): InstanceType<K> {
  const instance = this.becomes(klass) as InstanceType<K>;
  const base = getStiBase(klass);
  const inheritanceCol = getInheritanceColumn(base);
  if (inheritanceCol) {
    const value = isStiSubclass(klass) ? klass.name : null;
    (instance as unknown as { _attributes: { set(k: string, v: unknown): void } })._attributes.set(
      inheritanceCol,
      value,
    );
  }
  return instance;
}
