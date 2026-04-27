/**
 * Query methods mixed into Relation: where, order, group, having,
 * limit, offset, joins, includes, select, distinct, etc.
 *
 * Mirrors: ActiveRecord::QueryMethods
 */
import { Nodes, SelectManager, Table as ArelTable, sql as arelSql } from "@blazetrails/arel";
import { Attribute, ValueType } from "@blazetrails/activemodel";
import { ActiveRecordError, IrreversibleOrderError, PreparedStatementInvalid } from "../errors.js";
import { FromClause } from "./from-clause.js";
import { WhereClause } from "./where-clause.js";
import { sanitizeSqlArray, disallowRawSqlBang } from "../sanitization.js";
import {
  quote,
  quoteColumnName as quoteCol,
  quoteTableName as quoteTable,
  columnNameWithOrderMatcher as abstractOrderMatcher,
} from "../connection-adapters/abstract/quoting.js";
import { detectAdapterName } from "../adapter-name.js";
import { JoinDependency } from "../associations/join-dependency.js";
import { foreignKey } from "@blazetrails/activesupport";

/**
 * Interface for the scope that WhereChain delegates to.
 */
export interface WhereChainScope<R> {
  whereNot(conditions: Record<string, unknown>): R;
  whereAssociated(...associationNames: string[]): R;
  whereMissing(...associationNames: string[]): R;
  exists(conditions?: unknown): Promise<boolean>;
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
    for (const name of associationNames) this.scopeAssociationReflection(name);
    return this._scope.whereAssociated(...associationNames);
  }

  missing(...associationNames: string[]): R {
    for (const name of associationNames) this.scopeAssociationReflection(name);
    return this._scope.whereMissing(...associationNames);
  }

  exists(conditions?: unknown): Promise<boolean> {
    return this._scope.exists(conditions);
  }

  private scopeAssociationReflection(association: string): unknown {
    const model = (this._scope as any)._modelClass ?? (this._scope as any).model;
    const reflection = model?._reflectOnAssociation?.(association);
    if (!reflection) {
      throw argumentError(
        `An association named \`:${association}\` does not exist on the model \`${model?.name ?? "unknown"}\`.`,
      );
    }
    return reflection;
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

/**
 * A single eager-loading specification: either a plain association name string
 * or a nested hash mirroring Rails' `includes(author: :posts)` syntax.
 *
 * Mirrors: the argument accepted by ActiveRecord::QueryMethods#includes,
 * #preload, and #eager_load.
 */
export type AssociationSpec = string | { [assoc: string]: AssociationSpec | AssociationSpec[] };

// ---------------------------------------------------------------------------
// Host interface: the shape of `this` for bang methods mixed into Relation.
// Uses TS `private` keyword fields which are accessible at runtime.
// ---------------------------------------------------------------------------
interface QueryMethodsHost {
  _whereClause: WhereClause;
  _orderClauses: Array<string | [string, "asc" | "desc"] | { raw: string }>;
  _rawOrderClauses: string[];
  _limitValue: number | null;
  _offsetValue: number | null;
  _selectColumns: any[] | null;
  _isDistinct: boolean;
  _distinctOnColumns: string[];
  _groupColumns: string[];
  _havingClause: WhereClause;
  _isNone: boolean;
  _lockValue: string | null;
  _joinClauses: Array<{ type: "inner" | "left"; table: string; on: string; quoted?: boolean }>;
  _joinValues: (string | Nodes.Join)[];
  _includesAssociations: AssociationSpec[];
  _preloadAssociations: AssociationSpec[];
  _eagerLoadAssociations: AssociationSpec[];
  _isReadonly: boolean;
  _isStrictLoading: boolean;
  _annotations: string[];
  _optimizerHints: string[];
  _referencesValues: string[];
  _fromClause: FromClause;
  _createWithAttrs: Record<string, unknown>;
  _extending: Array<Record<string, Function>>;
  _ctes: Array<{ name: string; sql: string; recursive: boolean }>;
  _skipPreloading: boolean;
  _skipQueryCache: boolean;
  _modelClass: any;
  predicateBuilder: import("./predicate-builder.js").PredicateBuilder;
  _castWhereValue(key: string, value: unknown): unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveOrderMatcher(host: QueryMethodsHost): RegExp {
  // Use the public .adapter getter so establishConnection() models get their
  // concrete adapter's matcher. Walk adapter → inner to handle SchemaAdapter.
  // Also check the instance method in case the adapter exposes it directly.
  try {
    let adapter = (host._modelClass as any)?.adapter ?? (host._modelClass as any)?._adapter;
    while (adapter) {
      const matcher =
        (adapter as any)?.columnNameWithOrderMatcher?.() ??
        (adapter.constructor as any)?.columnNameWithOrderMatcher?.();
      if (matcher) return matcher;
      adapter = (adapter as any).inner;
    }
  } catch {
    // No adapter configured — fall back to abstract pattern.
  }
  return abstractOrderMatcher();
}

// ---------------------------------------------------------------------------
// Bang variants — mutate `this` in place, return `this`.
// In Rails, every query method `foo` has a `foo!` that mutates self.
// The non-bang version calls `spawn.foo!` (clone then mutate).
// ---------------------------------------------------------------------------

function includesBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this._includesAssociations.push(...associations);
  return this;
}

function eagerLoadBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this._eagerLoadAssociations.push(...associations);
  return this;
}

function preloadBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this._preloadAssociations.push(...associations);
  return this;
}

function referencesBang(this: QueryMethodsHost, ...tables: string[]): any {
  for (const t of tables) {
    if (t && !this._referencesValues.includes(t)) this._referencesValues.push(t);
  }
  return this;
}

/** Validate and resolve a CTE name+query into a SQL string. */
function resolveCteEntry(name: string, query: unknown): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw argumentError(
      `Invalid CTE name "${name}": must be a valid SQL identifier (letters, digits, underscores, not starting with a digit).`,
    );
  }
  if (query === null || query === undefined) {
    throw argumentError(
      `Invalid argument for with(): null/undefined is not allowed for CTE "${name}".`,
    );
  }
  if (Array.isArray(query)) {
    if (query.length === 0) throw argumentError(`Empty array passed for CTE "${name}".`);
    for (const q of query) {
      if (typeof q !== "string" && typeof (q as any)?.toSql !== "function") {
        const typeName =
          q !== null && typeof q === "object"
            ? `type object (${(q as object).constructor?.name ?? "unknown"})`
            : `type ${typeof q}`;
        throw argumentError(`Unsupported argument type in array for CTE "${name}": ${typeName}`);
      }
    }
    // Do NOT wrap individual subqueries in extra parens: the CTE body is already
    // wrapped as `AS (...)` in toSql(), so `SELECT ... UNION SELECT ...` is valid.
    // Parenthesized `(SELECT ...) UNION (SELECT ...)` is rejected by SQLite inside CTEs.
    return (query as any[])
      .map((q: any) => (typeof q === "string" ? q : q.toSql()))
      .join(" UNION ");
  }
  const q = query as any;
  if (typeof q !== "string" && typeof q?.toSql !== "function") {
    const typeName =
      q !== null && typeof q === "object"
        ? `type object (${(q as object).constructor?.name ?? "unknown"})`
        : `type ${typeof q}`;
    throw argumentError(
      `Unsupported argument type for CTE "${name}": expected a SQL string or Relation, got ${typeName}`,
    );
  }
  return typeof q === "string" ? q : q.toSql();
}

/** Upsert a CTE into _ctes by name (last-write-wins), matching Rails behavior. */
function upsertCte(
  ctes: Array<{ name: string; sql: string; recursive: boolean }>,
  name: string,
  sql: string,
  recursive: boolean,
): void {
  const existing = ctes.findIndex((c) => c.name === name);
  if (existing >= 0) {
    ctes[existing] = { name, sql, recursive };
  } else {
    ctes.push({ name, sql, recursive });
  }
}

