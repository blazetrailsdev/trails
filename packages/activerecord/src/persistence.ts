/**
 * Persistence — class methods for creating, instantiating, and
 * configuring query constraints on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { isAbortSignal } from "@blazetrails/activesupport";
import {
  sanitizeForMassAssignment,
  SerializeCastValue,
  runAfterCallbacksOnProto,
} from "@blazetrails/activemodel";
import { InsertManager, UpdateManager, DeleteManager, Table as ArelTable } from "@blazetrails/arel";
import {
  ActiveRecordError,
  AttributeAssignmentError,
  ReadOnlyRecord,
  RecordNotDestroyed,
  RecordNotSaved,
  UnknownAttributeError,
} from "./errors.js";
import {
  hasMultiparameterKeys,
  extractMultiparameterCallstack,
  executeMultiparameterAssignment,
} from "./multiparameter-attribute-assignment.js";
import { assignAssociationIfMatch } from "./attribute-assignment.js";
import { threadedConnectionFor } from "./connection-handling.js";
import { clearAutosaveState } from "./autosave-association.js";
import {
  getStiBase,
  getInheritanceColumn,
  isStiSubclass,
  isDescendsFromActiveRecord,
  stiName,
} from "./inheritance.js";
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
import { reconcileVirtualAttributes } from "./model-schema.js";

interface PersistenceHost {
  new (attrs?: Record<string, unknown>): any;
  _instantiate(
    row: Record<string, unknown>,
    block?: (record: any) => void,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): any;
  /** @internal */
  discriminateClassForRecord?(attributes: Record<string, unknown>): PersistenceHost;
  primaryKey: string | string[];
  _queryConstraintsList?: string[] | null;
  _hasQueryConstraints?: boolean;
  _isBaseClass?: boolean;
  ensureSchemaLoaded(): Promise<void>;
}

/**
 * Create and save a new record (or array of records).
 * Mirrors: ActiveRecord::Persistence::ClassMethods#create
 */
export async function create(
  this: PersistenceHost,
  attrs: Record<string, unknown> | Record<string, unknown>[] = {},
  block?: (record: any) => void,
): Promise<any> {
  if (Array.isArray(attrs)) {
    const records: any[] = [];
    for (const a of attrs) {
      records.push(await (this as any).create(a, block));
    }
    return records;
  }
  // Reflect the schema before constructing — the constructor casts attrs
  // against attribute definitions that lazy reflection populates.
  await this.ensureSchemaLoaded();
  const mergedAttrs = (this as any)._mergeCurrentScopeAttrs(attrs);
  const record = new this(mergedAttrs);
  if (block) block(record);
  await record.save();
  return record;
}

/**
 * Create and save, raising on validation failure.
 * Mirrors: ActiveRecord::Persistence::ClassMethods#create!
 */
