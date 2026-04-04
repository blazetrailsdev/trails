/**
 * Query methods mixed into Relation: where, order, group, having,
 * limit, offset, joins, includes, select, distinct, etc.
 *
 * Mirrors: ActiveRecord::QueryMethods
 */
import { Nodes } from "@blazetrails/arel";
import { FromClause } from "./from-clause.js";
import { WhereClause } from "./where-clause.js";
import { IrreversibleOrderError } from "../errors.js";
import { sanitizeSqlArray } from "../sanitization.js";
import { quote } from "../connection-adapters/abstract/quoting.js";

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

// ---------------------------------------------------------------------------
// Host interface: the shape of `this` for bang methods mixed into Relation.
// Uses TS `private` keyword fields which are accessible at runtime.
// ---------------------------------------------------------------------------
interface QueryMethodsHost {
  _whereClause: WhereClause;
  _orderClauses: Array<string | [string, "asc" | "desc"]>;
  _rawOrderClauses: string[];
  _limitValue: number | null;
  _offsetValue: number | null;
  _selectColumns: any[] | null;
  _isDistinct: boolean;
  _distinctOnColumns: string[];
  _groupColumns: string[];
  _orRelations: any[];
  _havingClauses: string[];
  _isNone: boolean;
  _lockValue: string | null;
  _joinClauses: Array<{ type: "inner" | "left"; table: string; on: string }>;
  _rawJoins: string[];
  _includesAssociations: string[];
  _preloadAssociations: string[];
  _eagerLoadAssociations: string[];
  _isReadonly: boolean;
  _isStrictLoading: boolean;
  _annotations: string[];
  _optimizerHints: string[];
  _fromClause: FromClause;
  _createWithAttrs: Record<string, unknown>;
  _extending: Array<Record<string, Function>>;
  _ctes: Array<{ name: string; sql: string; recursive: boolean }>;
  _skipPreloading: boolean;
  _skipQueryCache: boolean;
  _modelClass: any;
  _castWhereValue(key: string, value: unknown): unknown;
}

// ---------------------------------------------------------------------------
// Bang variants — mutate `this` in place, return `this`.
// In Rails, every query method `foo` has a `foo!` that mutates self.
// The non-bang version calls `spawn.foo!` (clone then mutate).
// ---------------------------------------------------------------------------

function includesBang(this: QueryMethodsHost, ...associations: string[]): any {
  this._includesAssociations.push(...associations);
  return this;
}

function eagerLoadBang(this: QueryMethodsHost, ...associations: string[]): any {
  this._eagerLoadAssociations.push(...associations);
  return this;
}

function preloadBang(this: QueryMethodsHost, ...associations: string[]): any {
  this._preloadAssociations.push(...associations);
  return this;
}

function referencesBang(this: QueryMethodsHost, ..._tables: string[]): any {
  return this;
}

function withBang(this: QueryMethodsHost, ...ctes: Array<Record<string, any>>): any {
  for (const cte of ctes) {
    for (const [name, query] of Object.entries(cte)) {
      const sql = typeof query === "string" ? query : query.toSql();
      this._ctes.push({ name, sql, recursive: false });
    }
  }
  return this;
}

function withRecursiveBang(this: QueryMethodsHost, ...ctes: Array<Record<string, any>>): any {
  for (const cte of ctes) {
    for (const [name, query] of Object.entries(cte)) {
      const sql = typeof query === "string" ? query : query.toSql();
      this._ctes.push({ name, sql, recursive: true });
    }
  }
  return this;
}

function reselectBang(this: QueryMethodsHost, ...columns: any[]): any {
  this._selectColumns = columns.map((c: any) =>
    typeof c === "object" && c !== null && "value" in c ? c : String(c),
  );
  return this;
}

function groupBang(this: QueryMethodsHost, ...columns: string[]): any {
  this._groupColumns.push(...columns);
  return this;
}

function regroupBang(this: QueryMethodsHost, ...columns: string[]): any {
  this._groupColumns = [...columns];
  return this;
}

function orderBang(
  this: QueryMethodsHost,
  ...args: Array<string | Record<string, "asc" | "desc">>
): any {
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (typeof arg === "string") {
      const next = args[i + 1];
      if (typeof next === "string" && /^(asc|desc)$/i.test(next)) {
        this._orderClauses.push([arg, next.toLowerCase() as "asc" | "desc"]);
        i += 2;
        continue;
      }
      this._orderClauses.push(arg);
    } else {
      for (const [col, dir] of Object.entries(arg)) {
        this._orderClauses.push([col, dir]);
      }
    }
    i++;
  }
  return this;
}

