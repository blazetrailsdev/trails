/**
 * Persistence — class methods for creating, instantiating, and
 * configuring query constraints on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods
 */

import { InsertManager, UpdateManager, DeleteManager, Table as ArelTable } from "@blazetrails/arel";

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