export async function createBang(
  this: PersistenceHost,
  attrs: Record<string, unknown> | Record<string, unknown>[] = {},
  block?: (record: any) => void,
): Promise<any> {
  if (Array.isArray(attrs)) {
    const records: any[] = [];
    for (const a of attrs) {
      records.push(await (this as any).createBang(a, block));
    }
    return records;
  }
  await this.ensureSchemaLoaded();
  const mergedAttrs = (this as any)._mergeCurrentScopeAttrs(attrs);
  const record = new this(mergedAttrs);
  if (block) block(record);
  await record.saveBang();
  return record;
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
  columnTypes: Record<string, unknown> = {},
  block?: (record: any) => void,
): any {
  // Rails: klass = discriminate_class_for_record(attributes)
  //        instantiate_instance_of(klass, attributes, column_types, &block)
  const klass = this.discriminateClassForRecord
    ? this.discriminateClassForRecord(attributes)
    : this;
  // Schema cast types come from the model's attribute definitions; `columnTypes`
  // only supplies types for extra/computed select columns absent from the schema,
  // mirroring Rails' `instantiate(record, column_types)`. Thread the block so it
  // runs before the find/initialize callbacks (Rails' `init_with_attributes`).
  return klass._instantiate(
    attributes,
    block,
    columnTypes as Record<string, { deserialize(value: unknown): unknown }>,
  );
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
    toSql(arel: unknown): string;
    emptyInsertStatementValue?(pk?: string | null): string;
  },
  values: Record<string, unknown>,
  returning?: string[] | null,
): Promise<unknown> {
  const ctor = this as any;
  const primaryKey = ctor.primaryKey;
  let primaryKeyValue: unknown = null;
  // `prefetch_primary_key?` is false for every adapter the port currently ships
  // (no client-side sequence prefetch), so this branch is inert today; it is
  // mirrored to keep the structure aligned with Rails.
  if (ctor.isPrefetchPrimaryKey?.() && primaryKey && !Array.isArray(primaryKey)) {
    if (values[primaryKey] == null) {
      primaryKeyValue = ctor.nextSequenceValue?.() ?? null;
      if (primaryKeyValue != null) values[primaryKey] = primaryKeyValue;
    }
  }

  const table: ArelTable = ctor.arelTable;
  const im = new InsertManager(table);

  const entries = Object.entries(values);
  if (entries.length > 0) {
    im.insert(entries.map(([col, val]) => [table.get(col), val]));
  }

  if (typeof connection.insert === "function") {
    // Rails: `connection.insert(im, "#{self} Create", primary_key || false,
    //         primary_key_value, returning: returning)`. Rails reflects
    // `primary_key` as nil for a key-less table, so `primary_key || false`
    // yields `false` there; trails' `primaryKey` instead assumes the "id"
    // convention until the schema cache is warm, so guard on the column actually
    // existing to avoid emitting a pk-derived `RETURNING "id"` against a table
    // with no `id` column. An empty/unwarmed column list keeps the pk (current
    // behavior for direct callers without a loaded schema).
    const cols = typeof ctor.columns === "function" ? (ctor.columns() as { name: string }[]) : [];
    const pkExists = cols.length === 0 || cols.some((c) => c.name === primaryKey);
    const pkArg: string | false =
      !Array.isArray(primaryKey) && primaryKey && pkExists ? primaryKey : false;
    // Rails: `im.insert(connection.empty_insert_statement_value(primary_key))`
    // for a value-less INSERT.
    if (entries.length === 0) {
      im.insert(
        connection.emptyInsertStatementValue!(!Array.isArray(primaryKey) ? primaryKey : null),
      );
    }
    return connection.insert(im, `${ctor.name} Create`, pkArg, primaryKeyValue, undefined, [], {
      returning: returning ?? null,
    });
  }

  // Fallback for simple adapters without insert()
  const sql = connection.toSql(im);
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

  applyDefaultAndGlobalConstraints(um as any, this as any);

  const adapter = threadedConnectionFor((this as any).constructor) ?? (this as any).connection;
  if (typeof adapter.update === "function") {
    return adapter.update(um);
  }
  const sql = adapter.toSql(um);
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

  applyDefaultAndGlobalConstraints(dm as any, this as any);

  const adapter = threadedConnectionFor((this as any).constructor) ?? (this as any).connection;
  if (typeof adapter.delete === "function") {
    return adapter.delete(dm);
  }
  const sql = adapter.toSql(dm);
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
  attributeInDatabase(name: string): unknown;
  clearAttributeChange(name: string): void;
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
  save(options?: { validate?: boolean }): Promise<boolean | undefined>;
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
  // Rails' `increment!(attribute, ...)` requires the attribute; a bare
  // `increment!` raises ArgumentError (Ruby's missing-required-argument).
  if (attribute === undefined) {
    throw new Error("wrong number of arguments (given 0, expected 1..3)");
  }
  this.increment(attribute, by);
  // Rails: `change = public_send(attribute) - public_send(:"#{attribute}_in_database")`
  // — persist the delta between the (already-incremented) in-memory value and
  // the value last loaded from the DB, not the raw `by`. They coincide for a
  // bare `increment!`, but Rails' chained `increment(x).increment!(x)` form
  // relies on the prior in-memory `increment` being folded into the delta.
  const change =
    Number(this.readAttribute(attribute)) - (Number(this.attributeInDatabase(attribute)) || 0);
  await this.constructor.updateCounters(this.id, { [attribute]: change }, { touch: options.touch });
  // Rails: `public_send(:"clear_#{attribute}_change")` — the in-memory
  // increment is now durably persisted, so the attribute should no longer
  // appear dirty (otherwise a later save() would re-persist it). Use the
  // per-attribute form so the baseline is rebound to the current value —
  // otherwise a later write would still diff against the pre-increment
  // original.
  this.clearAttributeChange(attribute);
  // Mirrors Rails Callbacks#increment! (callbacks.rb:435-437):
  //   `touch ? _run_touch_callbacks { super } : super`
  // — when a `touch:` is requested, the counter UPDATE timestamps the row and
  // the after_touch callbacks must fire on this in-memory instance (e.g. a
  // belongs_to `counter_cache` + `touch:` bumps the parent's `after_touch`
  // counter). The class-level `updateCounters` above only emits SQL.
  if (options.touch != null) {
    const ctor = this.constructor as unknown as { prototype: object };
    await runAfterCallbacksOnProto(ctor.prototype, "touch", this);
  }
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
): Promise<boolean | undefined> {
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
  save(options?: { validate?: boolean }): Promise<boolean | undefined>;
  saveBang(options?: { validate?: boolean }): Promise<true | undefined>;
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
 * Assign one key during `#update` / `#update!`. Mirrors Rails `assign_attributes`,
 * which routes every key through `public_send("#{key}=")`. We keep the raw
 * `writeAttribute` path for plain columns (it preserves original error classes —
 * see {@link update}), but nested-attribute writers (`<assoc>Attributes=`,
 * installed by `acceptsNestedAttributesFor`) must go through their generated
 * setter so records are built / marked-for-destruction in memory before save.
 * @internal
 */
function assignUpdateAttribute(self: any, key: string, value: unknown): Promise<void> | void {
  const configs = self.constructor?._nestedAttributeConfigs as
    | { associationName: string }[]
    | undefined;
  if (configs?.some((c) => `${c.associationName}Attributes` === key)) {
    self[key] = value;
    return;
  }
  // Rails' #update → assign_attributes dispatches `id` through `public_send("id=")`,
  // which for a composite-PK model distributes the value across the key columns.
  // Route it through the `id=` setter here too: the raw `writeAttribute` path
  // remaps `id` to the PK and rejects a composite PK (write.rb:35), so a direct
  // write would wrongly raise for `update(id: [...])`.
  if (key === "id") {
    self.id = value;
    return;
  }
  // Dispatch through prototype setter for generated writers (e.g. *Ids writers
  // from CollectionAssociation builder). Mirrors Rails' public_send("#{key}=").
  // *Ids writers are async (they query the DB to resolve records); return the
  // Promise so update() can await it before save().
  let proto = Object.getPrototypeOf(self);
  while (proto && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc) {
      if (typeof desc.set === "function") {
        const result: unknown = desc.set.call(self, value);
        return result instanceof Promise ? result : undefined;
      }
      break;
    }
    proto = Object.getPrototypeOf(proto);
  }
  self.writeAttribute(key, value);
}

/**
 * Mirrors: ActiveRecord::Persistence#update — assign + save. Returns the
 * boolean from save so callers can detect validation / callback aborts
 * without catching exceptions.
 *
 * Rails wraps this in `with_transaction_returning_status` so the pre-assignment
 * state snapshot is captured before any attribute writes. This ensures that on
 * rollback, composite PKs and other attributes modified by the assignment are
 * restored to their pre-update values.
 */
export async function update<T extends UpdateRecord>(
  this: T,
  attrs: Record<string, unknown>,
): Promise<boolean | undefined> {
  assertLockingColumnNotExplicitly(this, attrs);
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    // Rails' #update delegates to `assign_attributes`, which iterates setters
    // and lets their exceptions propagate raw. Our Base#assignAttributes wraps
    // every writeAttribute failure in AttributeAssignmentError — more aggressive
    // than Rails. Use a raw writeAttribute loop here to preserve original error
    // classes (pre-extraction behavior; closer to Rails than wrapping).
    // NOTE: this leaves two assignment paths where Rails has one — plain columns
    // go through raw writeAttribute (above), only nested-attribute writers route
    // through their setter (assignUpdateAttribute). A column with a custom writer
    // would be missed; none exist today. TODO: unify on `public_send`-equivalent
    // setter dispatch if/when a custom column writer is introduced.
    const pending: Promise<void>[] = [];
    for (const [key, value] of Object.entries(attrs)) {
      const p = assignUpdateAttribute(self, key, value);
      if (p) pending.push(p);
    }
    if (pending.length) await Promise.all(pending);
    return self.save() as Promise<boolean | undefined>;
  }) as Promise<boolean | undefined>;
}

