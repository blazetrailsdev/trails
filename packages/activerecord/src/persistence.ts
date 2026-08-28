/**
 * Persistence — class methods for creating, instantiating, and
 * configuring query constraints on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods
 */

import { Temporal } from "@blazetrails/date";
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
import { attributeNamesForPartialUpdates } from "./attribute-methods/dirty.js";
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
 *
 * @missingRailsCall instantiate_instance_of — PERMANENT: persistence.rb:102
 *   `instantiate_instance_of(klass, attributes, column_types, &block)`. trails'
 *   `instantiateInstanceOf` (persistence.ts:2174) passes its third argument as
 *   `_instantiate`'s `columnTypes`, which known columns IGNORE; the public
 *   `instantiate` entry must pass its `types` map as `overrideTypes` so it beats
 *   the schema cast type (Rails' `LazyAttributeHash` `additional_types[name] ||
 *   types[name]`). Routing through the helper would silently drop that override
 *   — see the comment at persistence.ts:161-167.
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
  // The public `instantiate(attributes, types)` entry supplies an explicit
  // per-attribute `types` map that must override the schema cast type even for a
  // known column — Rails' `LazyAttributeHash` resolves `additional_types[name] ||
  // types[name]`. Pass it as `overrideTypes` (not the result-set `columnTypes`
  // slice, which the query path threads through `_instantiate` directly and which
  // is ignored for known columns). Thread the block so it runs before the
  // find/initialize callbacks (Rails' `init_with_attributes`).
  return klass._instantiate(
    attributes,
    block,
    undefined,
    columnTypes as Record<string, { deserialize(value: unknown): unknown }>,
  );
}

/**
 * Mirrors: ActiveRecord::Persistence::ClassMethods#query_constraints
 */
export function queryConstraints(this: PersistenceHost, ...columns: string[]): void {
  if (columns.length === 0) {
    throw new ArgumentError("You must specify at least one column to be used in querying");
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
    // Rails: `im.insert(values.transform_keys { |name| arel_table[name] })`
    // (persistence.rb:247).
    im.insert(entries.map(([col, val]) => [arelTable.get(col), val]));
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
 * A TS module cannot export two bindings called `_updateRecord`, and Rails has
 * both `Persistence::ClassMethods#_update_record` (this one) and the instance
 * `Persistence#_update_record` below in the same file. The class-level half
 * keeps the free export — that is the name `parity:api` and `lint-deps` resolve
 * against, and this is the half Rails builds the `Arel::UpdateManager` in — and
 * the instance half rides the `InstanceMethods` grouping the port already uses
 * for Rails' instance-side modules (timestamp.ts, touch-later.ts).
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

  const arelTable: ArelTable = (this as any).arelTable;
  const um = new UpdateManager();
  um.table(arelTable);
  // Rails: `um.set(values.transform_keys { |name| arel_table[name] })`.
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
  // `_assign_attribute`'s no-setter arm (attribute_assignment.rb:70-74).
  attributeWriterMissing(name: string, value: unknown): void;
}

type TouchOption = boolean | string | string[];

/** Class-level updateCounters + dirty-tracking needed by incrementBang. */
interface CounterBangRecord extends AttributeIO {
  id: unknown;
  attributeInDatabase(name: string): unknown;
  clearAttributeChange(name: string): void;
  constructor: {
    updateCounters(id: unknown, counters: CounterCacheCounters): Promise<number>;
  };
}

/** Save path used by toggleBang. */
interface ToggleBangRecord extends AttributeIO {
  updateAttribute(name: string, value: unknown): Promise<boolean | undefined>;
}

/** Mirrors: ActiveRecord::Persistence#increment */
export function increment<T extends AttributeIO>(this: T, attribute: string, by: number = 1): T {
  // Rails increments through `self[attribute]`, which resolves attribute
  // aliases (e.g. `available_credit` → `credit_limit`) before touching state.
  const name = resolveAttributeAlias(this, attribute);
  const current = Number(this.readAttribute(name)) || 0;
  this.writeAttribute(name, current + by);
  return this;
}

/** Resolves an attribute alias to its underlying column via `attributeAliases`. */
function resolveAttributeAlias(record: object, attribute: string): string {
  const aliases = (record.constructor as { attributeAliases?: Record<string, string> })
    .attributeAliases;
  return aliases?.[attribute] ?? attribute;
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
  // Resolve the alias once so the in-memory increment, the delta computation,
  // the `updateCounters` SET clause, and the dirty-clear all target the real
  // column (Rails resolves via `self[attribute]` / `_write_attribute`).
  attribute = resolveAttributeAlias(this, attribute);
  this.increment(attribute, by);
  // Rails: `change = public_send(attribute) - public_send(:"#{attribute}_in_database")`
  // — persist the delta between the (already-incremented) in-memory value and
  // the value last loaded from the DB, not the raw `by`. They coincide for a
  // bare `increment!`, but Rails' chained `increment(x).increment!(x)` form
  // relies on the prior in-memory `increment` being folded into the delta.
  const change =
    Number(this.readAttribute(attribute)) - (Number(this.attributeInDatabase(attribute)) || 0);
  await this.constructor.updateCounters(this.id, { [attribute]: change, touch: options.touch });
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
    await runCallbacks(this, "touch");
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
  return this.toggle(attribute).updateAttribute(attribute, this.readAttribute(attribute));
}

// ---------------------------------------------------------------------------
// update / update! / delete — instance mutators.
//   update / update!  → write attrs, delegate to save / save!
//   delete            → callback-free DELETE + mark destroyed/frozen
// Mirrors ActiveRecord::Persistence#update, #update!, #delete.
// ---------------------------------------------------------------------------

interface UpdateRecord extends AttributeIO {
  save(options?: { validate?: boolean }): Promise<boolean | undefined>;
  saveBang(options?: { validate?: boolean }): Promise<true | undefined>;
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
  attributes: Record<string, unknown>,
): Promise<boolean | undefined> {
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    // `assign_attributes(attributes); save` (persistence.rb:563-570).
    await self.assignAttributes(attributes);
    return self.save() as Promise<boolean | undefined>;
  }) as Promise<boolean | undefined>;
}

