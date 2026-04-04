/**
 * Persistence — class methods for creating, instantiating, and
 * configuring query constraints on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Persistence::ClassMethods
 */

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