/**
 * Mirrors: ActiveRecord::Persistence#update! — assign + save!. Raises
 * `RecordInvalid` on validation failure.
 */
export async function updateBang<T extends UpdateRecord>(
  this: T,
  attrs: Record<string, unknown>,
): Promise<true | undefined> {
  assertLockingColumnNotExplicitly(this, attrs);
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    // See update(): raw loop preserves original error classes (matches Rails,
    // avoids Base#assignAttributes's AttributeAssignmentError wrap); nested
    // attribute writers still route through their setter.
    for (const [key, value] of Object.entries(attrs)) {
      assignUpdateAttribute(self, key, value);
    }
    return self.saveBang() as Promise<true | undefined>;
  }) as Promise<true | undefined>;
}

interface DeleteRecord {
  _destroyed: boolean;
  _previouslyNewRecord: boolean;
  id: unknown;
  idInDatabase(): unknown;
  isPersisted(): boolean;
  freeze(): unknown;
  constructor: {
    arelTable: InstanceType<typeof ArelTable>;
    _buildQueryConstraintsWhereNode(
      constraints: Record<string, unknown>,
    ): Parameters<DeleteManager["where"]>[0];
    connection: {
      execDelete(sql: string, name: string): Promise<number>;
      toSql(arel: unknown): string;
    };
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
    // Mirrors Rails Persistence#delete → _delete_record(_query_constraints_hash):
    // the WHERE targets each query-constraint column's `*_in_database` value (the
    // primary key keyed to `id_in_database` when no query_constraints are
    // declared), so a dirty (in-memory mutated) primary key still deletes the row
    // identified by the value last loaded from the DB.
    const dm = new DeleteManager()
      .from(ctor.arelTable)
      .where(ctor._buildQueryConstraintsWhereNode(_queryConstraintsHash.call(this as any)));
    // The SQL is arel-built via `connection.toSql(dm)`; the "Delete" string is
    // the operation-name label (Rails' log subscriber name), not raw SQL.
    const adapter =
      threadedConnectionFor(ctor as unknown as typeof import("./base.js").Base) ?? ctor.connection;
    await adapter.execDelete(adapter.toSql(dm), "Delete");
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
  _readAttribute(name: string): unknown;
  errors: { any: boolean };
  isValid(context?: ValidationContextArg): boolean;
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
): Promise<boolean | undefined> {
  // Mirrors ActiveRecord::Suppressor#save: a suppressed record returns `true`
  // immediately, before validations or the INSERT/UPDATE. This is why
  // `create!`/`save!` inside `suppress` never raise even on invalid records —
  // `create_or_update` is never reached.
  if (isSuppressed(this.constructor as unknown as Parameters<typeof isSuppressed>[0])) {
    return true;
  }
  // Reflect the schema before validations/INSERT touch attribute defs.
  await (
    this.constructor as unknown as { ensureSchemaLoaded(): Promise<void> }
  ).ensureSchemaLoaded();
  // Reconcile virtual attributes (declared via `attribute()` with no backing DB
  // column) against the real columns so they're excluded from `column_names`,
  // and thus from the INSERT/UPDATE. `reflect: true` permits a schema-cache
  // miss to introspect here on the write path (reads never do — see
  // reconcileVirtualAttributes).
  await (reconcileVirtualAttributes as (this: unknown, reflect: boolean) => Promise<void>).call(
    this.constructor,
    true,
  );
  // Mirrors the Rails module layering: ActiveRecord::Validations#save! runs
  // `perform_validations` first and only on success calls super →
  // Persistence#save! → create_or_update, where the readonly/destroyed guards
  // live. So validations run *before* the guards: a record that is both
  // destroyed and invalid raises RecordInvalid (validations first), not
  // RecordNotSaved.
  const self = this as any;
  // A `before_validation` that needs async DB work (Rails runs it inside the
  // save transaction — transactions_test.rb:714) can't await on trails' strict-
  // sync validation chain, so such a callback defers its thunk here instead of
  // running inline. Reset the queue before the chain populates it so a prior
  // save that bailed at validation doesn't leak a stale thunk into this one.
  self._beforeValidationSideEffects = [];
  if (!performValidations.call(this, options)) return false;
  if (options?.validate !== false) {
    if (!(await self._runAsyncValidations())) return false;
  }
  // Mirrors ActiveRecord::Persistence#create_or_update: readonly raises first,
  // then `return false if destroyed?`. `save` returns false (it does not raise)
  // for a destroyed record; `save!` turns that false into
  // RecordNotSaved("Failed to save the record").
  if (this._readonly) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }
  if (this._destroyed) {
    return false;
  }

  self._skipTouch = options?.touch === false;
  const ctor = this.constructor;

  // Auto-set STI type column on new records
  if (this._newRecord && isStiSubclass(ctor)) {
    const col = getInheritanceColumn(getStiBase(ctor));
    if (col && !this._readAttribute(col)) {
      this._attributes.set(col, this.constructor.name);
    }
  }

  // Mirrors: ActiveRecord::Transactions#save
  try {
    return (await withTransactionReturningStatus.call(self, async () => {
      // Drain deferred `before_validation` side effects inside the transaction
      // so a cancelling filter's DB write (`Book.create`) rolls back with it.
      // A drained thunk that `throw :abort`s halts the save (status false →
      // Rollback), matching Rails' halted validation callback.
      //
      // ORDERING DEVIATION: Rails layers save as `Transactions#save {
      // Validations#save { perform_validations; Persistence#save } }`
      // (transactions.rb:360, validations.rb:47), so `before_validation` runs
      // *inside* the transaction and *before* `valid?`. trails runs
      // `performValidations` above (outside the transaction, line 778), so the
      // deferred thunk's async body runs here — after the validators, not
      // before. Observable only when a record has BOTH a failing validation and
      // an aborting async `before_validation`: trails reports `errors.any`
      // (validators already ran) where Rails reports none (abort halts first).
      // The four cancellation tests don't hit this (validations pass); the
      // governing constraint is the strict-sync validation chain — see the
      // Topic wiring and `validations.ts#isValid`. Tracked for convergence:
      // RFC 0023 story `save-runs-validations-inside-transaction`.
      const sideEffects = self._beforeValidationSideEffects as Array<() => unknown>;
      for (const thunk of sideEffects) {
        try {
          await thunk();
        } catch (e) {
          if (isAbortSignal(e)) return false;
          throw e;
        }
      }
      return self.createOrUpdate();
    })) as boolean | undefined;
  } catch (e) {
    // Mirrors Rails' `rescue ActiveRecord::RecordInvalid` in save — autosave
    // callbacks raise RecordInvalid when a child fails to save. The transaction
    // has already rolled back at this point.
    if (e instanceof RecordInvalid) return false;
    throw e;
  } finally {
    self._skipTouch = false;
  }
}