/**
 * Mirrors: ActiveRecord::Persistence#update! — assign + save!. Raises
 * `RecordInvalid` on validation failure.
 */
export async function updateBang<T extends UpdateRecord>(
  this: T,
  attributes: Record<string, unknown>,
): Promise<true | undefined> {
  const self = this as any;
  return withTransactionReturningStatus.call(self, async () => {
    // `assign_attributes(attributes); save!` (persistence.rb:576-579).
    await self.assignAttributes(attributes);
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
    // `c.delete(dm, "#{self} Destroy")` (persistence.rb:294-296) — the public
    // statement method, which is where `dirties_query_cache` is wired
    // (query_cache.rb:13-15). "Delete" is the operation-name label (Rails' log
    // subscriber name), not raw SQL.
    const adapter =
      threadedConnectionFor(ctor as unknown as typeof import("./base.js").Base) ?? ctor.connection;
    await adapter.delete(dm, "Delete");
  }
  this._destroyed = true;
  this._previouslyNewRecord = false;
  this.freeze();
  return this;
}

// ---------------------------------------------------------------------------
// save / save! / destroy / destroy! — the callback- and transaction-wrapped
// entry points. They rely on Base-provided internal helpers/state
// (_createOrUpdate, _destroyRow, _touchRecord) which remain `private` on Base; the
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
  _attributes: { writeCastValue(key: string, val: unknown): void };
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  errors: { any: boolean };
  isValid(context?: ValidationContextArg): Promise<boolean>;
  constructor: {
    name: string;
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
  block?: (record: T) => void,
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
  const self = this as any;
  const ctor = this.constructor;

  // Mirrors the full Rails module layering: `Transactions#save {
  // Validations#save { perform_validations; Persistence#save → create_or_update
  // } }` (transactions.rb:360, validations.rb:47). Two orderings fall out of it,
  // and both are load-bearing:
  //
  //  1. `perform_validations` — and every `before_validation` it runs — is
  //     *inside* the transaction, so a cancelling filter's DB write rolls back
  //     with it and a `throw :abort` halts before the validators ever run (no
  //     errors recorded). transactions_test.rb:714.
  //  2. Validations run *before* the readonly/destroyed guards, which live in
  //     `create_or_update`. So a record that is both destroyed and invalid
  //     raises RecordInvalid, not RecordNotSaved.
  try {
    return (await withTransactionReturningStatus.call(self, async () => {
      // Resolve `belongs_to ..., default:` blocks before validation. Rails
      // registers these on before_validation
      // (builder/belongs_to.rb#add_default_callbacks) so a required
      // association's presence validation sees the defaulted FK. The block may
      // be async (e.g. `() => Developer.first()`), so on the save path we
      // resolve it here — a pre-validation pass — before running the chain.
      // Gated on `validate !== false`: Rails skips perform_validations (and thus
      // every before_validation callback, including this default) when
      // `validate: false` (validations.rb:47-49), so the default must not fire
      // on that path. `_belongsToDefaultsApplied` then suppresses the in-chain
      // before_validation callback so the block runs exactly once per save (it
      // would otherwise re-fire when the pre-pass left the reader nil).
      if (options?.validate !== false && typeof self._runBelongsToDefaults === "function") {
        await self._runBelongsToDefaults();
        self._belongsToDefaultsApplied = true;
      }
      let validationsPassed: boolean;
      try {
        validationsPassed = await performValidations.call(this, options);
      } finally {
        // Clear even if a validation callback throws, so a later standalone
        // `valid?` on this instance still fires the belongs_to default.
        self._belongsToDefaultsApplied = false;
      }
      if (!validationsPassed) return false;
      // Mirrors ActiveRecord::Persistence#create_or_update: readonly raises
      // first, then `return false if destroyed?`. `save` returns false (it does
      // not raise) for a destroyed record; `save!` turns that false into
      // RecordNotSaved("Failed to save the record"). See ordering (2) above.
      if (this._readonly) {
        throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
      }
      if (this._destroyed) {
        return false;
      }

      // Auto-set STI type column on new records
      if (this._newRecord && isStiSubclass(ctor)) {
        const col = getStiBase(ctor).inheritanceColumn;
        if (col && !this._readAttribute(col)) {
          this._attributes.writeCastValue(col, this.constructor.name);
        }
      }

      // Rails: `create_or_update(**options, &block)` (persistence.rb:390-408).
      // `touch:` is consumed by Timestamp#create_or_update (timestamp.rb:125-128).
      return self.createOrUpdate(options?.touch ?? true, block);
    })) as boolean | undefined;
  } catch (e) {
    // Mirrors Rails' `rescue ActiveRecord::RecordInvalid` in save — autosave
    // callbacks raise RecordInvalid when a child fails to save. The transaction
    // has already rolled back at this point.
    if (e instanceof RecordInvalid) return false;
    throw e;
  }
}

/** Mirrors: ActiveRecord::Base#save! — `create_or_update(**options) || raise`. */
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
  isReadonly(): boolean;
  constructor: { name: string };
}