function withBang(this: QueryMethodsHost, ...ctes: Array<Record<string, any>>): any {
  for (const cte of ctes) {
    if (!isPlainObject(cte)) {
      const typeName =
        cte !== null && typeof cte === "object"
          ? `type object (${(cte as object).constructor?.name ?? "unknown"})`
          : `type ${typeof cte}`;
      throw argumentError(`Unsupported argument type: ${typeName}`);
    }
    for (const [name, query] of Object.entries(cte)) {
      const sql = resolveCteEntry(name, query);
      upsertCte(this._ctes, name, sql, false);
    }
  }
  return this;
}

function withRecursiveBang(this: QueryMethodsHost, ...ctes: Array<Record<string, any>>): any {
  for (const cte of ctes) {
    if (!isPlainObject(cte)) {
      const typeName =
        cte !== null && typeof cte === "object"
          ? `type object (${(cte as object).constructor?.name ?? "unknown"})`
          : `type ${typeof cte}`;
      throw argumentError(`Unsupported argument type: ${typeName}`);
    }
    for (const [name, query] of Object.entries(cte)) {
      const sql = resolveCteEntry(name, query);
      upsertCte(this._ctes, name, sql, true);
    }
  }
  return this;
}

function reselectBang(this: QueryMethodsHost, ...columns: any[]): any {
  this._selectColumns = columns.map((c: any) => {
    if (c instanceof Nodes.Node) return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
  return this;
}

/**
 * Union additional select columns into the existing list. Mirrors Rails'
 * private `_select!` which uses `select_values |= fields.flatten` — the
 * `|=` form unique-unions both sides, so duplicates are dropped even on
 * the first assignment (when select_values was empty).
 */
function _selectBang(this: QueryMethodsHost, ...columns: any[]): any {
  const flat = columns.flat(Infinity);
  const normalized = flat.map((c: any) => {
    if (c instanceof Nodes.Node) return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
  if (this._selectColumns === null) this._selectColumns = [];
  const seenStrings = new Set<string>();
  const seenNodeHashes = new Map<number, Nodes.Node[]>();
  const nodeIsDuplicate = (node: Nodes.Node): boolean => {
    const h = node.hash();
    const bucket = seenNodeHashes.get(h);
    if (!bucket) return false;
    return bucket.some((n) => n.eql(node));
  };
  const addNodeToSeen = (node: Nodes.Node): void => {
    const h = node.hash();
    const bucket = seenNodeHashes.get(h);
    if (bucket) bucket.push(node);
    else seenNodeHashes.set(h, [node]);
  };
  for (const existing of this._selectColumns) {
    if (typeof existing === "string") seenStrings.add(existing);
    else if (existing instanceof Nodes.Node) addNodeToSeen(existing);
    else seenStrings.add((existing as { value: string }).value);
  }
  for (const col of normalized) {
    if (typeof col === "string") {
      if (!seenStrings.has(col)) {
        this._selectColumns.push(col);
        seenStrings.add(col);
      }
    } else if (col instanceof Nodes.Node) {
      if (!nodeIsDuplicate(col)) {
        this._selectColumns.push(col);
        addNodeToSeen(col);
      }
    } else {
      const key = (col as { value: string }).value;
      if (!seenStrings.has(key)) {
        this._selectColumns.push(col);
        seenStrings.add(key);
      }
    }
  }
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
  ...args: Array<
    string | Record<string, "asc" | "desc"> | Nodes.Node | string[] | [Nodes.Node, ...unknown[]]
  >
): any {
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (Array.isArray(arg)) {
      const [first, ...rest] = arg as unknown[];
      if (first instanceof Nodes.Node) {
        // Bind array: [Arel.sql("col = ?"), bind1, ...] — Arel bypasses check.
        // Store as { raw } so _applyOrderToManager emits it verbatim.
        const rawSql = (first as any).value ?? (first as Nodes.Node).toSql();
        const interpolated = rest.length > 0 ? sanitizeSqlArray(rawSql, ...rest) : rawSql;
        if (interpolated.trim() !== "") this._orderClauses.push({ raw: String(interpolated) });
      } else {
        // Plain string array: all elements must be strings; validate each immediately.
        if (!(arg as unknown[]).every((e) => typeof e === "string")) {
          throw argumentError("Order arguments passed as an array must contain only strings");
        }
        disallowRawSqlBang(arg as string[], resolveOrderMatcher(this));
        for (const elem of arg as string[]) {
          if (elem.trim() !== "") this._orderClauses.push(elem);
        }
      }
    } else if (arg instanceof Nodes.Node) {
      // Pre-render to raw SQL string tagged as { raw } so _applyOrderToManager
      // emits it verbatim (bypasses column qualification). Using { raw } rather
      // than a live Nodes.Node keeps _orderClauses serializable (inspect(), merge
      // dedup, etc. use JSON.stringify on the array).
      const rawSql = (arg as any).value ?? (arg as Nodes.Node).toSql();
      if (rawSql && rawSql.trim() !== "") this._orderClauses.push({ raw: String(rawSql) });
    } else if (typeof arg === "string") {
      if (arg.trim() === "") {
        const next = args[i + 1];
        i += typeof next === "string" && /^(asc|desc)$/i.test(next) ? 2 : 1;
        continue;
      }
      // Validate immediately — mirrors Rails raising on order("invalid") at call time.
      disallowRawSqlBang([arg], resolveOrderMatcher(this));
      const next = args[i + 1];
      if (typeof next === "string" && /^(asc|desc)$/i.test(next)) {
        this._orderClauses.push([arg, next.toLowerCase() as "asc" | "desc"]);
        i += 2;
        continue;
      }
      this._orderClauses.push(arg);
    } else if (arg !== null && typeof arg === "object") {
      // Hash form { col: "asc"|"desc" } — validate column and direction immediately.
      for (const [col, dir] of Object.entries(arg)) {
        disallowRawSqlBang([col], resolveOrderMatcher(this));
        if (!/^(asc|desc)$/i.test(String(dir))) {
          throw argumentError(`Direction "${dir}" is invalid. Valid directions are: asc, desc`);
        }
        this._orderClauses.push([col, (dir as string).toLowerCase() as "asc" | "desc"]);
      }
    } else {
      const argType = arg === null ? "null" : typeof arg;
      throw argumentError(`Unsupported order argument: ${argType}`);
    }
    i++;
  }
  return this;
}

function reorderBang(
  this: QueryMethodsHost,
  ...args: Array<
    string | Record<string, "asc" | "desc"> | Nodes.Node | string[] | [Nodes.Node, ...unknown[]]
  >
): any {
  this._orderClauses = [];
  this._rawOrderClauses = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (Array.isArray(arg)) {
      const [first, ...rest] = arg as unknown[];
      if (first instanceof Nodes.Node) {
        const rawSql = (first as any).value ?? (first as Nodes.Node).toSql();
        const interpolated = rest.length > 0 ? sanitizeSqlArray(rawSql, ...rest) : rawSql;
        if (interpolated.trim() !== "") this._orderClauses.push({ raw: String(interpolated) });
      } else {
        if (!(arg as unknown[]).every((e) => typeof e === "string")) {
          throw argumentError("Order arguments passed as an array must contain only strings");
        }
        disallowRawSqlBang(arg as string[], resolveOrderMatcher(this));
        for (const elem of arg as string[]) {
          if (elem.trim() !== "") this._orderClauses.push(elem);
        }
      }
    } else if (arg instanceof Nodes.Node) {
      // Pre-render to raw SQL string tagged as { raw } so _applyOrderToManager
      // emits it verbatim (bypasses column qualification). Using { raw } rather
      // than a live Nodes.Node keeps _orderClauses serializable (inspect(), merge
      // dedup, etc. use JSON.stringify on the array).
      const rawSql = (arg as any).value ?? (arg as Nodes.Node).toSql();
      if (rawSql && rawSql.trim() !== "") this._orderClauses.push({ raw: String(rawSql) });
    } else if (typeof arg === "string") {
      if (arg.trim() === "") {
        const next = args[i + 1];
        i += typeof next === "string" && /^(asc|desc)$/i.test(next) ? 2 : 1;
        continue;
      }
      disallowRawSqlBang([arg], resolveOrderMatcher(this));
      const next = args[i + 1];
      if (typeof next === "string" && /^(asc|desc)$/i.test(next)) {
        this._orderClauses.push([arg, next.toLowerCase() as "asc" | "desc"]);
        i += 2;
        continue;
      }
      this._orderClauses.push(arg);
    } else if (arg !== null && typeof arg === "object") {
      for (const [col, dir] of Object.entries(arg as Record<string, string>)) {
        disallowRawSqlBang([col], resolveOrderMatcher(this));
        if (!/^(asc|desc)$/i.test(String(dir))) {
          throw argumentError(`Direction "${dir}" is invalid. Valid directions are: asc, desc`);
        }
        this._orderClauses.push([col, (dir as string).toLowerCase() as "asc" | "desc"]);
      }
    } else {
      const argType = arg === null ? "null" : typeof arg;
      throw argumentError(`Unsupported order argument: ${argType}`);
    }
    i++;
  }
  return this;
}

/**
 * Valid argument values for `unscope`. The TS API is camelCase only —
 * no Rails snake_case aliases. Mirrors Rails' VALID_UNSCOPING_VALUES
 * set (relation/query_methods.rb), camelCased:
 *
 *   where, select, group, order, lock, limit, offset, joins,
 *   left_outer_joins, includes, preload, eager_load, from, readonly,
 *   having, optimizer_hints, annotate, create_with
 *
 * → camelCase: where, select, group, order, lock, limit, offset,
 *   joins, leftOuterJoins, includes, preload, eagerLoad, from,
 *   readonly, having, optimizerHints, annotate, createWith.
 */
export type UnscopeType =
  | "where"
  | "select"
  | "group"
  | "order"
  | "lock"
  | "limit"
  | "offset"
  | "joins"
  | "leftOuterJoins"
  | "includes"
  | "preload"
  | "eagerLoad"
  | "from"
  | "readonly"
  | "having"
  | "optimizerHints"
  | "annotate"
  | "createWith"
  | "with";

export const VALID_UNSCOPING_VALUES: ReadonlySet<UnscopeType> = new Set<UnscopeType>([
  "where",
  "select",
  "group",
  "order",
  "lock",
  "limit",
  "offset",
  "joins",
  "leftOuterJoins",
  "includes",
  "preload",
  "eagerLoad",
  "from",
  "readonly",
  "having",
  "optimizerHints",
  "annotate",
  "createWith",
  "with",
]);

function unscopeBang(
  this: QueryMethodsHost,
  ...types: Array<string | { where: string | string[] }>
): any {
  for (const scope of types) {
    if (typeof scope === "string") {
      if (!VALID_UNSCOPING_VALUES.has(scope as UnscopeType)) {
        throw argumentError(
          `Called unscope() with invalid unscoping argument '${scope}'. Valid arguments are: ${[...VALID_UNSCOPING_VALUES].join(", ")}.`,
        );
      }
      switch (scope as UnscopeType) {
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
          this._havingClause = WhereClause.empty();
          break;
        case "select":
          this._selectColumns = null;
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
        case "joins":
          this._joinClauses = [];
          this._joinValues = [];
          break;
        case "leftOuterJoins":
          this._joinClauses = this._joinClauses.filter((j) => j.type !== "left");
          break;
        case "includes":
          // Rails: `unscope(:includes)` clears includes only — preload
          // and eager_load are independent and have their own keys
          // below (matches Rails `query_methods.rb` switch on
          // :includes / :preload / :eager_load).
          this._includesAssociations = [];
          break;
        case "preload":
          this._preloadAssociations = [];
          break;
        case "eagerLoad":
          this._eagerLoadAssociations = [];
          break;
        case "createWith":
          this._createWithAttrs = {};
          break;
        case "optimizerHints":
          this._optimizerHints = [];
          break;
        case "annotate":
          this._annotations = [];
          break;
        case "with":
          this._ctes = [];
          break;
      }
    } else if (scope && typeof scope === "object") {
      for (const [key, target] of Object.entries(scope)) {
        if (key !== "where") {
          throw argumentError(
            `Object arguments to unscope() must use "where" as the key, e.g. unscope({ where: "column_name" }).`,
          );
        }
        const targets = Array.isArray(target) ? target : [target];
        this._whereClause = this._whereClause.except(...targets);
      }
    } else {
      throw argumentError(
        `Unrecognized scoping: ${JSON.stringify(scope)}. Use unscope({ where: "column_name" }) or one of: ${[...VALID_UNSCOPING_VALUES].join(", ")}.`,
      );
    }
  }
  return this;
}

function joinsBang(this: QueryMethodsHost, ...args: (string | Nodes.Join)[]): any {
  // Rails joins! uses |= (array union), deduplicating by equality/identity.
  for (const arg of args) {
    if (!this._joinValues.includes(arg)) this._joinValues.push(arg);
  }
  return this;
}

function leftOuterJoinsBang(this: QueryMethodsHost, ...args: string[]): any {
  for (const arg of args) {
    this._joinValues.push(arg);
  }
  return this;
}

function buildWhereClause(
  this: QueryMethodsHost,
  opts: unknown,
  rest: unknown[] = [],
): WhereClause {
  if (Array.isArray(opts)) {
    const [head, ...tail] = opts as unknown[];
    return buildWhereClause.call(this, head, [...tail, ...rest]);
  }

  if (opts instanceof Nodes.Node) return new WhereClause([opts]);

  if (typeof opts === "string") {
    const firstBind = rest[0];
    const hasPositional = opts.includes("?");
    const hasNamedToken = /(?<!:):[a-zA-Z_]\w*/.test(opts);
    const isNamedBinds =
      rest.length === 1 && isPlainObject(firstBind) && hasNamedToken && !hasPositional;

    let sql: string;
    if (isNamedBinds) {
      sql = opts;
      const namedBinds = firstBind as Record<string, unknown>;
      for (const [name, value] of Object.entries(namedBinds)) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const replacement = Array.isArray(value)
          ? value.map((v) => quote(v)).join(", ")
          : quote(value);
        sql = sql.replace(new RegExp(`(?<!:):${escaped}\\b`, "g"), () => replacement);
      }
    } else if (rest.length > 0) {
      sql = sanitizeSqlArray(opts, ...rest);
    } else {
      sql = opts;
    }
    return new WhereClause(sql.trim() ? [new Nodes.SqlLiteral(sql)] : []);
  }

  if (isPlainObject(opts)) {
    const mc = (this as any)._modelClass;
    const aliases: Record<string, string> = mc?._attributeAliases ?? {};
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts as Record<string, unknown>)) {
      const resolved = aliases[key] ?? key;
      normalized[resolved] = isRelationLike(value)
        ? value
        : Array.isArray(value)
          ? value.map((v) => this._castWhereValue(resolved, v))
          : this._castWhereValue(resolved, value);
    }
    const parts = this.predicateBuilder.buildFromHash(normalized);
    return new WhereClause(parts);
  }

  throw argumentError(`Unsupported argument type: ${String(opts)} (${typeof opts})`);
}