/** Mirrors: ActiveRecord::Base#save! — `create_or_update(**options) || raise`. */
export async function saveBang<
  T extends SaveRecord & {
    save(o?: { validate?: boolean; touch?: boolean }): Promise<boolean | undefined>;
  },
>(this: T, options?: { validate?: boolean; touch?: boolean }): Promise<true | undefined> {
  const result = await this.save(options);
  if (result === false) {
    // Mirrors Rails' two save! layers: ActiveRecord::Validations#save! raises
    // RecordInvalid when validations failed (errors present); otherwise
    // Persistence#save! raises RecordNotSaved("Failed to save the record")
    // for a create_or_update that returned false (destroyed record, halted
    // callback) without populating validation errors.
    if ((this as unknown as { errors: { any: boolean } }).errors.any) {
      raiseValidationError(this);
    }
    throw new RecordNotSaved("Failed to save the record", this as unknown as object);
  }
  // Mirrors Rails' with_transaction_returning_status returning `status` directly:
  // `undefined` when before_save raises Rollback (caught by the joined transaction,
  // status never assigned) — matching Rails save! returning nil in that path.
  return result;
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

  // Mirrors ActiveRecord::Callbacks#destroy's `@_destroy_callback_already_called`
  // reentrancy guard: two records that `dependent: :destroy` each other (e.g.
  // Content/ContentPosition) would recurse forever. Once a record's destroy is
  // in flight, a cascade back into it short-circuits to success.
  const self = this as any;
  if (self._destroyCallbackAlreadyCalled) return this;
  self._destroyCallbackAlreadyCalled = true;
  try {
    // Mirrors: ActiveRecord::Transactions#destroy
    const result = await withTransactionReturningStatus.call(self, () => self._destroyRow());
    return result ? this : false;
  } finally {
    self._destroyCallbackAlreadyCalled = false;
  }
}

