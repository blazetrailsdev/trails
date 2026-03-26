/**
 * Query methods mixed into Relation: where, order, group, having,
 * limit, offset, joins, includes, select, distinct, etc.
 *
 * Mirrors: ActiveRecord::QueryMethods
 */
export class QueryMethods {
  static readonly MULTI_VALUE_METHODS = [
    "includes",
    "eagerLoad",
    "preload",
    "select",
    "group",
    "order",
    "joins",
    "leftOuterJoins",
    "references",
    "extending",
    "unscope",
    "optimizerHints",
    "annotate",
  ] as const;

  static readonly SINGLE_VALUE_METHODS = [
    "limit",
    "offset",
    "lock",
    "readonly",
    "reordering",
    "distinct",
    "strictLoading",
  ] as const;
}

/**
 * Interface for the scope that WhereChain delegates to.
 */
export interface WhereChainScope<R> {
  whereNot(conditions: Record<string, unknown>): R;
  whereAssociated(...associationNames: string[]): R;
  whereMissing(...associationNames: string[]): R;
}

/**
 * Provides chainable where.not(), where.associated(), where.missing().
 * Returned by `Relation#where()` when called with no arguments.
 *
 * Mirrors: ActiveRecord::QueryMethods::WhereChain
 */
export class WhereChain<R = any> {
  private _scope: WhereChainScope<R>;

  constructor(scope: WhereChainScope<R>) {
    this._scope = scope;
  }

  not(conditions: Record<string, unknown>): R {
    return this._scope.whereNot(conditions);
  }

  associated(...associationNames: string[]): R {
    return this._scope.whereAssociated(...associationNames);
  }

  missing(...associationNames: string[]): R {
    return this._scope.whereMissing(...associationNames);
  }
}

/**
 * Internal node representing a CTE-based JOIN.
 *
 * Mirrors: ActiveRecord::QueryMethods::CTEJoin
 */
export class CTEJoin {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }
}