function whereBang(this: QueryMethodsHost, opts: any, ...rest: unknown[]): any {
  if (opts == null) return this;
  const clause = buildWhereClause.call(this, opts, rest);
  this._whereClause.predicates.push(...clause.predicates);
  return this;
}

/**
 * True for values that PredicateBuilder will route through its
 * RelationHandler (subquery IN/NOT IN). Mirrors the shape check in
 * `PredicateBuilder#isRelation`: a Relation exposes `_modelClass` and a
 * `toArel()` method.
 */
function isRelationLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "_modelClass" in (value as object) &&
    typeof (value as { toArel?: unknown }).toArel === "function"
  );
}

function invertWhereBang(this: QueryMethodsHost): any {
  this._whereClause = this._whereClause.invert();
  return this;
}

/**
 * Build an Error tagged with `name = "ArgumentError"` so callers can
 * catch it the same way they would catch Rails' ArgumentError
 * (`catch err if err.name === 'ArgumentError'`). Exported so other
 * modules (PredicateBuilder, Relation public methods, Base.where /
 * Base.whereNot, etc.) can raise the same shape without
 * re-declaring the helper.
 */
export function argumentError(message: string): Error {
  const err = new Error(message);
  err.name = "ArgumentError";
  return err;
}

/**
 * Structural deep equality used by and!/or! compatibility checks.
 *
 * Handles primitives via ===, arrays element-wise, Date via getTime,
 * plain objects key-wise, and class instances by delegating to an `eql`
 * method (Arel nodes) or an `equals` method when available. Non-plain
 * objects without a comparator are considered incompatible unless they
 * are the same reference — falling back to enumerable-key comparison
 * would incorrectly treat e.g. `new Date(0)` and `new Date(1)` as equal
 * since their internal state is not enumerable.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  if (b instanceof Date) return false;

  const aAny = a as { eql?: (x: unknown) => boolean; equals?: (x: unknown) => boolean };
  if (typeof aAny.eql === "function") return aAny.eql(b);
  if (typeof aAny.equals === "function") return aAny.equals(b);

  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
  }
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Names of the relation fields that are structurally compared by and!/or!.
 * Mirrors Rails' STRUCTURAL_VALUE_METHODS (Relation::VALUE_METHODS minus
 * extending, where, having, unscope, references, annotate, optimizer_hints).
 */