function reorderBang(
  this: QueryMethodsHost,
  ...args: Array<string | Record<string, "asc" | "desc">>
): any {
  this._orderClauses = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      this._orderClauses.push(arg);
    } else {
      for (const [col, dir] of Object.entries(arg)) {
        this._orderClauses.push([col, dir]);
      }
    }
  }
  return this;
}

function unscopeBang(this: QueryMethodsHost, ...types: Array<string>): any {
  for (const type of types) {
    switch (type) {
      case "where":
        this._whereClause = WhereClause.empty();
        break;
      case "order":
        this._orderClauses = [];
        break;
      case "limit":
        this._limitValue = null;
        break;
      case "offset":
        this._offsetValue = null;
        break;
      case "group":
        this._groupColumns = [];
        break;
      case "having":
        this._havingClauses = [];
        break;
      case "select":
        this._selectColumns = null;
        break;
      case "distinct":
        this._isDistinct = false;
        break;
      case "lock":
        this._lockValue = null;
        break;
      case "readonly":
        this._isReadonly = false;
        break;
      case "from":
        this._fromClause = FromClause.empty();
        break;
    }
  }
  return this;
}

function joinsBang(this: QueryMethodsHost, ...args: string[]): any {
  for (const arg of args) {
    this._rawJoins.push(arg);
  }
  return this;
}

function leftOuterJoinsBang(this: QueryMethodsHost, ...args: string[]): any {
  for (const arg of args) {
    this._rawJoins.push(arg);
  }
  return this;
}

function whereBang(this: QueryMethodsHost, opts: any, ...rest: unknown[]): any {
  if (typeof opts === "string") {
    let sql: string;
    if (
      rest.length === 1 &&
      typeof rest[0] === "object" &&
      rest[0] !== null &&
      !Array.isArray(rest[0])
    ) {
      // Named binds: where("age > :min", { min: 18 })
      sql = opts;
      const namedBinds = rest[0] as Record<string, unknown>;
      for (const [name, value] of Object.entries(namedBinds)) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        sql = sql.replace(new RegExp(`:${escaped}\\b`, "g"), quote(value));
      }
    } else if (rest.length > 0) {
      // Positional binds: where("age > ?", 18)
      sql = sanitizeSqlArray(opts, ...rest);
    } else {
      sql = opts;
    }
    this._whereClause.rawClauses.push(sql);
  } else if (opts instanceof Nodes.Node) {
    this._whereClause.arelNodes.push(opts);
  } else if (typeof opts === "object" && opts !== null) {
    const castConditions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts as Record<string, unknown>)) {
      castConditions[key] = Array.isArray(value)
        ? value.map((v) => this._castWhereValue(key, v))
        : this._castWhereValue(key, value);
    }
    this._whereClause.conditions.push(castConditions);
  }
  return this;
}

function invertWhereBang(this: QueryMethodsHost): any {
  this._whereClause = this._whereClause.invert();
  return this;
}

function andBang(this: QueryMethodsHost, other: any): any {
  this._whereClause = this._whereClause.merge(other._whereClause);
  return this;
}

function orBang(this: QueryMethodsHost, other: any): any {
  this._orRelations = [...this._orRelations, other];
  return this;
}

function havingBang(this: QueryMethodsHost, condition: string | Record<string, unknown>): any {
  if (typeof condition === "string") {
    this._havingClauses.push(condition);
  } else {
    for (const [key, value] of Object.entries(condition)) {
      this._havingClauses.push(`${key} = ${quote(value)}`);
    }
  }
  return this;
}

function limitBang(this: QueryMethodsHost, value: number | null): any {
  if (value == null) {
    this._limitValue = null;
    return this;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 0) {
    throw new Error(`Invalid limit value: ${String(value)}`);
  }
  this._limitValue = num;
  return this;
}

function offsetBang(this: QueryMethodsHost, value: number): any {
  this._offsetValue = value;
  return this;
}

function lockBang(this: QueryMethodsHost, locks: string | boolean = true): any {
  if (typeof locks === "string") {
    this._lockValue = locks;
  } else {
    this._lockValue = locks ? "FOR UPDATE" : null;
  }
  return this;
}

