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
import { JoinDependency } from "../associations/join-dependency.js";

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
    return this._scope.whereAssociated(...associationNames);
  }

  missing(...associationNames: string[]): R {
    return this._scope.whereMissing(...associationNames);
  }

  exists(conditions?: unknown): Promise<boolean> {
    return this._scope.exists(conditions);
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
  _havingClause: WhereClause;
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

function referencesBang(this: QueryMethodsHost, ...tables: string[]): any {
  for (const t of tables) {
    if (t && !this._referencesValues.includes(t)) this._referencesValues.push(t);
  }
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

/**
 * Union additional select columns into the existing list. Mirrors Rails'
 * private `_select!` which uses `select_values |= fields.flatten` — the
 * `|=` form unique-unions both sides, so duplicates are dropped even on
 * the first assignment (when select_values was empty).
 */
function _selectBang(this: QueryMethodsHost, ...columns: any[]): any {
  const flat = columns.flat(Infinity);
  const normalized = flat.map((c: any) =>
    typeof c === "object" && c !== null && "value" in c ? c : String(c),
  );
  if (this._selectColumns === null) this._selectColumns = [];
  const keyOf = (c: unknown) => (typeof c === "string" ? c : (c as { value: string }).value);
  const seen = new Set(this._selectColumns.map(keyOf));
  for (const col of normalized) {
    const key = keyOf(col);
    if (!seen.has(key)) {
      this._selectColumns.push(col);
      seen.add(key);
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

/**
 * Valid argument values for `unscope`. The TS API is camelCase only —
 * no Rails snake_case aliases. Mirrors Rails' VALID_UNSCOPING_VALUES set
 * (where, select, group, order, lock, limit, offset, joins,
 *  left_outer_joins, includes, from, readonly, having, optimizer_hints,
 *  annotate) translated to TS naming.
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
  | "from"
  | "readonly"
  | "having"
  | "optimizerHints"
  | "annotate";

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
  "from",
  "readonly",
  "having",
  "optimizerHints",
  "annotate",
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
          this._rawJoins = [];
          break;
        case "leftOuterJoins":
          this._joinClauses = this._joinClauses.filter((j) => j.type !== "left");
          break;
        case "includes":
          this._includesAssociations = [];
          this._eagerLoadAssociations = [];
          this._preloadAssociations = [];
          break;
        case "optimizerHints":
          this._optimizerHints = [];
          break;
        case "annotate":
          this._annotations = [];
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
  if (opts == null) return this;

  if (opts instanceof Nodes.Node) {
    this._whereClause.predicates.push(opts);
    return this;
  }

  if (typeof opts === "string") {
    let sql: string;
    // Named binds only when:
    //   - the first extra value is a plain Hash, AND
    //   - the statement contains `:word` tokens NOT preceded by another
    //     `:` (so PostgreSQL casts like `payload::jsonb` don't match), AND
    //   - the statement does not contain `?` (positional always wins
    //     when both styles are present, matching common user intent and
    //     avoiding the `::jsonb @> ?` footgun).
    // Non-plain objects like Date/Range always route through
    // sanitizeSqlArray's positional-bind path.
    const firstBind = rest[0];
    const hasPositional = opts.includes("?");
    const hasNamedToken = /(?<!:):[a-zA-Z_]\w*/.test(opts);
    const isNamedBinds =
      rest.length === 1 && isPlainObject(firstBind) && hasNamedToken && !hasPositional;

    if (isNamedBinds) {
      sql = opts;
      const namedBinds = firstBind as Record<string, unknown>;
      for (const [name, value] of Object.entries(namedBinds)) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const replacement = Array.isArray(value)
          ? value.map((v) => quote(v)).join(", ")
          : quote(value);
        sql = sql.replace(new RegExp(`(?<!:):${escaped}\\b`, "g"), replacement);
      }
    } else if (rest.length > 0) {
      sql = sanitizeSqlArray(opts, ...rest);
    } else {
      sql = opts;
    }
    if (sql.trim()) this._whereClause.predicates.push(new Nodes.SqlLiteral(sql));
    return this;
  }

  if (typeof opts !== "object" || Array.isArray(opts)) {
    const err = new Error(`Unsupported argument type: ${typeof opts} (${String(opts)})`);
    err.name = "ArgumentError";
    throw err;
  }

  const cast: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts as Record<string, unknown>)) {
    if (isRelationLike(value)) {
      cast[key] = value;
    } else {
      cast[key] = Array.isArray(value)
        ? value.map((v) => this._castWhereValue(key, v))
        : this._castWhereValue(key, value);
    }
  }
  this._whereClause.predicates.push(...this.predicateBuilder.buildFromHash(cast));
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
 * Constructs an Error tagged with name "ArgumentError" so callers can
 * catch it the same way they would catch Rails' ArgumentError.
 */
function argumentError(message: string): Error {
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
  ["rawJoins", "_rawJoins"],
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
  associations: string | string[],
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