const STRUCTURAL_FIELDS: ReadonlyArray<[string, keyof QueryMethodsHost]> = [
  ["includes", "_includesAssociations"],
  ["eagerLoad", "_eagerLoadAssociations"],
  ["preload", "_preloadAssociations"],
  ["select", "_selectColumns"],
  ["group", "_groupColumns"],
  ["order", "_orderClauses"],
  ["rawOrder", "_rawOrderClauses"],
  ["joins", "_joinClauses"],
  ["joinValues", "_joinValues"],
  ["limit", "_limitValue"],
  ["offset", "_offsetValue"],
  ["lock", "_lockValue"],
  ["distinct", "_isDistinct"],
  ["distinctOn", "_distinctOnColumns"],
  ["readonly", "_isReadonly"],
  ["strictLoading", "_isStrictLoading"],
  ["from", "_fromClause"],
  ["createWith", "_createWithAttrs"],
];

function structurallyIncompatibleValuesFor(
  self: QueryMethodsHost,
  other: QueryMethodsHost,
): string[] {
  const incompat: string[] = [];
  for (const [label, field] of STRUCTURAL_FIELDS) {
    const a = self[field] as unknown;
    const b = other[field] as unknown;
    if (!deepEqual(a, b)) incompat.push(label);
  }
  return incompat;
}

function isRelationForCombining(value: unknown): value is QueryMethodsHost {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const wc = v._whereClause as Record<string, unknown> | undefined;
  const hc = v._havingClause as Record<string, unknown> | undefined;
  return (
    typeof wc === "object" &&
    wc !== null &&
    typeof wc.merge === "function" &&
    typeof wc.or === "function" &&
    typeof hc === "object" &&
    hc !== null &&
    typeof hc.merge === "function" &&
    typeof hc.or === "function" &&
    Array.isArray(v._referencesValues)
  );
}

function assertRelationForCombining(other: unknown, methodName: string): void {
  if (!isRelationForCombining(other)) {
    throw argumentError(
      `You have passed ${typeof other} object to #${methodName}. Pass an ActiveRecord::Relation object instead.`,
    );
  }
}

function assertStructurallyCompatible(
  self: QueryMethodsHost,
  other: QueryMethodsHost,
  methodName: string,
): void {
  const incompat = structurallyIncompatibleValuesFor(self, other);
  if (incompat.length > 0) {
    throw argumentError(
      `Relation passed to #${methodName} must be structurally compatible. Incompatible values: [${incompat.map((v) => `:${v}`).join(", ")}]`,
    );
  }
}

/**
 * Returns true if `self` and `other` are structurally compatible for
 * and!/or! combining — exposed as a helper so Relation#structurally_compatible?
 * can share the same check.
 */
export function areStructurallyCompatible(self: unknown, other: unknown): boolean {
  if (!isRelationForCombining(self) || !isRelationForCombining(other)) return false;
  return structurallyIncompatibleValuesFor(self, other).length === 0;
}

function andBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "and");
  assertStructurallyCompatible(this, other, "and");
  // Mirrors Rails: where_clause |= other.where_clause;
  //                having_clause |= other.having_clause;
  //                references_values |= other.references_values
  this._whereClause = this._whereClause.merge(other._whereClause);
  this._havingClause = this._havingClause.merge(other._havingClause);
  const unionStrings = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];
  this._referencesValues = unionStrings(this._referencesValues, other._referencesValues);
  return this;
}

function orBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "or");
  assertStructurallyCompatible(this, other, "or");
  // Mirrors Rails: where_clause = where_clause.or(other.where_clause);
  //                having_clause = having_clause.or(other.having_clause);
  //                references_values |= other.references_values
  this._whereClause = this._whereClause.or(other._whereClause);
  this._havingClause = this._havingClause.or(other._havingClause);
  const unionStrings = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];
  this._referencesValues = unionStrings(this._referencesValues, other._referencesValues);
  return this;
}

function havingBang(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node,
  ...rest: unknown[]
): any {
  if (opts == null || (typeof opts === "string" && opts.trim() === "")) return this;

  if (typeof opts === "string") {
    const sql = rest.length > 0 ? sanitizeSqlArray(opts, ...rest) : opts;
    this._havingClause.predicates.push(new Nodes.SqlLiteral(sql));
    return this;
  }

  if (opts instanceof Nodes.Node) {
    this._havingClause.predicates.push(opts);
    return this;
  }

  if (typeof opts !== "object" || Array.isArray(opts)) {
    throw argumentError(`Unsupported argument type for having: ${typeof opts} (${String(opts)})`);
  }

  const cast: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (isRelationLike(value)) {
      cast[key] = value;
    } else {
      cast[key] = Array.isArray(value)
        ? value.map((v) => this._castWhereValue(key, v))
        : this._castWhereValue(key, value);
    }
  }
  this._havingClause.predicates.push(...this.predicateBuilder.buildFromHash(cast));
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
    this._whereClause.predicates.push(new Nodes.SqlLiteral("1=0"));
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

function fromBang(this: QueryMethodsHost, value: any, subqueryName?: string): any {
  this._fromClause = new FromClause(value ?? null, subqueryName ?? null);
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
    if (typeof clause === "object" && !Array.isArray(clause) && "raw" in clause) {
      // Mirrors Rails reverse_sql_order string case: flip trailing ASC↔DESC,
      // or append DESC if no direction present.
      const raw = (clause as { raw: string }).raw.trim();
      if (isDoesNotSupportReverse(raw)) {
        throw new IrreversibleOrderError(
          `Relation has a non-reversible order and cannot be reversed: ${raw}`,
        );
      }
      const flipped = raw.replace(/\s+ASC$/i, " DESC").replace(/\s+DESC$/i, " ASC");
      if (flipped !== raw) return { raw: flipped };
      // No direction suffix — append DESC (matches Rails `s << " DESC"` fallback)
      return { raw: `${raw} DESC` };
    }
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
  const primaryKey = this._modelClass.primaryKey;
  if (Array.isArray(primaryKey)) {
    throw new Error("excluding does not support models with composite primary keys");
  }
  const pk = primaryKey as string;
  const ids = records.map((r: any) => (typeof r === "object" && r !== null ? (r.id ?? r) : r));
  this._whereClause.predicates.push(...this.predicateBuilder.buildNegatedFromHash({ [pk]: ids }));
  return this;
}

function constructJoinDependency(
  this: QueryMethodsHost,
  associations: string | AssociationSpec[],
  _joinType?: unknown,
): JoinDependency {
  const jd = new JoinDependency(this._modelClass);
  const names = Array.isArray(associations) ? associations : [associations];
  for (const name of names) {
    if (typeof name !== "string") continue;
    const node = name.includes(".") ? jd.addNestedAssociation(name) : jd.addAssociation(name);
    if (!node) {
      throw argumentError(
        `Association named '${name}' was not found on ${(this._modelClass as any).name ?? "model"}; perhaps you misspelled it?`,
      );
    }
  }
  return jd;
}

// ---------------------------------------------------------------------------
// Private helpers — mirrors ActiveRecord::QueryMethods private block.
// Non-exported so the extractor marks them internal: true.
// ---------------------------------------------------------------------------

function asyncBang(this: QueryMethodsHost): QueryMethodsHost {
  (this as any)._async = true;
  return this;
}