function noneBang(this: QueryMethodsHost): any {
  if (!this._isNone) {
    this._whereClause.rawClauses.push("1=0");
    this._isNone = true;
  }
  return this;
}

function isNullRelation(this: QueryMethodsHost): boolean {
  return this._isNone;
}

function readonlyBang(this: QueryMethodsHost, value = true): any {
  this._isReadonly = value;
  return this;
}

function strictLoadingBang(this: QueryMethodsHost, value = true): any {
  this._isStrictLoading = value;
  return this;
}

function createWithBang(this: QueryMethodsHost, value: Record<string, unknown> | null): any {
  if (value) {
    this._createWithAttrs = { ...this._createWithAttrs, ...value };
  } else {
    this._createWithAttrs = {};
  }
  return this;
}

function fromBang(this: QueryMethodsHost, value: string, subqueryName?: string): any {
  this._fromClause = new FromClause(value, subqueryName ?? null);
  return this;
}

function distinctBang(this: QueryMethodsHost, value = true): any {
  this._isDistinct = value;
  return this;
}

function extendingBang(
  this: QueryMethodsHost,
  ...modules: Array<Record<string, Function> | ((rel: any) => void)>
): any {
  for (const mod of modules) {
    if (typeof mod === "function") {
      mod(this);
    } else {
      this._extending.push(mod);
      for (const [name, fn] of Object.entries(mod)) {
        (this as any)[name] = fn.bind(this);
      }
    }
  }
  return this;
}

function optimizerHintsBang(this: QueryMethodsHost, ...hints: string[]): any {
  this._optimizerHints.push(...hints);
  return this;
}

function reverseOrderBang(this: QueryMethodsHost): any {
  this._orderClauses = this._orderClauses.map((clause) => {
    if (typeof clause === "string") {
      const match = clause.match(/^([\w.]+)\s+(ASC|DESC)$/i);
      if (match) {
        const col = match[1];
        const dir = match[2].toUpperCase() === "ASC" ? "desc" : "asc";
        return [col, dir] as [string, "asc" | "desc"];
      }
      if (/[(),]/.test(clause) || /\bCASE\b/i.test(clause)) {
        throw new IrreversibleOrderError(
          `Relation has a non-reversible order and cannot be reversed: ${clause}`,
        );
      }
      return [clause, "desc" as const];
    }
    const [col, dir] = clause;
    return [col, dir === "asc" ? "desc" : "asc"] as [string, "asc" | "desc"];
  });
  return this;
}

function skipQueryCacheBang(this: QueryMethodsHost, value = true): any {
  this._skipQueryCache = value;
  return this;
}

function skipPreloadingBang(this: QueryMethodsHost): any {
  this._skipPreloading = true;
  return this;
}

function annotateBang(this: QueryMethodsHost, ...comments: string[]): any {
  this._annotations.push(...comments);
  return this;
}

function uniqBang(this: QueryMethodsHost, _name?: string): any {
  this._isDistinct = true;
  return this;
}

function excludingBang(this: QueryMethodsHost, records: any[]): any {
  const pk = this._modelClass.primaryKey as string;
  const ids = records.map((r: any) => (typeof r === "object" && r !== null ? (r.id ?? r) : r));
  const notConditions: Record<string, unknown> = { [pk]: ids };
  this._whereClause.notConditions.push(notConditions);
  return this;
}

function constructJoinDependency(this: QueryMethodsHost, _associations: any, _joinType: any): any {
  return { associations: _associations, joinType: _joinType, model: this._modelClass };
}

// ---------------------------------------------------------------------------
// Module export — all bang variants as a single object for `include()`.
// ---------------------------------------------------------------------------
export const QueryMethodBangs = {
  includesBang,
  eagerLoadBang,
  preloadBang,
  referencesBang,
  withBang,
  withRecursiveBang,
  reselectBang,
  groupBang,
  regroupBang,
  orderBang,
  reorderBang,
  unscopeBang,
  joinsBang,
  leftOuterJoinsBang,
  whereBang,
  invertWhereBang,
  andBang,
  orBang,
  havingBang,
  limitBang,
  offsetBang,
  lockBang,
  noneBang,
  isNullRelation,
  readonlyBang,
  strictLoadingBang,
  createWithBang,
  fromBang,
  distinctBang,
  extendingBang,
  optimizerHintsBang,
  reverseOrderBang,
  skipQueryCacheBang,
  skipPreloadingBang,
  annotateBang,
  uniqBang,
  excludingBang,
  constructJoinDependency,
} as const;