/** Mirrors: ActiveRecord::Base#destroy! */
export async function destroyBang<T extends DestroyRecord & { destroy(): Promise<T | false> }>(
  this: T,
): Promise<T> {
  const result = await this.destroy();
  // Rails: `destroy || _raise_record_not_destroyed` — re-raises the stored
  // @_association_destroy_exception (child RecordNotDestroyed with error.record
  // pointing at the failed child) when set, otherwise raises owner-level error.
  if (result === false) (this as any)._raiseRecordNotDestroyed();
  return result as T;
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
 * Walk the prototype chain of `instance` to find a setter descriptor for
 * `key`. Returns the setter function, or undefined if none exists.
 *
 * Used by assignAttributes to mirror Rails' public_send("#{k}=", v)
 * dispatch — store accessor setters write to the store hash rather than a
 * standalone attribute slot, so they must be called via the descriptor path.
 */
function findPrototypeSetter(instance: object, key: string): ((v: unknown) => void) | undefined {
  let proto = Object.getPrototypeOf(instance);
  while (proto !== null && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (desc?.set) return desc.set;
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

/**
 * Re-dispatch any `*Attributes=` nested attribute setter keys that the Base
 * constructor wrote as plain attribute values (via `writeAttribute`) rather
 * than through the prototype setter. Called by `create`/`createBang` after
 * construction so that `Model.create({commentsAttributes: [...]})` correctly
 * queues nested attributes for processing on save — mirrors Rails'
 * `new Model(attributes)` → `assign_attributes` → `public_send(setter)` path.
 */
export function _reapplyNestedAttrSetters(
  ctor: PersistenceHost,
  record: any,
  attrs: Record<string, unknown>,
): void {
  let cls: any = ctor;
  while (cls && cls !== Object) {
    const own = Object.getOwnPropertyDescriptor(cls, "_nestedAttributeSetterKeys");
    if (own?.value instanceof Set) {
      for (const k of own.value as Set<string>) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          const setter = findPrototypeSetter(record, k);
          if (setter) setter.call(record, attrs[k]);
        }
      }
    }
    cls = Object.getPrototypeOf(cls);
  }
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
  // Mirrors ActiveModel::AttributeAssignment#assign_attributes: bail before
  // sanitizing so a blank strong-params object (always un-permitted) is a
  // no-op rather than raising, then unwrap/forbid via sanitize_for_mass_assignment.
  if (Object.keys(attrs).length === 0) return;
  attrs = sanitizeForMassAssignment(attrs);

  if (hasMultiparameterKeys(attrs)) {
    const { multiparams, regular } = extractMultiparameterCallstack(attrs);
    // Assign regular attributes first (with existing error wrapping)
    for (const [key, value] of Object.entries(regular)) {
      try {
        if (
          assignAssociationIfMatch(
            this as { constructor?: unknown; association?: (name: string) => unknown },
            key,
            value,
          )
        )
          continue;
        const setter = findPrototypeSetter(this, key);
        if (setter) {
          setter.call(this, value);
        } else {
          this.writeAttribute(key, value);
        }
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
    // Then assign multiparameter attributes (throws MultiparameterAssignmentErrors)
    executeMultiparameterAssignment(this as any, multiparams);
    return;
  }

  for (const [key, value] of Object.entries(attrs)) {
    try {
      if (
        assignAssociationIfMatch(
          this as { constructor?: unknown; association?: (name: string) => unknown },
          key,
          value,
        )
      )
        continue;
      // Mirrors Rails' _assign_attribute: dispatch through the public setter
      // when one exists (store accessors write to the store hash, not a
      // standalone attribute slot). Falls back to writeAttribute for plain
      // columns and unknown keys.
      const setter = findPrototypeSetter(this, key);
      if (setter) {
        setter.call(this, value);
      } else {
        this.writeAttribute(key, value);
      }
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
  save(options?: { validate?: boolean }): Promise<boolean | undefined>;
  saveBang(options?: { validate?: boolean }): Promise<true | undefined>;
}

/** Mirrors: ActiveRecord::Persistence#update_attribute */
export async function updateAttribute<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<boolean | undefined> {
  this.writeAttribute(name, value);
  return this.save({ validate: false });
}

/**
 * Mirrors: ActiveRecord::Persistence#update_attribute! —
 * `public_send("#{name}=", value); save!(validate: false)`.
 * Skips validations, raises RecordNotSaved when a callback aborts.
 * Returns undefined (Rails nil) when before_save raises Rollback and it is
 * swallowed by a joined outer transaction.
 */
export async function updateAttributeBang<T extends AttributeSingleSave>(
  this: T,
  name: string,
  value: unknown,
): Promise<true | undefined> {
  this.writeAttribute(name, value);
  return this.saveBang({ validate: false });
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
    _attributeDefinitions: Map<
      string,
      {
        type: {
          cast(v: unknown): unknown;
          serialize?(v: unknown): unknown;
          type?(): string;
        };
      }
    >;
    _buildPkWhereNode(id: unknown): Parameters<UpdateManager["where"]>[0];
    connection: {
      execUpdate(sql: string, name?: string, binds?: unknown[]): Promise<number>;
      update?(arel: InstanceType<typeof UpdateManager>): Promise<number>;
      quote?(value: unknown): string;
      quoteColumnName?(name: string): string;
      quoteTableName?(name: string): string;
      toSql(arel: unknown): string;
    };
  };
}

/** Mirrors: ActiveRecord::Persistence#update_column */
export async function updateColumn<T extends UpdateColumnsRecord>(
  this: T & { updateColumns(attrs: Record<string, unknown>): Promise<boolean> },
  name: string,
  value: unknown,
): Promise<boolean> {
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
): Promise<boolean> {
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
    return true;
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
  // Rails resolves attribute aliases before writing (update_columns flows
  // through the alias-aware attribute layer), so a model aliasing e.g.
  // updated_at → legacy_updated_at can be updated by its public name.
  const aliases: Record<string, string> =
    (
      ctor as unknown as {
        _attributeAliases?: Record<string, string>;
      }
    )._attributeAliases ?? {};
  const setPairs: Array<[unknown, unknown]> = [];
  for (const [rawKey, value] of Object.entries(attrs)) {
    const key = aliases[rawKey] ?? rawKey;
    const def = ctor._attributeDefinitions.get(key);
    if (!def && !pkCols.includes(key)) {
      throw new UnknownAttributeError(this, key);
    }
    const cast = def ? def.type.cast(value) : value;
    this._attributes.set(key, cast);
    // Bridge the in-memory cast value to its DB representation via the
    // faithful SerializeCastValue.serialize dispatcher — the same path
    // insertAll/upsertAll use (insert-all.ts valuesList). It only takes the
    // serializeCastValue fast-path when the type declares it compatible, and
    // otherwise calls full serialize, so every type whose memory shape differs
    // from its column shape persists correctly: Enum (label → mapping
    // integer/string), Temporal (date/datetime/time → wire string, including
    // PG ±infinity sentinels), encryption (plaintext → ciphertext), and any
    // serialize-overriding type (binary, json, serialized, PG OID types). This
    // replaces the former Temporal+Enum type-name allowlist, which silently
    // wrote the in-memory value for any other diverging type.
    const type = def?.type as
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
  um.where(ctor._buildPkWhereNode(originalId));
  // Mirrors Rails' update_columns → _update_record: an all_queries default
  // scope (and any global current scope) is stacked onto the UPDATE constraints.
  applyDefaultAndGlobalConstraints(um as never, ctor as never);

  const adapter =
    (threadedConnectionFor(ctor as unknown as typeof import("./base.js").Base) as
      | typeof ctor.connection
      | null) ?? ctor.connection;
  let affectedRows: number;
  if (typeof adapter.update === "function") {
    affectedRows = await adapter.update(um);
  } else {
    const sql = adapter.toSql(um);
    // The SQL is arel-built via `adapter.toSql(um)`; the "Update Columns" string
    // is the operation-name label (Rails' log subscriber name), not raw SQL.
    affectedRows = await adapter.execUpdate(sql, "Update Columns");
  }

  this.changesApplied();
  return affectedRows === 1;
}

// ---------------------------------------------------------------------------
// reload — refetch from DB and reset in-memory state.
// ---------------------------------------------------------------------------

interface ReloadRecord {
  _attributes: unknown;
  _newRecord: boolean;
  _previouslyNewRecord: boolean;
  _dirty: { snapshot(attrs: unknown): void; clearChangesInformation(): void };
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

  // Rails swaps the whole attribute set (`@attributes = fresh.@attributes`),
  // then unconditionally clears the new-record flags; dirty tracking
  // re-baselines on the fresh values.
  this._attributes = fresh._attributes;
  this._newRecord = false;
  this._previouslyNewRecord = false;
  this._dirty.snapshot(this._attributes);
  this._dirty.clearChangesInformation();

  // Rails reload replaces `@association_cache` wholesale from the freshly
  // fetched object, then re-points each adopted association's owner back to
  // self (persistence.rb):
  //   @association_cache = fresh_object.instance_variable_get(:@association_cache)
  //   @association_cache.each_value { |association| association.owner = self }
  // RFC-0022 folded our former maps into one backing store surfaced as facet
  // views (see `Base#_resetAssociationCaches`). We mirror Rails by adopting
  // fresh's whole cache, then re-pointing every owner-bound holder (the
  // `Association` instances and their `CollectionProxy` companions) back to
  // self. `_findRecord` preloads `strict_loaded_associations` (so re-reading one
  // after reload won't trip a StrictLoadingViolationError lazy load); those
  // preloaded targets now live on the real holder in `_associationInstances` /
  // `_collectionProxies` (RFC 0022), which the loops below adopt.
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
  for (const proxy of this._collectionProxies.values()) {
    (proxy as { owner: unknown }).owner = this;
  }
  clearAutosaveState(this as unknown as Parameters<typeof clearAutosaveState>[0]);
  return this;
}

// ---------------------------------------------------------------------------
// dup / clone / becomes / becomes! — shape-preserving copies & class swaps.
// ---------------------------------------------------------------------------

interface DupAttribute {
  name: string;
  withValueFromUser(value: unknown): DupAttribute;
}

interface DupAttributeSet {
  deepDup(): DupAttributeSet;
  reset(name: string): void;
  fetchValue(name: string): unknown;
  map(fn: (attr: DupAttribute) => DupAttribute): DupAttributeSet;
}

interface DupRecord {
  _attributes: DupAttributeSet;
  _readonly: boolean;
  _dirty: {
    snapshot(attrs: unknown): void;
    reinstateNewRecordChanges(attrs: unknown, skipNames?: ReadonlySet<string>): void;
  };
  isPersisted(): boolean;
  initializeDup(other: unknown): void;
  constructor: new (attrs: Record<string, unknown>) => unknown;
}

/**
 * Build an unsaved duplicate: same non-PK attributes, new_record = true.
 *
 * Mirrors: ActiveRecord::Inheritance#dup (Rails 7.2+ moved it from Core to
 * Inheritance; the behavior is: copy attributes minus primary key[s]).
 *
 * Mirrors Rails' `init_attributes` faithfully. ActiveRecord::Core#init_attributes
 * deep-dups the source attribute set and resets the primary key(s);
 * ActiveModel::Dirty#init_attributes then, *for a persisted source only*,
 * rebuilds each attribute as `_default_attributes.map { |a|
 * a.with_value_from_user(attrs.fetch_value(a.name)) }` — i.e. `FromUser`-over-
 * default. We reproduce both branches exactly: an unsaved source keeps the
 * deep-dup'd attributes; a persisted source is rebuilt from defaults via
 * `withValueFromUser`. The rebuild matters beyond `changes`: a duped persisted
 * attribute's `*_before_type_cast` must be the cast user value (Rails carries
 * the fetched value), not the raw DB representation — e.g. a boolean stored as
 * `0` reads back `false` on the dup.
 *
 * trails' dirty tracking is snapshot-based (not derived from each attribute's
 * `changed?`), so after building the attribute set we run a single
 * reinstate-vs-defaults pass to populate the tracker — the same `changed?`
 * predicate Rails computes per-attribute.
 *
 * Rails' `Core#initialize_dup` sets the duped attributes BEFORE
 * `_run_initialize_callbacks`, so an `after_initialize` hook on the dup observes
 * the full duped attribute set. We reproduce that order: `after_initialize` is
 * suppressed during `new ctor({})` (via `_suppressInitializeCallback`); we swap
 * in the duped `_attributes`, run the dirty-vs-default pass, dispatch
 * `after_initialize` manually, then run the `initialize_dup` chain — so the hook
 * reads the duped values (with timestamp/locking columns still populated), not
 * the empty construction bag. (Like Rails' `initialize_dup`, this runs only the
 * initialize callbacks, not `ensure_proper_type`: the STI type column rides along
 * in the deep-dup'd attributes.)
 *
 * The `initialize_dup` chain (aggregations cache copy + locking/timestamp clear)
 * runs AFTER the hook because Rails' Timestamp/Locking modules `super` into
 * `Core#initialize_dup` (firing the callbacks) and clear only as the stack
 * unwinds (timestamp.rb:50-53, locking/optimistic.rb:72-75). Each clear rebinds
 * its column's dirty baseline (`clear_attribute_change`), so the nulled timestamp
 * and locking columns are not reported as changed even though the reinstate pass
 * ran first (test_dup_timestamps_are_cleared / _locking_column_is_not_dirty).
 * Ruby's `Object#dup` also copies `@readonly`, so carry that over too.
 */
export function dup<T extends DupRecord>(this: T): T {
  const ctor = this.constructor as typeof this.constructor & {
    primaryKey: string | string[];
    _defaultAttributes?: () => DupAttributeSet & { snapshotValues(): Map<string, unknown> };
    _suppressInitializeCallback?: boolean;
  };
  // Suppress `after_initialize` during construction so it fires AFTER the duped
  // attributes are in place (Rails sets `@attributes` before
  // `_run_initialize_callbacks` in `Core#initialize_dup`).
  const hadOwnSuppress = Object.prototype.hasOwnProperty.call(ctor, "_suppressInitializeCallback");
  const prevSuppress = ctor._suppressInitializeCallback;
  ctor._suppressInitializeCallback = true;
  let duped: T;
  try {
    duped = new ctor({}) as T;
  } finally {
    if (hadOwnSuppress) {
      ctor._suppressInitializeCallback = prevSuppress;
    } else {
      delete ctor._suppressInitializeCallback;
    }
  }
  // ActiveRecord::Core#init_attributes: deep_dup + reset(primary_key).
  const base = this._attributes.deepDup();
  const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
  for (const col of pkCols) {
    if (col != null) base.reset(col);
  }
  // ActiveModel::Dirty#init_attributes: a persisted source is rebuilt from the
  // class defaults so each attribute is FromUser-over-default (dirty vs default
  // and carrying the user value before type cast); an unsaved source keeps the
  // deep-dup'd attributes as-is.
  const defaultAttributes = ctor._defaultAttributes?.bind(ctor);
  const dupedAttrs =
    this.isPersisted() && defaultAttributes
      ? defaultAttributes().map((attr) => attr.withValueFromUser(base.fetchValue(attr.name)))
      : base;
  (duped as { _attributes: DupAttributeSet })._attributes = dupedAttrs;
  duped._readonly = this._readonly;
  // Rebind the dirty tracker to the duped attribute set BEFORE the hook (the
  // baseline from `new ctor({})` is stale against the swapped-in `_attributes`),
  // so `will_save_change_to_*` inside `after_initialize` reflects the duped
  // values — Rails' `Core#initialize_dup` runs `init_attributes` before
  // `_run_initialize_callbacks`, so dirty-vs-default is already established when
  // the hook fires (this is what Topic#set_email_address keys off of).
  duped._dirty.snapshot(dupedAttrs);
  if (defaultAttributes) {
    // Re-mark attributes that differ from their database column default as changed.
    duped._dirty.reinstateNewRecordChanges(dupedAttrs);
  }
  // Dispatch `after_initialize` against the duped attributes. Mirrors Rails
  // Core#initialize_dup, which runs `_run_initialize_callbacks` only — it does
  // NOT re-run `initialize_internals_callback`/`ensure_proper_type` (that lives
  // in Core#initialize), so the STI type column is carried solely by the
  // deep-dup'd `@attributes`, not re-asserted here.
  runAfterCallbacksOnProto(ctor.prototype, "initialize", duped, { strict: "sync" });
  // The Timestamp/Locking `initialize_dup` clears run AFTER the callbacks in
  // Rails: their modules `super` into `Core#initialize_dup` (which fires the
  // hook) and clear only as the stack unwinds. So the hook above observes the
  // source's `created_at`/`updated_at`/`lock_version`; we null them out here.
  // Each clear rebinds its column's dirty baseline (`clear_attribute_change`),
  // so the cleared columns read back as nil/default and not-dirty regardless of
  // the reinstate pass above (test_dup_timestamps_are_cleared /
  // _locking_column_is_not_dirty).
  duped.initializeDup(this);
  return duped;
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
  _attributes: { reverseMergeBang(target: unknown): unknown };
  _newRecord: boolean;
  _destroyed: boolean;
  _dirty: unknown;
  errors: unknown;
}

/**
 * Returns an instance of `klass` that shares this record's attribute set,
 * new-record / destroyed flags, dirty tracker, and errors. Useful for STI
 * where the same row should be viewed through a different subclass.
 *
 * Mirrors: ActiveRecord::Persistence#becomes — "shares the same attributes
 * hash" + copies @mutations_from_database / new_record? / destroyed? / errors.
 */
export function becomes<
  T extends BecomesRecord,
  K extends new (attrs: Record<string, unknown>) => BecomesRecord,
>(this: T, klass: K): InstanceType<K> {
  // Rails: `became = klass.allocate` — construct the exact target class,
  // bypassing `new`'s STI dispatch so becomes(base) is never re-resolved to
  // the subclass named by the inheritance column's default
  // (persistence_test.rb#test_becomes_default_sti_subclass).
  // Store the class itself, not a boolean: the constructor only skips dispatch
  // when `new.target` *is* this class, so an inherited static never suppresses
  // a nested `new <subclass>()`.
  const ctor = klass as unknown as { _suppressStiNewDispatch?: unknown };
  const hadOwn = Object.prototype.hasOwnProperty.call(ctor, "_suppressStiNewDispatch");
  const prev = ctor._suppressStiNewDispatch;
  ctor._suppressStiNewDispatch = klass;
  let instance: InstanceType<K>;
  try {
    instance = new klass({}) as InstanceType<K>;
  } finally {
    if (hadOwn) ctor._suppressStiNewDispatch = prev;
    else delete ctor._suppressStiNewDispatch;
  }
  const target = instance as unknown as BecomesRecord;
  // Mirrors Rails: `@attributes.reverse_merge!(becoming.@attributes)` — the new
  // class's default attributes fill in any keys this record is missing (e.g.
  // attributes declared only on the target subclass), then both objects share
  // this record's (now merged) attribute set.
  this._attributes.reverseMergeBang(target._attributes);
  target._attributes = this._attributes;
  target._newRecord = this._newRecord;
  target._destroyed = this._destroyed;
  // Rails: `becoming.instance_variable_set(:@mutations_from_database, ...)` —
  // share the original's dirty tracker by reference so the became record reports
  // the same change-set (the throwaway `new klass({})` construction-time changes,
  // e.g. the STI `type` column, are discarded with its private attribute set).
  target._dirty = this._dirty;
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
  const instance = this.becomes(klass);
  const base = getStiBase(klass);
  const inheritanceCol = getInheritanceColumn(base);
  if (inheritanceCol) {
    // Mirrors Rails: `became.public_send("#{inheritance_column}=", sti_type)` —
    // route through the public writer so the change is dirty-tracked and a
    // subsequent partial UPDATE actually persists the new STI type.
    // `sti_type` is `nil` for an STI base class (descends_from_active_record?).
    const value = isDescendsFromActiveRecord(klass) ? null : stiName(klass);
    (instance as unknown as { writeAttribute(name: string, value: unknown): void }).writeAttribute(
      inheritanceCol,
      value,
    );
  }
  return instance;
}

// ---------------------------------------------------------------------------
// Private instance helpers — mirrors ActiveRecord::Persistence private block.
// Non-exported so the extractor marks them internal: true.
// ---------------------------------------------------------------------------

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
  idInDatabase?(): unknown;
  attributeInDatabase?(col: string): unknown;
  _associationInstances?: Map<
    string,
    { owner?: { _strictLoading?: boolean; isStrictLoadingNPlusOneOnly?(): boolean } } | null
  >;
  constructor: {
    name: string;
    primaryKey: string | string[];
    currentScope?: unknown | (() => unknown);
    defaultScoped(): { whereClause: { isEmpty(): boolean; ast: unknown } };
    readonlyAttributeQ?(name: string): boolean;
    withConnection?(fn: (conn: unknown) => Promise<void>): Promise<void>;
    connection: { execDelete(sql: string, name: string): Promise<number> };
  };
}

/** Host surface for private creation/update helpers in persistence.ts. */
type PersistenceInternalHost = PersistencePrivateHost & {
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, val: unknown): void;
  _triggerUpdateCallback?: boolean | null;
  _attributes?: { keys?(): Iterable<string> };
  constructor: PersistencePrivateHost["constructor"] & {
    columnNames?(): string[];
    _counterCacheColumns?: Set<string>;
  };
};

/** @internal */
function initInternals(this: PersistencePrivateHost): void {
  this._newRecord = true;
  this._destroyed = false;
  this._previouslyNewRecord = false;
  // Mirrors the Transactions#init_internals super chain — those fields live here too.
  (this as any)._triggerUpdateCallback = null;
  (this as any)._triggerDestroyCallback = null;
}

/** @internal */
export function strictLoadedAssociations(this: PersistencePrivateHost): string[] {
  const names = new Set<string>();
  const cache = this._associationInstances;
  if (cache) {
    for (const [name, assoc] of cache) {
      const owner = assoc?.owner;
      if (owner?._strictLoading && !owner?.isStrictLoadingNPlusOneOnly?.()) {
        names.add(name);
      }
    }
  }
  // Preloaded/cached/collection associations are also loaded entries of Rails'
  // @association_cache; their owner is this record, so gate on its own
  // strict-loading state.
  const self = this as unknown as {
    _strictLoading?: boolean;
    isStrictLoadingNPlusOneOnly?(): boolean;
    _associationInstances?: Map<string, { isLoaded?(): boolean }>;
    _collectionProxies?: Map<string, { loaded?: boolean }>;
  };
  if (self._strictLoading && !self.isStrictLoadingNPlusOneOnly?.()) {
    for (const [name, instance] of self._associationInstances ?? []) {
      if (instance?.isLoaded?.()) names.add(name);
    }
    for (const [name, proxy] of self._collectionProxies ?? []) {
      if (proxy?.loaded) names.add(name);
    }
  }
  return [...names];
}

/** @internal */
export function _findRecord(
  this: PersistencePrivateHost & { constructor: any },
  options?: { lock?: boolean | string; allQueries?: boolean | null },
): Promise<unknown> {
  const ctor = this.constructor;
  const preloads = strictLoadedAssociations.call(this);
  // Rails: self.class.all(all_queries: all_queries).preload(...) — the
  // all_queries flag controls whether `all_queries: true` default scopes apply.
  let scope = ctor.all({ allQueries: options?.allQueries ?? null });
  if (preloads.length > 0) scope = scope.preload(...preloads);
  const constraints = _inMemoryQueryConstraintsHash.call(this);
  if (options?.lock) scope = scope.lock(options.lock);
  // Rails uses find_by! — raises RecordNotFound when not found.
  return scope.findByBang(constraints);
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
  return Object.fromEntries(constraintsList.map((col) => [col, this.readAttribute(col)]));
}

/** @internal */
export function isApplyScoping(
  this: PersistencePrivateHost,
  options?: { unscoped?: boolean },
): boolean {
  if (options?.unscoped) return false;
  const ctor = this.constructor as any;
  // Rails: default_scopes?(all_queries: true) || global_current_scope — only an
  // all_queries-flagged default scope (or a global current scope) opts a
  // mutation/reload into scoping; a plain default scope does not.
  const hasAllQueriesDefaultScope = !!ctor.defaultScopes?.some((s: any) => s.allQueries);
  return !!(hasAllQueriesDefaultScope || ScopeRegistry.globalCurrentScope(ctor));
}

/** @internal */
export function _queryConstraintsHash(this: PersistencePrivateHost): Record<string, unknown> {
  const constraintsList = queryConstraintsList.call(this.constructor as any);
  if (!constraintsList) {
    const pk = this.constructor.primaryKey as string;
    // Rails locates the row by `id_in_database`; only fall back to the live
    // attribute when the in-database accessor is unavailable. A `??` here would
    // wrongly use the new value whenever the persisted id is legitimately null.
    return { [pk]: this.idInDatabase ? this.idInDatabase() : this.id };
  }
  // Use each constraint column's persisted (`*_in_database`) value, not the live
  // attribute — when a constraint column is itself changing (e.g. a CPK foreign
  // key being assigned on append), the row must still be located by the value
  // already in the DB. `??` would fall through a legitimately-null persisted
  // value to the new, unsaved one and target a non-existent row.
  return Object.fromEntries(
    constraintsList.map((col: string) => [
      col,
      this.attributeInDatabase ? this.attributeInDatabase(col) : this.readAttribute(col),
    ]),
  );
}

/**
 * A hook to be overridden by association modules. The base implementation is a
 * no-op; `Builder::HasAndBelongsToMany` overrides it on the model prototype to
 * delete join rows. Invoked by `Base#_destroyRow` inside the destroy callback
 * chain (after before_destroy, before the row delete).
 *
 * Mirrors: ActiveRecord::Persistence#destroy_associations
 * @internal
 */
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
  time?: Temporal.Instant | null,
): Promise<number> {
  const t = time ?? Temporal.Now.instant();
  for (const attr of attributeNames) {
    this._writeAttribute(attr, t);
  }
  return _updateRow.call(this, attributeNames, "touch");
}

/** @internal */
export function _updateRow(
  this: PersistencePrivateHost,
  attributeNames: string[],
  _attemptedAction = "update",
): Promise<number> {
  const values: Record<string, unknown> = {};
  for (const name of attributeNames) {
    values[name] = this.readAttribute(name);
  }
  return _updateRecord.call(this.constructor as any, values, _queryConstraintsHash.call(this));
}

/** @internal */
export function verifyReadonlyAttribute(this: PersistencePrivateHost, name: string): void {
  if ((this.constructor as any).readonlyAttributeQ?.(name)) {
    throw new ReadonlyAttributeError(name);
  }
}

/** @internal */
export function _raiseRecordNotDestroyed(this: PersistencePrivateHost): never {
  const key = this.constructor.primaryKey;
  const keyStr = Array.isArray(key) ? key.join(", ") : key;
  // If an association destroy raised an exception, propagate that instead.
  const assocEx = (this as any)._associationDestroyException ?? null;
  if (assocEx) (this as any)._associationDestroyException = null;
  throw (
    assocEx ??
    new RecordNotDestroyed(
      `Failed to destroy ${this.constructor.name} with ${keyStr}=${String(this.id)}`,
      this as unknown as object,
    )
  );
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

// ---------------------------------------------------------------------------
// Private class helpers — mirrors ActiveRecord::Persistence::ClassMethods private block.
// ---------------------------------------------------------------------------

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
 */
export function applyDefaultAndGlobalConstraints(
  manager: { where(node: unknown): unknown },
  ctor: object,
): void {
  const defaultConstraint = buildDefaultConstraint.call(ctor as any);
  if (defaultConstraint != null) manager.where(defaultConstraint);
  const globalScope = ScopeRegistry.globalCurrentScope(ctor);
  if (globalScope) {
    const ast = globalScope._whereClause?.ast;
    if (ast != null) manager.where(ast);
  }
}

/** @internal */
export function buildDefaultConstraint(this: {
  defaultScopes?: { allQueries: boolean; scope: (rel: any) => any }[];
  defaultScoped(
    scope?: any,
    options?: { allQueries?: boolean | null },
  ): { _whereClause: { isEmpty(): boolean; ast: unknown } };
}): unknown {
  if (!this.defaultScopes?.some((s) => s.allQueries)) return undefined;
  const defaultWhereClause = this.defaultScoped(undefined, { allQueries: true })._whereClause;
  return defaultWhereClause.isEmpty() ? undefined : defaultWhereClause.ast;
}