function async(this: QueryMethodsHost): QueryMethodsHost {
  const rel = (this as any).spawn();
  rel._async = true;
  return rel;
}

function assertModifiableBang(this: QueryMethodsHost): void {
  if ((this as any)._loaded) {
    throw new ActiveRecordError("can't modify a loaded relation");
  }
}

function isBlankArgument(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function checkIfMethodHasArgumentsBang(
  this: QueryMethodsHost,
  methodName: string,
  args: unknown[],
  message?: string,
): void {
  if (!args || args.length === 0) {
    throw argumentError(message ?? `The method .${methodName}() must contain arguments.`);
  }
  const flat = flattenedArgs(args);
  args.length = 0;
  for (const a of flat) {
    if (!isBlankArgument(a)) args.push(a);
  }
}

function flattenedArgs(args: unknown[]): unknown[] {
  return args.flatMap((e) => {
    if (Array.isArray(e)) return flattenedArgs(e);
    // Only expand plain objects — leave class instances (Arel nodes, Dates, …) as-is.
    if (isPlainObject(e)) return flattenedArgs(Object.entries(e).flat());
    return e;
  });
}

const VALID_DIRECTIONS = new Set(["asc", "desc"]);

function validateOrderArgs(this: QueryMethodsHost, args: unknown[]): void {
  for (const arg of args) {
    if (!isPlainObject(arg)) continue;
    for (const [, value] of Object.entries(arg)) {
      if (isPlainObject(value)) {
        validateOrderArgs.call(this, [value]);
      } else if (!VALID_DIRECTIONS.has(String(value).toLowerCase())) {
        throw argumentError(`Direction "${value}" is invalid. Valid directions are: asc, desc`);
      }
    }
  }
}

function processWithArgs(this: QueryMethodsHost, args: unknown[]): Record<string, unknown>[] {
  return args.flatMap((arg) => {
    if (!isPlainObject(arg)) {
      const desc =
        arg === null
          ? "null"
          : Array.isArray(arg)
            ? "Array"
            : typeof arg !== "object"
              ? `${String(arg)} (${typeof arg})`
              : ((arg as any).constructor?.name ?? "object");
      throw argumentError(`Unsupported argument type: ${desc}. Expected a plain object/hash.`);
    }
    return Object.entries(arg).map(([k, v]) => ({ [k]: v }));
  });
}

function buildCastValue(name: string, value: unknown): Attribute {
  return Attribute.withCastValue(name, value, new ValueType());
}

function buildNamedBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: Record<string, unknown>,
): Nodes.BoundSqlLiteral {
  const namedBinds: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value instanceof Nodes.Node) {
      namedBinds[key] = arelSql(value.toSql());
    } else {
      namedBinds[key] = value;
    }
  }
  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, [], namedBinds);
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

function buildBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: unknown[],
): Nodes.BoundSqlLiteral {
  const positionalBinds = values.map((value) => {
    if (value instanceof Nodes.Node) {
      return arelSql(value.toSql());
    }
    return value;
  });
  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, positionalBinds, {});
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

function buildSubquery(
  this: QueryMethodsHost,
  subqueryAlias: string,
  selectValue: unknown,
): SelectManager {
  // Rails: except(:optimizer_hints).arel.as(alias) — use unscope (our except is SQL EXCEPT, not query-part removal)
  const relation =
    typeof (this as any).unscope === "function" ? (this as any).unscope("optimizerHints") : this;
  if (typeof (relation as any).toArel !== "function") {
    throw new ActiveRecordError("Cannot build subquery: relation does not support toArel()");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(subqueryAlias)) {
    throw argumentError(`Invalid subquery alias "${subqueryAlias}": must be a safe SQL identifier`);
  }
  const aliasedSubquery = (relation as any).toArel().as(subqueryAlias);
  const sm = new SelectManager();
  sm.from(aliasedSubquery);
  sm.project(selectValue as any);
  const hints: string[] = (this as any)._optimizerHints ?? [];
  if (hints.length > 0) sm.optimizerHints(...hints);
  return sm;
}

function isDoesNotSupportReverse(order: string): boolean {
  const plain = String(order);
  if (
    plain.includes(",") &&
    plain.split(",").some((s) => s.split("(").length !== s.split(")").length)
  ) {
    return true;
  }
  return /\bnulls\s+(?:first|last)\b/i.test(plain);
}

function reverseSqlOrder(this: QueryMethodsHost, orderQuery: unknown[]): unknown[] {
  if (orderQuery.length === 0) {
    const pk = (this as any)._modelClass?.primaryKey;
    if (pk) {
      if (Array.isArray(pk)) {
        throw new IrreversibleOrderError(
          "Relation has no current order and table has a composite primary key; cannot determine default reverse order",
        );
      }
      const table: any = (this as any)._modelClass?.arelTable;
      const modelClass: any = (this as any)._modelClass;
      const arelTable =
        modelClass?.arelTable ??
        (modelClass?.tableName ? new ArelTable(modelClass.tableName) : null);
      return [
        arelTable
          ? new Nodes.Descending(arelTable.get(pk))
          : new Nodes.Descending(new Nodes.SqlLiteral(pk)),
      ];
    }
    throw new IrreversibleOrderError(
      "Relation has no current order and table has no primary key to be used as default order",
    );
  }
  return orderQuery.flatMap((o) => {
    // Use reverse() when available (Ascending, Descending, NullsFirst, NullsLast),
    // fall back to desc() for other Arel nodes (Attribute, NodeExpression, etc.).
    // Guard instanceof Nodes.Node to avoid matching arrays which also have reverse().
    if (o instanceof Nodes.Node) {
      if (typeof (o as any).reverse === "function") return [(o as any).reverse()];
      if (typeof (o as any).desc === "function") return [(o as any).desc()];
    }
    if (typeof o === "string") {
      if (isDoesNotSupportReverse(o)) {
        throw new IrreversibleOrderError(
          `Order ${JSON.stringify(o)} cannot be reversed automatically`,
        );
      }
      return o.split(",").map((s) => {
        s = s.trim();
        if (/\sasc$/i.test(s)) return s.replace(/\sasc$/i, " DESC");
        if (/\sdesc$/i.test(s)) return s.replace(/\sdesc$/i, " ASC");
        return `${s} DESC`;
      });
    }
    return [o];
  });
}

function extractTableNameFrom(orderTerm: string): string | null {
  const match = orderTerm.match(/^\W?(\w+)\W?\./);
  return match ? match[1] : null;
}

function symbolToName(s: symbol): string {
  const name = Symbol.keyFor(s) ?? s.description;
  if (name === undefined || name.trim() === "") {
    throw argumentError("Order symbols must have a non-blank name");
  }
  return name;
}

function columnReferences(orderArgs: unknown[]): string[] {
  const refs: string[] = [];
  for (const arg of orderArgs) {
    if (typeof arg === "string" || typeof arg === "symbol") {
      const term = typeof arg === "symbol" ? symbolToName(arg) : arg;
      const t = extractTableNameFrom(term);
      if (t) refs.push(t);
    } else if (arg instanceof Nodes.Attribute) {
      refs.push((arg as any).relation.name);
    } else if (arg instanceof Nodes.Ordering) {
      const expr = (arg as any).expr;
      if (expr instanceof Nodes.Attribute) refs.push(expr.relation.name);
    } else if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        if (isPlainObject(value)) {
          // Nested hash { table: { col: dir } } — key is the table name.
          refs.push(key);
        } else {
          const t = extractTableNameFrom(String(key));
          if (t) refs.push(t);
        }
      }
    }
  }
  return refs;
}

function sanitizeOrderArguments(this: QueryMethodsHost, orderArgs: unknown[]): unknown[] {
  return orderArgs.map((arg) => (this as any)._modelClass?.sanitizeSqlForOrder?.(arg) ?? arg);
}

function flattenedOrderKeysForRawSqlCheck(orderArgs: unknown[]): (string | symbol)[] {
  const result: (string | symbol)[] = [];
  for (const arg of orderArgs) {
    if (Array.isArray(arg)) {
      result.push(...flattenedOrderKeysForRawSqlCheck(arg));
    } else if (typeof arg === "string" || typeof arg === "symbol") {
      result.push(arg);
    } else if (arg instanceof Nodes.Node) {
      // Arel nodes (SqlLiteral, Attribute, Ordering, …) are pre-sanitized; skip them.
    } else if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        result.push(key);
        if (isPlainObject(value)) result.push(...flattenedOrderKeysForRawSqlCheck([value]));
      }
    }
  }
  return result;
}