/** Mirrors: ActiveRecord::Base#destroy */
export async function destroy<T extends DestroyRecord>(this: T): Promise<T | false> {
  if (this.isReadonly()) {
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
// Instance read-helpers — slice / valuesAt.
// Mirror ActiveRecord::Base#slice / #values_at.
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
  name = String(name);
  verifyReadonlyAttribute.call(this as unknown as PersistencePrivateHost, name);
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
  if (this.isReadonly()) {
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

  // Capture the row-locating constraints *before* applying attrs (Rails:
  // `update_constraints = _query_constraints_hash` precedes `write_cast_value`).
  // `_query_constraints_hash` keys each query_constraints_list column (or the
  // primary key when none are declared) to its `*_in_database` value, so a model
  // with `query_constraints` updates by those persisted columns — not the PK —
  // and a record updating a constraint/PK column still targets its existing row.
  const updateConstraints = _queryConstraintsHash.call(this as unknown as PersistencePrivateHost);

  // Cast values through their declared attribute types (no dirty tracking —
  // this path bypasses writeAttribute deliberately) and collect the cast
  // values for the UPDATE's SET clause. Reject unknown keys up-front so a
  // malicious/invalid key can't sneak an un-schema'd identifier into the
  // SQL identifier position. Primary-key columns are implicit on Base and
  // aren't always in `attribute_types`, so allow them through.
  const pkCols = Array.isArray(ctor.primaryKey) ? ctor.primaryKey : [ctor.primaryKey];
  // Rails resolves attribute aliases before writing (update_columns flows
  // through the alias-aware attribute layer), so a model aliasing e.g.
  // updated_at → legacy_updated_at can be updated by its public name.
  const aliases: Record<string, string> =
    (
      ctor as unknown as {
        attributeAliases?: Record<string, string>;
      }
    ).attributeAliases ?? {};
  // Rails resolves aliases and verifies every key against attr_readonly up
  // front (`transform_keys { verify_readonly_attribute }`) before writing any
  // value, so a readonly column raises without mutating the earlier keys.
  const resolvedEntries = Object.entries(attrs).map(
    ([rawKey, value]) => [aliases[rawKey] ?? rawKey, value] as const,
  );
  for (const [key] of resolvedEntries) {
    verifyReadonlyAttribute.call(this as unknown as PersistencePrivateHost, key);
  }

  const setPairs: Array<[unknown, unknown]> = [];
  const updatedKeys: string[] = [];
  // Rails casts through `@attributes.write_cast_value` (persistence.rb:625),
  // i.e. the `_default_attributes` type — the pending-decorator chain replayed
  // — so `attribute_types` is also the set a key is known against, and a
  // `serialize` / `encrypts` decoration applies here too.
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
  // Mirrors Rails' update_columns → _update_record: an all_queries default
  // scope (and any global current scope) is stacked onto the UPDATE constraints.
  applyDefaultAndGlobalConstraints(um as never, ctor as never);

  const adapter =
    (threadedConnectionFor(ctor as unknown as typeof import("./base.js").Base) as
      | typeof ctor.connection
      | null) ?? ctor.connection;
  // `c.update(um, "#{self} Update")` (persistence.rb:277-279) — the public
  // statement method `dirties_query_cache` is wired on (query_cache.rb:13-15).
  const affectedRows = await adapter.update(um, "Update Columns");

  // Rails clears the change only for the updated columns (`clear_attribute_change(k)`),
  // leaving any other pending in-memory changes dirty — not a whole-record
  // `changes_applied`.
  const clearer = this as unknown as { clearAttributeChange?(name: string): void };
  if (typeof clearer.clearAttributeChange === "function") {
    for (const k of updatedKeys) clearer.clearAttributeChange(k);
  } else {
    this.changesApplied();
  }
  return affectedRows === 1;
}

// ---------------------------------------------------------------------------
// reload — refetch from DB and reset in-memory state.
// ---------------------------------------------------------------------------

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

  // Rails swaps the whole attribute set (`@attributes = fresh.@attributes`),
  // then unconditionally clears the new-record flags; dirty tracking
  // re-baselines on the fresh values.
  this._attributes = fresh._attributes;
  // Reconcile alias readers against the swapped-in attribute set: a plain
  // reload drops any prior select alias, so the stale getter is removed (Rails'
  // `@attributes.key?` gate would raise NoMethodError post-reload).
  defineDynamicSelectReaders(this as unknown as import("./base.js").Base);
  this._newRecord = false;
  this._previouslyNewRecord = false;
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;

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
  return this;
}

// ---------------------------------------------------------------------------
// dup / clone / becomes / becomes! — shape-preserving copies & class swaps.
// ---------------------------------------------------------------------------

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
  _mutationsFromDatabase: unknown;
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
  K extends new (
    attrs: Record<string, unknown>,
    initBlock?: (record: BecomesRecord) => void,
  ) => BecomesRecord,
>(this: T, klass: K): InstanceType<K> {
  // Rails: `became = klass.allocate` — construct the exact target class,
  // bypassing `new`'s STI dispatch so becomes(base) is never re-resolved to
  // the subclass named by the inheritance column's default
  // (persistence_test.rb#test_becomes_default_sti_subclass).
  // Store the class itself, not a boolean: the constructor only skips dispatch
  // when `new.target` *is* this class, so an inherited static never suppresses
  // a nested `new <subclass>()`.
  const ctor = klass as unknown as {
    _suppressStiNewDispatch?: unknown;
    _suppressAbstractCheck?: boolean;
  };
  const hadOwn = Object.prototype.hasOwnProperty.call(ctor, "_suppressStiNewDispatch");
  const prev = ctor._suppressStiNewDispatch;
  ctor._suppressStiNewDispatch = klass;
  // Rails allocates with `klass.allocate`, which never goes through
  // Inheritance::ClassMethods#new — so the abstract-class / Base guard that
  // `new` enforces (inheritance.rb:57) does not apply to becomes().
  const hadOwnAbstract = Object.prototype.hasOwnProperty.call(ctor, "_suppressAbstractCheck");
  const prevAbstract = ctor._suppressAbstractCheck;
  ctor._suppressAbstractCheck = true;
  let instance: InstanceType<K>;
  try {
    // Rails passes the variable swap as the `initialize` block, which runs
    // BEFORE `_run_initialize_callbacks` — so after_initialize hooks on the
    // target class observe this record's (shared) attributes, not the
    // throwaway construction-time set.
    instance = new klass({}, (becoming) => {
      // Mirrors Rails: `@attributes.reverse_merge!(becoming.@attributes)` — the
      // new class's default attributes fill in any keys this record is missing
      // (e.g. attributes declared only on the target subclass), then both
      // objects share this record's (now merged) attribute set.
      this._attributes.reverseMergeBang(becoming._attributes);
      becoming._attributes = this._attributes;
      becoming._newRecord = this._newRecord;
      becoming._destroyed = this._destroyed;
      // Mirrors: `becoming.instance_variable_set(:@mutations_from_database,
      // @mutations_from_database ||= nil)` (persistence.rb:493).
      becoming._mutationsFromDatabase = this._mutationsFromDatabase ?? null;
      // Rails: `becoming.errors.copy!(errors)` — propagate pending validation
      // errors across the class swap. Noop if the errors object doesn't expose
      // a `copy!` method (defensive for hosts that stub errors differently).
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
  const inheritanceCol = base.inheritanceColumn;
  if (inheritanceCol) {
    // Mirrors Rails: `became.public_send("#{inheritance_column}=", sti_type)` —
    // route through the public writer so the change is dirty-tracked and a
    // subsequent partial UPDATE actually persists the new STI type.
    // `sti_type` is `nil` for an STI base class (descends_from_active_record?).
    const value = klass.isDescendsFromActiveRecord() ? null : stiName(klass);
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

/** Host surface for private creation/update helpers in persistence.ts. */
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

/** Host surface for the Persistence layer of the create/update super chain. */
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

/**
 * Mirrors `ActiveRecord::Persistence#init_internals` (persistence.rb:814-818).
 *
 * @internal
 */
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
  // Rails: self.class.all(all_queries: all_queries).preload(...) — the
  // all_queries flag controls whether `all_queries: true` default scopes apply.
  let scope = ctor.all({ allQueries: options?.allQueries ?? null });
  if (preloads.length > 0) scope = scope.preload(...preloads);
  if (options?.lock) scope = scope.lock(options.lock);
  // Rails uses find_by! — raises RecordNotFound when not found.
  return scope.findByBang(_inMemoryQueryConstraintsHash.call(this));
}

/**
 * @internal
 *
 * @missingRailsCall attribute — PERMANENT: persistence.rb:842 `index_with { |column_name|
 *   attribute(column_name) }` — Rails reads the PRIVATE `attribute` reader;
 *   trails' equivalent is the public `readAttribute` (persistence.ts:1846),
 *   since the port has no private/public attribute-reader pair. Same value,
 *   different spelling; tracked.
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
  // Rails: default_scopes?(all_queries: true) || global_current_scope — only an
  // all_queries-flagged default scope (or a global current scope) opts a
  // mutation/reload into scoping; a plain default scope does not.
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
  // Use each constraint column's persisted (`*_in_database`) value, not the live
  // attribute — when a constraint column is itself changing (e.g. a CPK foreign
  // key being assigned on append), the row must still be located by the value
  // already in the DB. `??` would fall through a legitimately-null persisted
  // value to the new, unsaved one and target a non-existent row.
  return Object.fromEntries(
    constraintsList.map((columnName: string) => [
      columnName,
      this.attributeInDatabase
        ? this.attributeInDatabase(columnName)
        : this.readAttribute(columnName),
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

/**
 * The bottom of the update super chain: the UPDATE, `@previously_new_record =
 * false`, then the `save(&block)` yield.
 *
 * Mirrors: ActiveRecord::Persistence#_update_record (persistence.rb:900-916)
 * @internal
 */
async function instanceUpdateRecord(
  this: PersistenceInstanceChainHost,
  block?: (record: any) => void,
): Promise<boolean> {
  // Rails AttributeMethods::Dirty#_update_record's default argument
  // (dirty.rb:233) — with partial_updates off it is every attribute name.
  let attributeNames = attributeNamesForPartialUpdates.call(this as any);
  attributeNames = attributesForUpdate.call(this as any, attributeNames);

  if (attributeNames.length === 0) {
    (this as any)._triggerUpdateCallback = true;
  } else {
    const affectedRows: number = await (this as any)._updateRow(attributeNames);
    // A stale update whose WHERE matched no row (row deleted by another
    // instance earlier in the transaction) leaves the flag false, so
    // after_update_commit / after_rollback(on: :update) don't fire.
    (this as any)._triggerUpdateCallback = affectedRows === 1;
  }

  this._previouslyNewRecord = false;
  // Rails yields here (persistence.rb:912-916).
  block?.(this);
  return true;
}

/**
 * The bottom of the create super chain: the INSERT, `@new_record = false` /
 * `@previously_new_record = true`, then the `save(&block)` yield.
 *
 * Mirrors: ActiveRecord::Persistence#_create_record (persistence.rb:918-942)
 * @internal
 */
export async function _createRecord(
  this: PersistenceInstanceChainHost,
  attributeNames?: string[],
  block?: (record: any) => void,
): Promise<unknown> {
  const ctor = this.constructor;
  // Initialize the locking column from its schema default so a new record's
  // lock value is never nil at insert time. Rails reflects the column
  // (default 0) into every new record's attributes at class load, so the
  // unconditional union threaded by LockingOptimistic._createRecord
  // (Locking::Optimistic#_create_record, optimistic.rb:78-82) below always
  // carries a concrete value.
  // trails loads schema lazily, so a record built before the column was
  // reflected (e.g. a model `new`'d before its first schema load) has no
  // locking attribute at all — the union would then add the column name but
  // `valuesForDatabase` emits nothing for it, writing an explicit NULL into a
  // NOT NULL lock column. Seed it here, once reflection has certainly run for
  // the INSERT, to its reflected default (LockingType.cast coerces null → 0).
  // The INSERT value reads straight from `valuesForDatabase()` below, so this
  // seed is what actually carries the 0 into the row.
  if (ctor.lockingEnabled) {
    const lockCol = ctor.lockingColumn;
    const defaults = ctor._defaultAttributes();
    if (defaults.isKey(lockCol) && this._readAttribute(lockCol) == null) {
      this._writeAttribute(lockCol, defaults.getAttribute(lockCol).value);
    }
  }

  const attrs = this._attributes.valuesForDatabase();
  // Rails create super chain, threading attribute_names down to
  // attributes_for_create. The default is `self.attribute_names`
  // (attribute_methods.rb:333-334), narrowed to the declared columns; an
  // explicit `attributeNames` arg overrides it
  // (Persistence#_create_record(attribute_names)).
  const selfNames =
    attributeNames ?? this.attributeNames().filter((k) => Object.hasOwn(ctor.attributeTypes(), k));
  // Rails AttributeMethods::Dirty#_create_record default arg:
  // attribute_names_for_partial_inserts (dirty.rb:207-217), which reads
  // `changed_attribute_names_to_save` — derived from the `Attribute` graph, so
  // a new record's assignments are already in it.
  let names: string[];
  if (ctor.partialInserts) {
    const changed = (this as any).changedAttributeNamesToSave as string[] | undefined;
    names = changed ?? selfNames;
  } else {
    names = selfNames.filter((name) => {
      const col = ctor.columnForAttribute?.(name);
      const autoPopulated = col?.isAutoPopulated?.() ?? col?.defaultFunction != null;
      return !(autoPopulated && !(this as any).attributeChanged?.(name));
    });
  }
  // Rails Locking::Optimistic#_create_record: attribute_names |= [locking_column]
  // — "We always want to persist the locking version, even if we don't detect a
  // change from the default, since the database might have no default." Threaded
  // through the now-wired mirror so the union lives in the locking layer
  // (optimistic.rb), not in the generic attributes_for_create.
  names = LockingOptimistic._createRecord.call(this as any, names, (n: string[]) => n) as string[];
  // Rails Persistence#attributes_for_create: & column_names, drop nil pk, drop virtual.
  const columns = attributesForCreate.call(this as any, names);

  // Rails wraps the INSERT in `self.class.with_connection` (persistence.rb:923)
  // and binds the yielded connection rather than the deprecated `.connection`
  // getter, so the write never flips the lease permanent.
  await withConnection.call(ctor as unknown as typeof Base, async (connection) => {
    // Rails Persistence#_create_record threads `_returning_columns_for_insert`
    // into `_insert_record` and zips EVERY auto-populated column
    // (auto-increment PK plus DB-computed defaults) off the RETURNING row.
    // Pass the full list to adapters that can emit RETURNING (PG, SQLite
    // >= 3.35, MariaDB) so those non-PK columns come back on `create`.
    // Adapters that can't (MySQL 8, older SQLite) surface only the scalar
    // generated id, so leave `returning` null and fall back to writing that
    // id into the first still-unset returning column below.
    const returningColumns = await ctor._returningColumnsForInsert(connection);
    const supportsReturning =
      (await (
        connection as { supportsInsertReturning?(): Promise<boolean> }
      ).supportsInsertReturning?.()) ?? false;
    const returning = supportsReturning && returningColumns.length > 0 ? returningColumns : null;

    // Route through the ported `_insert_record` class method
    // (ActiveRecord::Persistence::ClassMethods#_insert_record) rather than a
    // bespoke InsertManager build. With a `returning` list it yields the
    // returning-column values array; without one, the scalar generated id.
    const returningValues = await _insertRecord.call(
      ctor,
      connection,
      attributesWithValues.call(this as any, columns),
      returning,
    );

    // Write a generated value into a column only when still unset. The
    // `!_read_attribute` guard is truthy for nil AND false (but not 0 / "").
    const writeBack = (column: string, value: unknown): boolean => {
      if (value == null) return false;
      const current = this._readAttribute(column);
      if (current != null && current !== false) return false;
      const type = ctor.typeForAttribute?.(column);
      this._writeAttribute(column, type?.deserialize ? type.deserialize(value) : value);
      return true;
    };

    if (returning) {
      // Explicit RETURNING: the adapter returns values positionally matched to
      // `returning`. Mirrors `_create_record`'s
      // `returning_columns.zip(returning_values)` — every auto-populated
      // column (PK plus DB-computed defaults) is written back.
      const returnValues = Array.isArray(returningValues) ? returningValues : [returningValues];
      returning.forEach((column: string, i: number) => writeBack(column, returnValues[i]));
    } else {
      // No explicit RETURNING (composite-PK / id-less): the adapter surfaces a
      // single scalar. Write it into the first still-unset returning column —
      // e.g. a composite PK [shop_id, id] where shop_id is supplied.
      const insertedId = Array.isArray(returningValues) ? returningValues[0] : returningValues;
      for (const column of returningColumns) {
        if (writeBack(column, insertedId)) break;
      }
    }
  });
  // After INSERT, reset lock_version to a FromDatabase attribute carrying the
  // actual serialized value (e.g. 0). This mirrors Rails' behavior: during INSERT
  // @value_for_database is memoized to 0, so changes_applied! → forgetting_assignment
  // produces from_database(0), not from_database(nil). Without this, freshly-created
  // records are indistinguishable from NULL-in-DB records when building the WHERE
  // clause for subsequent UPDATE/DELETE.
  if (ctor.lockingEnabled) {
    const lockCol = ctor.lockingColumn;
    const writtenLockValue = attrs[lockCol] ?? null;
    this._attributes.writeFromDatabase(lockCol, writtenLockValue);
  }

  this._previouslyNewRecord = true;
  this._newRecord = false;
  // Rails yields here (persistence.rb:936-940).
  block?.(this);
  // Rails returns `id` (persistence.rb:941); `create_or_update`'s
  // `result != false` (persistence.rb:895) is where it becomes a boolean, which
  // in trails is Callbacks#_createRecord (callbacks.ts).
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

/**
 * Rails' instance-side `Persistence` members that collide by name with the
 * `ClassMethods` half of the same file — see {@link instanceUpdateRecord}.
 */
export const InstanceMethods = {
  _updateRecord: instanceUpdateRecord,
};