function preprocessOrderArgs(this: QueryMethodsHost, orderArgs: unknown[]): void {
  // disallowRawSqlBang skips symbols — resolve symbol names to strings first
  // so their descriptions are validated against the column-name matcher.
  const keysForCheck = flattenedOrderKeysForRawSqlCheck(orderArgs).map((k) =>
    typeof k === "symbol" ? symbolToName(k) : k,
  );
  disallowRawSqlBang(keysForCheck, resolveOrderMatcher(this));
  validateOrderArgs.call(this, orderArgs);
  const refs = columnReferences(orderArgs);
  if (refs.length > 0) {
    const existing: string[] = (this as any)._referencesValues ?? [];
    (this as any)._referencesValues = [...new Set([...existing, ...refs])];
  }
  // Rails maps Symbol args to Ascending nodes and Hash args to directional nodes.
  const mapped: unknown[] = [];
  for (const arg of orderArgs) {
    if (typeof arg === "symbol") {
      // Resolve against the current relation's table, not a table named after the column.
      const name = symbolToName(arg);
      const modelTable = (this as any)._modelClass?.arelTable;
      const attr = modelTable ? modelTable.get(name) : arelSql(name);
      mapped.push(new Nodes.Ascending(attr));
    } else if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        if (isPlainObject(value)) {
          // Nested hash: { table: { col: dir } } → table.col DESC/ASC (quoted via ArelTable)
          for (const [field, dir] of Object.entries(value)) {
            const attr = new ArelTable(key).get(field);
            mapped.push(
              String(dir).toLowerCase() === "desc"
                ? new Nodes.Descending(attr)
                : new Nodes.Ascending(attr),
            );
          }
        } else {
          // Flat hash: { col: dir } — resolve against the current table.
          const modelTable = (this as any)._modelClass?.arelTable;
          const attr = modelTable ? modelTable.get(key) : arelSql(key);
          mapped.push(
            String(value).toLowerCase() === "desc"
              ? new Nodes.Descending(attr)
              : new Nodes.Ascending(attr),
          );
        }
      }
    } else {
      mapped.push(arg);
    }
  }
  orderArgs.length = 0;
  orderArgs.push(...mapped);
}

function buildOrderNode(clause: unknown): unknown {
  if (clause instanceof Nodes.Node) return clause;
  if (typeof clause === "string") return new Nodes.SqlLiteral(clause);
  if (typeof clause === "symbol") return new Nodes.SqlLiteral(symbolToName(clause));
  if (Array.isArray(clause) && clause.length === 2) {
    const [col, dir] = clause;
    if (col instanceof Nodes.Node) {
      return String(dir).toLowerCase() === "desc"
        ? new Nodes.Descending(col)
        : new Nodes.Ascending(col);
    }
    if (typeof col === "string" || typeof col === "symbol") {
      const expr = new Nodes.SqlLiteral(typeof col === "symbol" ? symbolToName(col) : col);
      return String(dir).toLowerCase() === "desc"
        ? new Nodes.Descending(expr)
        : new Nodes.Ascending(expr);
    }
    throw argumentError(`Unsupported order column type: ${Object.prototype.toString.call(col)}`);
  }
  throw argumentError(`Unsupported order clause type: ${Object.prototype.toString.call(clause)}`);
}

function buildOrder(this: QueryMethodsHost, arel: any): void {
  const orders = ((this as any)._orderClauses ?? [])
    .filter((o: unknown) => o !== null && o !== undefined && o !== "")
    .map(buildOrderNode);
  if (orders.length > 0) arel.order?.(...orders);
}

function buildCaseForValuePosition(
  this: QueryMethodsHost,
  column: unknown,
  values: unknown[],
  options: { filter?: boolean } = {},
): unknown {
  const filter = options.filter !== false;
  const node = new Nodes.Case();
  values.forEach((value, i) => {
    node.when((column as any).eq(value), i + 1);
  });
  if (!filter) (node as any).else(values.length + 1);
  return new Nodes.Ascending(node);
}

function resolveArelAttributes(this: QueryMethodsHost, attrs: unknown[]): unknown[] {
  const builder = (this as any).predicateBuilder;
  return attrs.flatMap((attr) => {
    if (attr !== null && typeof attr === "object" && typeof (attr as any).eq === "function") {
      return [attr];
    }
    if (attr !== null && typeof attr === "object" && !Array.isArray(attr)) {
      return Object.entries(attr as Record<string, unknown>).flatMap(([table, columns]) => {
        const tableName = String(table);
        return (Array.isArray(columns) ? columns : [columns]).map(
          (col) =>
            builder?.resolveArelAttribute?.(tableName, String(col)) ??
            new ArelTable(tableName).get(String(col)),
        );
      });
    }
    const s = String(attr);
    if (s.includes(".")) {
      const [table, col] = s.split(".", 2);
      return [builder?.resolveArelAttribute?.(table, col) ?? new ArelTable(table).get(col)];
    }
    return [s];
  });
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
  _selectBang,
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

// ---------------------------------------------------------------------------
// PR 2a private helpers — column resolution, select/from/with building.
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeQuoteTableName(modelClass: any, name: string): string {
  let adapter: any;
  try {
    adapter = modelClass?.adapter;
  } catch {
    /* adapter getter threw — no connection */
  }
  const dialect = detectAdapterName(adapter);
  try {
    return adapter?.quoteTableName?.(name) ?? quoteTable(name, dialect);
  } catch {
    return quoteTable(name, dialect);
  }
}

function safeQuoteColumnName(modelClass: any, name: string): string {
  let adapter: any;
  try {
    adapter = modelClass?.adapter;
  } catch {
    /* adapter getter threw — no connection */
  }
  const dialect = detectAdapterName(adapter);
  try {
    return adapter?.quoteColumnName?.(name) ?? quoteCol(name, dialect);
  } catch {
    return quoteCol(name, dialect);
  }
}

function isTableNameMatches(this: QueryMethodsHost, from: unknown): boolean {
  const table: any = (this as any)._modelClass?.arelTable;
  if (!table) return false;
  const modelClass: any = (this as any)._modelClass;
  const name = escapeRegex(table.name);
  const quotedTableName = safeQuoteTableName(modelClass, table.name);
  const quoted = escapeRegex(quotedTableName);
  // Mirror Rails: from.to_sql if from.respond_to?(:to_sql)
  const fromStr = typeof (from as any)?.toSql === "function" ? (from as any).toSql() : String(from);
  return new RegExp(`(?:^|(?<!FROM)\\s)(?:\\b${name}\\b|${quoted})(?!\\.)`, "i").test(fromStr);
}

function arelColumn(
  this: QueryMethodsHost,
  field: string | symbol,
  fallback?: (attr: string) => unknown,
): unknown {
  const modelClass: any = (this as any)._modelClass;
  const table: any = modelClass?.arelTable;
  const isSymbol = typeof field === "symbol";
  let fieldStr = isSymbol ? symbolToName(field) : field;
  fieldStr = modelClass?._attributeAliases?.[fieldStr] ?? fieldStr;

  const fromClause = (this as any)._fromClause;
  const from = fromClause?.name || fromClause?.value;

  if (modelClass?.columnsHash?.()[fieldStr] && (!from || isTableNameMatches.call(this, from))) {
    return table?.get(fieldStr) ?? arelSql(fieldStr);
  }
  const dotMatch = fieldStr.match(/^(?<tbl>(?:\w+\.)?\w+)\.(?<col>\w+)$/);
  if (dotMatch) {
    return arelColumnWithTable.call(this, dotMatch.groups!.tbl, dotMatch.groups!.col);
  }
  if (fallback) return fallback(fieldStr);
  const quoted = isSymbol ? safeQuoteColumnName(modelClass, fieldStr) : fieldStr;
  return arelSql(quoted);
}

function arelColumns(this: QueryMethodsHost, columns: unknown[]): unknown[] {
  return columns.flatMap((field) => {
    if (field instanceof Nodes.Node) return [field]; // Arel nodes pass through directly
    if (typeof field === "string" || typeof field === "symbol")
      return [arelColumn.call(this, field as any)];
    if (typeof field === "function") return [field()];
    if (isPlainObject(field))
      return arelColumnsFromHash.call(this, field as Record<string, unknown>);
    return [field];
  });
}

function arelColumnWithTable(
  this: QueryMethodsHost,
  tableName: string,
  columnName: string | symbol,
): unknown {
  const existing = (this as any)._referencesValues ?? [];
  if (!existing.includes(tableName)) (this as any)._referencesValues = [...existing, tableName];
  const colStr = typeof columnName === "symbol" ? symbolToName(columnName) : columnName;
  const modelClass: any = (this as any)._modelClass;
  // Schema-qualified table names (e.g. "schema.table") must not be passed to
  // ArelTable — the visitor quotes the whole string as one identifier, producing
  // "schema.table"."col" instead of "schema"."table"."col".
  if (tableName.includes(".")) {
    const quotedTable = safeQuoteTableName(modelClass, tableName);
    const quotedCol = safeQuoteColumnName(modelClass, colStr);
    return arelSql(`${quotedTable}.${quotedCol}`);
  }
  if (typeof columnName === "symbol" || !/\W/.test(colStr)) {
    const builder = (this as any).predicateBuilder;
    return (
      builder?.resolveArelAttribute?.(tableName, colStr) ?? new ArelTable(tableName).get(colStr)
    );
  }
  const quotedTable = safeQuoteTableName(modelClass, tableName);
  return arelSql(`${quotedTable}.${colStr}`);
}

function arelColumnsFromHash(this: QueryMethodsHost, fields: Record<string, unknown>): unknown[] {
  return Reflect.ownKeys(fields).flatMap((key) => {
    const columns = (fields as Record<string | symbol, unknown>)[key];
    const tbl = typeof key === "symbol" ? symbolToName(key) : key;
    if (typeof columns === "string" || typeof columns === "symbol") {
      return [arelColumnWithTable.call(this, tbl, columns as any)];
    }
    if (Array.isArray(columns)) {
      return columns.map((col) => arelColumnWithTable.call(this, tbl, col));
    }
    throw new TypeError(`Expected Symbol, String or Array, got: ${typeof columns}`);
  });
}

function orderColumn(this: QueryMethodsHost, field: string): unknown {
  const modelClass: any = (this as any)._modelClass;
  const table: any = modelClass?.arelTable;
  return arelColumn.call(this, field, (attrName: string) => {
    if (attrName === "count" && ((this as any)._groupColumns ?? []).length > 0) {
      return table?.get(attrName) ?? arelSql(attrName);
    }
    const quoted = safeQuoteColumnName(modelClass, attrName);
    return arelSql(quoted);
  });
}

function processSelectArgs(this: QueryMethodsHost, fields: unknown[]): unknown[] {
  return fields.flatMap((field) => {
    if (isPlainObject(field))
      return arelColumnAliasesFromHash.call(this, field as Record<string, unknown>);
    return [field];
  });
}

function nodeAs(attr: unknown, quotedAlias: string): unknown {
  if (typeof (attr as any)?.as === "function") return (attr as any).as(quotedAlias);
  const attrSql = typeof (attr as any)?.toSql === "function" ? (attr as any).toSql() : String(attr);
  return arelSql(`${attrSql} AS ${quotedAlias}`);
}

function arelColumnAliasesFromHash(
  this: QueryMethodsHost,
  fields: Record<string | symbol, unknown>,
): unknown[] {
  return Reflect.ownKeys(fields).flatMap((key) => {
    const columnsAliases = fields[key as any];
    const tableName = typeof key === "symbol" ? symbolToName(key) : key;
    const modelClass: any = (this as any)._modelClass;
    const quoteAlias = (a: unknown): string =>
      safeQuoteColumnName(modelClass, typeof a === "symbol" ? symbolToName(a) : String(a));
    if (isPlainObject(columnsAliases)) {
      return Reflect.ownKeys(columnsAliases as object).map((col) => {
        const alias = (columnsAliases as any)[col];
        const attr = arelColumnWithTable.call(this, tableName, col as any);
        return nodeAs(attr instanceof Nodes.Node ? attr : arelSql(String(col)), quoteAlias(alias));
      });
    }
    if (Array.isArray(columnsAliases)) {
      return (columnsAliases as (string | symbol)[]).map((col) =>
        arelColumnWithTable.call(this, tableName, col),
      );
    }
    if (typeof columnsAliases === "string" || typeof columnsAliases === "symbol") {
      return [nodeAs(arelColumn.call(this, key as any), quoteAlias(columnsAliases))];
    }
    return [];
  });
}

function buildFrom(this: QueryMethodsHost): unknown {
  const fromClause = (this as any)._fromClause;
  const opts = fromClause?.value;
  let name = fromClause?.name;
  if (opts && typeof (opts as any).toArel === "function") {
    name ??= "subquery";
    const alias = String(name);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
      throw argumentError(`Invalid subquery alias "${alias}": must be a safe SQL identifier`);
    }
    return (opts as any).toArel().as(alias);
  }
  return opts;
}

function buildSelect(this: QueryMethodsHost, arel: any): void {
  const selectCols = (this as any)._selectColumns;
  if (selectCols && selectCols.length > 0) {
    arel.project(...arelColumns.call(this, selectCols));
    return;
  }
  const modelClass: any = (this as any)._modelClass;
  const table: any = modelClass?.arelTable;
  if (
    (modelClass?.ignoredColumns?.length ?? 0) > 0 ||
    modelClass?.enumerateColumnsInSelectStatements
  ) {
    const cols: string[] = modelClass?.columnNames?.() ?? [];
    if (cols.length > 0) {
      arel.project(...cols.map((f: string) => table?.get(f) ?? arelSql(f)));
      return;
    }
  }
  arel.project(table ? table.star : arelSql("*"));
}

function buildWithExpressionFromValue(this: QueryMethodsHost, value: unknown): unknown {
  if (value instanceof Nodes.SqlLiteral) return new Nodes.Grouping(value as any);
  // Always return the AST node so Cte.relation receives a Node, not a SelectManager.
  if (value instanceof SelectManager) return value.ast;
  if (value !== null && typeof value === "object" && typeof (value as any).toArel === "function") {
    return (value as any).toArel().ast;
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      throw argumentError("Empty array passed to buildWithExpressionFromValue");
    if (value.length === 1) return buildWithExpressionFromValue.call(this, value[0]);
    const parts = value.map((q) => buildWithExpressionFromValue.call(this, q));
    return parts.reduce(
      (result: unknown, part: unknown) => new Nodes.UnionAll(result as any, part as any),
    );
  }
  throw argumentError(`Unsupported argument type: \`${String(value)}\` ${typeof value}`);
}

function buildWithValueFromHash(this: QueryMethodsHost, hash: Record<string, unknown>): unknown[] {
  return Reflect.ownKeys(hash).map((key) => {
    const name = typeof key === "symbol" ? symbolToName(key) : key;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw argumentError(
        `Invalid CTE name "${name}": must be a valid SQL identifier (letters, digits, underscores, not starting with a digit).`,
      );
    }
    const expr = buildWithExpressionFromValue.call(this, (hash as any)[key]);
    return new Nodes.Cte(name, expr as any);
  });
}

// Rails passes lookupTableKlassFromJoinDependencies as a block to
// predicate_builder.build_from_hash so polymorphic associations resolve to the
// right model. Our PredicateBuilder#buildFromHash doesn't yet accept that
// callback. These helpers exist for private-API parity; they are not yet wired
// through the current buildArel() → buildJoins() path.
function lookupTableKlassFromJoinDependencies(this: QueryMethodsHost, tableName: string): unknown {
  let found: unknown = null;
  eachJoinDependencies.call(this, undefined, (join: any) => {
    if (tableName === join.tableName) found = join.modelClass;
  });
  return found;
}

function eachJoinDependencies(
  this: QueryMethodsHost,
  joinDependencies: JoinDependency[] | undefined,
  block: (join: any) => void,
): void {
  const deps = joinDependencies ?? buildJoinDependencies.call(this);
  for (const jd of deps) {
    jd.each(block);
  }
}

function buildJoinDependencies(this: QueryMethodsHost): JoinDependency[] {
  // Mirror Rails: joins | left_outer_joins | eager_load | includes.
  // _joinClauses store SQL join targets (table names), not association names.
  // Only association specs from eagerLoad/includes can be resolved via JoinDependency.
  const joinNames: AssociationSpec[] = [];

  if (this._eagerLoadAssociations.length > 0) {
    for (const a of this._eagerLoadAssociations) {
      if (!joinNames.includes(a)) joinNames.push(a);
    }
  }
  if (this._includesAssociations.length > 0) {
    for (const a of this._includesAssociations) {
      if (!joinNames.includes(a)) joinNames.push(a);
    }
  }

  const stashedJoins: JoinDependency[] = [];
  const named = selectNamedJoins.call(this, joinNames, stashedJoins);
  const jd = constructJoinDependency.call(this, named as AssociationSpec[], null);
  stashedJoins.unshift(jd);
  return stashedJoins;
}

function buildArel(this: QueryMethodsHost, _connection?: unknown, _aliases?: unknown): any {
  const mc = (this as any)._modelClass;
  const table: any = mc?.arelTable;
  const arel = new SelectManager(table);

  buildJoins.call(this, arel);

  if (!this._whereClause.isEmpty()) arel.where(this._whereClause.ast);
  if (!this._havingClause.isEmpty()) arel.having(this._havingClause.ast);

  if (this._limitValue !== null) arel.take(this._limitValue);
  if (this._offsetValue !== null) arel.skip(this._offsetValue);

  if (this._groupColumns.length > 0)
    arel.group(...(arelColumns.call(this, this._groupColumns) as (Nodes.Node | string)[]));

  buildOrder.call(this, arel);
  buildWith.call(this, arel);
  buildSelect.call(this, arel);

  if (this._optimizerHints.length > 0) arel.optimizerHints?.(...this._optimizerHints);
  if (this._isDistinct) arel.distinct();

  const from = buildFrom.call(this);
  if (from !== undefined && from !== null) arel.from(from as any);

  if (this._lockValue) arel.lock(this._lockValue);

  if (this._annotations.length > 0) {
    const annotates =
      this._annotations.length > 1 ? [...new Set(this._annotations)] : this._annotations;
    arel.comment?.(...annotates);
  }

  return arel;
}

function selectNamedJoins(
  this: QueryMethodsHost,
  joinNames: unknown[],
  stashedJoins: unknown[] | null,
  block?: (join: unknown) => void,
): unknown[] {
  // Mirror Rails: partition into CTEJoins (symbols matching a with_value key)
  // vs ordinary association specs.
  const cteNames = new Set(this._ctes.map((c) => c.name));
  const cteJoins: string[] = [];
  const associations: unknown[] = [];

  for (const joinName of joinNames) {
    if (typeof joinName === "symbol" && cteNames.has(symbolToName(joinName))) {
      cteJoins.push(symbolToName(joinName));
    } else {
      associations.push(joinName);
    }
  }

  for (const cteName of cteJoins) {
    block?.(new CTEJoin(cteName));
  }

  return selectAssociationList.call(this, associations, stashedJoins, block);
}

function selectAssociationList(
  this: QueryMethodsHost,
  associations: unknown[],
  stashedJoins: unknown[] | null,
  block?: (join: unknown) => void,
): unknown[] {
  const result: unknown[] = [];
  for (const association of associations) {
    if (
      typeof association === "string" ||
      typeof association === "symbol" ||
      Array.isArray(association) ||
      isPlainObject(association)
    ) {
      result.push(association);
    } else if (association instanceof JoinDependency) {
      stashedJoins?.push(association);
    } else {
      block?.(association);
    }
  }
  return result;
}

function buildJoinBuckets(this: QueryMethodsHost): Record<string, unknown[]> {
  const buckets: Record<string, unknown[]> = {
    leading_join: [],
    join_node: [],
    stashed_join: [],
  };

  // Mirror Rails build_join_buckets (query_methods.rb:1844–1876):
  // Detect stashed joins from _eagerLoadAssociations only — includes may resolve
  // via preload (no joins) and is not a reliable stashed signal. When stashed
  // joins are present, non-LeadingJoin explicit nodes go to join_node (after
  // alias-tracker joins). When absent, all explicit nodes go to leading_join
  // (before named joins), matching Rails' else branch: `!LeadingJoin &&
  // (stashed_eager_load || stashed_left_joins)` is false → leading_join.
  // Guard the call: buildJoinDependencies always returns at least [primaryJD]
  // even when associations are empty, so we check first to avoid false positives.
  const hasAssocStashed = this._eagerLoadAssociations.length > 0;
  const stashedJoins = hasAssocStashed ? buildJoinDependencies.call(this) : [];
  const hasStashed = stashedJoins.length > 0;
  buckets.stashed_join.push(...stashedJoins);

  for (const v of this._joinValues) {
    const node: Nodes.Join =
      typeof v === "string" ? (new Nodes.StringJoin(arelSql(v.trim()) as any) as Nodes.Join) : v;
    if (!(node instanceof Nodes.LeadingJoin) && hasStashed) {
      buckets.join_node.push(node);
    } else {
      buckets.leading_join.push(node);
    }
  }

  return buckets;
}

function buildJoins(this: QueryMethodsHost, arel: any): void {
  const hasEagerAssocs = this._eagerLoadAssociations.length > 0;
  if (this._joinClauses.length === 0 && this._joinValues.length === 0 && !hasEagerAssocs) return;

  const buckets = buildJoinBuckets.call(this);
  const leadingJoins = buckets.leading_join as unknown[];
  const joinNodes = buckets.join_node as unknown[];
  const stashedJoins = buckets.stashed_join as JoinDependency[];

  for (const j of leadingJoins) arel.source.right.push(j);

  // Named association joins from _joinClauses (pre-resolved SQL join specs).
  // Mirrors Rails' join_dependency.join_constraints(stashed_joins, alias_tracker)
  // for the named_join + stashed_join buckets.
  for (const j of this._joinClauses) {
    const tableNode = j.quoted ? new ArelTable(j.table) : j.table;
    const onNode = arelSql(j.on) as any;
    if (j.type === "inner") {
      arel.join(tableNode, onNode);
    } else {
      arel.outerJoin(tableNode, onNode);
    }
  }

  // Stashed join dependencies (eager_load/includes) — generate join SQL via
  // joinConstraints and push directly to join_sources (mirrors build_joins:1896).
  if (stashedJoins.length > 0) {
    const [primary, ...rest] = stashedJoins;
    const constraintNodes = primary.joinConstraints(rest);
    for (const node of constraintNodes) arel.source.right.push(node);
  }

  for (const node of joinNodes) arel.source.right.push(node);
}

function buildWith(this: QueryMethodsHost, arel: any): void {
  if (!this._ctes || this._ctes.length === 0) return;

  const hasRecursive = this._ctes.some((c) => c.recursive);
  const withNodes = this._ctes.map((c) => new Nodes.Cte(c.name, arelSql(c.sql) as any));

  if (hasRecursive) {
    arel.withRecursive?.(...withNodes);
  } else {
    arel.with?.(...withNodes);
  }
}

function buildWithJoinNode(
  this: QueryMethodsHost,
  name: string,
  kind: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin = Nodes.InnerJoin,
): unknown {
  const mc = (this as any)._modelClass;
  const table: any = mc?.arelTable;
  if (!table) throw new ActiveRecordError("Cannot build CTE join node: model has no arelTable");
  const withTable = new ArelTable(name);
  // Rails: with_table[model.model_name.to_s.foreign_key].eq(table[model.primary_key])
  const modelName = String(mc?.modelName ?? mc?.name ?? "Model");
  const fk = foreignKey(modelName);
  if (Array.isArray(mc?.primaryKey)) {
    throw new ActiveRecordError("Cannot build CTE join node with composite primary keys");
  }
  const pk = mc?.primaryKey ?? "id";
  return table.join(withTable, kind).on(withTable.get(fk).eq(table.get(pk))).joinSources[0];
}
