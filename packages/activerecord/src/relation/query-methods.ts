/**
 * Query methods mixed into Relation: where, order, group, having,
 * limit, offset, joins, includes, select, distinct, etc.
 *
 * Mirrors: ActiveRecord::QueryMethods
 */
import * as Arel from "@blazetrails/arel";
import { Nodes, SelectManager, Table as ArelTable, relationName } from "@blazetrails/arel";
import {
  Attribute,
  ValueType,
  sanitizeForMassAssignment as sanitizeForbiddenAttributes,
} from "@blazetrails/activemodel";
import { PredicateBuilder } from "./predicate-builder.js";
import { DeferredIdsNotIn } from "./predicate-builder/deferred-distinct-pk-in.js";
import { isBaseInstance } from "./predicate-builder/is-base-instance.js";
import {
  ActiveRecordError,
  IrreversibleOrderError,
  PreparedStatementInvalid,
  UnmodifiableRelation,
} from "../errors.js";
import { FromClause } from "./from-clause.js";
import { WhereClause } from "./where-clause.js";
import { sanitizeLimit } from "../connection-adapters/abstract/database-statements.js";
import { JoinDependency } from "../associations/join-dependency.js";
import type { AliasTracker } from "../associations/alias-tracker.js";
import { seedJoinClauseAliases } from "./merged-join-alias-tracker.js";
import { threadedConnectionFor } from "../connection-handling.js";
import { wrapWithScopeProxy } from "./delegation.js";
import { any, foreignKey } from "@blazetrails/activesupport";

/**
 * Interface for the scope that WhereChain delegates to.
 */
export interface WhereChainScope<R> {
  whereNot(conditions: Record<string, unknown>): R;
  whereNot(conditions: unknown[]): R;
  whereNot(cols: string[], tuples: unknown[][]): R;
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

  not(conditions: Record<string, unknown>): R;
  not(conditions: unknown[]): R;
  not(cols: string[], tuples: unknown[][]): R;
  not(conditions: Record<string, unknown> | unknown[], tuples?: unknown[][]): R {
    if (tuples !== undefined) {
      return this._scope.whereNot(conditions as string[], tuples);
    }
    if (Array.isArray(conditions)) {
      return this._scope.whereNot(conditions);
    }
    return this._scope.whereNot(conditions);
  }

  associated(...associations: string[]): R {
    // The reflection is discarded on purpose: this call is here for Rails'
    // fail-fast on an unknown association (`scope_association_reflection`
    // raises, query_methods.rb:90), which happens before any join is built.
    // `whereAssociated` re-derives it because it needs the *scope's* reflection
    // as the scope advances. `missing` below has the same shape.
    for (const association of associations) this.scopeAssociationReflection(association);
    return this._scope.whereAssociated(...associations);
  }

  missing(...associations: string[]): R {
    for (const association of associations) this.scopeAssociationReflection(association);
    return this._scope.whereMissing(...associations);
  }

  exists(conditions?: unknown): Promise<boolean> {
    return this._scope.exists(conditions);
  }

  private scopeAssociationReflection(association: string): unknown {
    const model = (this._scope as any)._model ?? (this._scope as any).model;
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
 * or a nested hash mirroring Rails' `includes(author: :posts)` syntax. `null` /
 * `undefined` entries (and `null` hash values) are tolerated and ignored,
 * mirroring Rails' `Array(nil)` handling in `includes(nil)` / `includes(posts: nil)`.
 *
 * Mirrors: the argument accepted by ActiveRecord::QueryMethods#includes,
 * #preload, and #eager_load.
 */
export type AssociationSpec =
  | string
  | null
  | undefined
  | AssociationSpec[]
  | { [assoc: string]: AssociationSpec | AssociationSpec[] };

/**
 * A single `joins` argument. Like {@link AssociationSpec} but also admits Arel
 * `Nodes.Join` at any array depth, mirroring Rails' `args.flatten!` over
 * arbitrary join args before `joins_values |= args` (query_methods.rb:868-875).
 */
export type JoinSpec = AssociationSpec | Nodes.Join | JoinSpec[];

/** Mirrors: ActiveRecord::QueryMethods::FROZEN_EMPTY_ARRAY (query_methods.rb:159). */
export const FROZEN_EMPTY_ARRAY: readonly never[] = Object.freeze([]);

/** Mirrors: ActiveRecord::QueryMethods::FROZEN_EMPTY_HASH (query_methods.rb:160). */
export const FROZEN_EMPTY_HASH: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Generate the `*_values` / `*_value` / `*_clause` accessors over `@values` —
 * one reader/writer pair per `Relation::VALUE_METHODS` entry, plus the trailing
 * `alias extensions extending_values`.
 *
 * Mirrors: the `Relation::VALUE_METHODS.each` / `class_eval` loop at
 * query_methods.rb:162-183. The reader is `@values.fetch(:<name>, <default>)`,
 * so a *stored* `null`/`false` is returned rather than the default; the writer
 * is `assert_modifiable!` then `@values[:<name>] = value`.
 *
 * @noRailsEquivalent PERMANENT: Ruby reopens `module QueryMethods` and `class_eval`s the
 *   accessors, naming `Relation::VALUE_METHODS` at load time under Zeitwerk.
 *   ESM has neither reopening nor autoload, so the loop is exported as a
 *   function `relation.ts` calls on its own class beside its other
 *   `include(Relation, …)` mixins — which is also what keeps the constant
 *   resolution call-time.
 */
export function defineValueMethods(relationClass: {
  prototype: object;
  MULTI_VALUE_METHODS: readonly string[];
  SINGLE_VALUE_METHODS: readonly string[];
  CLAUSE_METHODS: readonly string[];
  VALUE_METHODS: readonly string[];
}): void {
  for (const name of relationClass.VALUE_METHODS) {
    let methodName: string;
    let defaultValue: () => unknown;
    if (relationClass.MULTI_VALUE_METHODS.includes(name)) {
      methodName = `${name}Values`;
      defaultValue = () => FROZEN_EMPTY_ARRAY;
    } else if (relationClass.SINGLE_VALUE_METHODS.includes(name)) {
      methodName = `${name}Value`;
      // Ruby `nil` is spelled `null`, never `undefined`: an unset single value
      // is passed straight through to callees with Ruby-style optional
      // parameters (`arel.distinct(distinct_value)` over Arel's
      // `distinct(value = true)`), and a JS default parameter would swallow an
      // `undefined` and substitute its own default (CLAUDE.md, "kwargs").
      defaultValue = name === "createWith" ? () => FROZEN_EMPTY_HASH : () => null;
    } else {
      methodName = `${name}Clause`;
      defaultValue = name === "from" ? () => FromClause.empty() : () => WhereClause.empty();
    }

    Object.defineProperty(relationClass.prototype, methodName, {
      configurable: true,
      get(this: QueryMethodsHost): unknown {
        const values = this._values;
        return name in values ? values[name] : defaultValue();
      },
      set(this: QueryMethodsHost, value: unknown) {
        assertModifiableBang.call(this);
        this._values[name] = value;
      },
    });
  }

  Object.defineProperty(relationClass.prototype, "extensions", {
    configurable: true,
    get(this: QueryMethodsHost) {
      return this.extendingValues;
    },
  });
}

type OrderDirection = "asc" | "desc" | "ASC" | "DESC";

/**
 * A single argument to `order`/`reorder`. Besides the flat
 * `{ col: "asc" }` hash, Rails accepts a nested `{ table: { col: "asc" } }`
 * form that expands to a `table.col dir` qualified order.
 */
export type OrderArg =
  | string
  | Record<string, OrderDirection | Record<string, OrderDirection>>
  | Nodes.Node
  | string[]
  | [Nodes.Node, ...unknown[]]
  | Map<Nodes.Node | string, OrderDirection>
  // Rails' order/reorder accept nil (`reorder(nil)` clears the order); the empty
  // -argument guard compact_blanks it away before it reaches the bang variant.
  | null;

// ---------------------------------------------------------------------------
// Host interface: the shape of `this` for bang methods mixed into Relation.
// Uses TS `private` keyword fields which are accessible at runtime.
// ---------------------------------------------------------------------------
interface QueryMethodsHost {
  /** Rails `delegate :primary_key, to: :model` (delegation.rb:106). */
  primaryKey: string | string[];
  /** Rails `@values` (relation.rb:86) — the hash behind every value method. */
  _values: Record<string, unknown>;
  // The `VALUE_METHODS.each`-generated accessors (query_methods.rb:162-181).
  whereClause: WhereClause;
  havingClause: WhereClause;
  fromClause: FromClause;
  includesValues: AssociationSpec[];
  eagerLoadValues: AssociationSpec[];
  preloadValues: AssociationSpec[];
  selectValues: any[];
  groupValues: string[];
  orderValues: Array<string | Nodes.Node>;
  joinsValues: (AssociationSpec | string | Nodes.Join)[];
  leftOuterJoinsValues: AssociationSpec[];
  referencesValues: string[];
  extendingValues: Array<Record<string, (...args: any[]) => any>>;
  unscopeValues: Array<string | { where: string | string[] }>;
  optimizerHintsValues: string[];
  annotateValues: string[];
  withValues: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>;
  limitValue: number | null;
  offsetValue: number | null;
  lockValue: string | null;
  readonlyValue: boolean | null;
  reorderingValue: boolean | null;
  strictLoadingValue: boolean | null;
  reverseOrderValue: boolean | null;
  distinctValue: boolean | null;
  createWithValue: Record<string, unknown>;
  skipQueryCacheValue: boolean | null;
  _rawOrderClauses: string[];
  _distinctOnColumns: string[];
  _isNone: boolean;
  _joinClauses: Array<{
    type: "inner" | "left";
    table: string;
    on: string | Nodes.Node;
    quoted?: boolean;
    // The target model a `.joins(:assoc)` resolved to. Rails keeps the join
    // dependency (joins_values feed build_join_dependencies), so
    // lookup_table_klass_from_join_dependencies can recover the joined model for
    // any plain `.joins(:assoc)`. We pre-resolve the association to SQL here, so
    // we retain the klass to drive aggregate/where cast-type resolution without a
    // global registry scan by table name.
    klass?: unknown;
  }>;
  // Converged Rails `Relation#alias_tracker(joins, aliases)` (relation.rb:1307);
  // `buildJoins` reads it to build the shared `build_joins` tracker.
  aliasTracker(joins?: Nodes.Node[], aliases?: Map<string, number>): AliasTracker;
  // A `joins_values` entry is a "named" inner association join (resolved through
  // JoinDependency) when it is a nested-association hash, a Symbol — spelled as a
  // leading-colon string — or a string naming an association; everything else
  // (Arel join nodes, raw SQL strings) is a raw join value.
  _isNamedJoinValue(v: unknown): boolean;
  // References added by an explicit `.references(...)` call. Rails only seeds
  // JoinDependency's alias map from SqlLiteral references (those auto-derived by
  // column_references / arel_column_with_table), NOT from these bare-string
  // manual references — so they are excluded when aliasing eager-load joins.
  _manualReferences: string[];
  _skipPreloading: boolean;
  _model: typeof import("../base.js").Base;
  model: QueryMethodsHost["_model"];
  /** Rails `attr_reader :table` (relation.rb:71) — the relation's own Arel table. */
  table: ArelTable;
  predicateBuilder: import("./predicate-builder.js").PredicateBuilder;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bang variants — mutate `this` in place, return `this`.
// In Rails, every query method `foo` has a `foo!` that mutates self.
// The non-bang version calls `spawn.foo!` (clone then mutate).
// ---------------------------------------------------------------------------

// Rails' includes!/eager_load!/preload! union (`|=`) rather than append, which
// dedups by eql?/hash — structural for Symbol/String/Hash specs alike. Mirror
// that with structuralUnionEq so a repeated `includes(:x)`/`preload(:x)` folds
// to one spec instead of making the preloader load it twice.
function unionAppendAssociations(
  target: readonly AssociationSpec[],
  incoming: readonly AssociationSpec[],
): AssociationSpec[] {
  const union = [...target];
  for (const spec of incoming) {
    if (!union.some((seen) => structuralUnionEq(seen, spec))) union.push(spec);
  }
  return union;
}

function includesBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this.includesValues = unionAppendAssociations(this.includesValues, associations);
  return this;
}

function eagerLoadBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this.eagerLoadValues = unionAppendAssociations(this.eagerLoadValues, associations);
  return this;
}

function preloadBang(this: QueryMethodsHost, ...associations: AssociationSpec[]): any {
  this.preloadValues = unionAppendAssociations(this.preloadValues, associations);
  return this;
}

function referencesBang(this: QueryMethodsHost, ...tables: Array<string | Nodes.SqlLiteral>): any {
  for (const t of tables) {
    const name = t instanceof Nodes.SqlLiteral ? t.value : t;
    if (name && !this.referencesValues.includes(name))
      this.referencesValues = [...this.referencesValues, name];
  }
  return this;
}

/**
 * Table names implied by hash conditions — nested-hash keys and dotted string
 * keys — as plain strings. Used to auto-add references so
 * `includes(...).where("joined_table.col": ...)` promotes the matching include
 * to an eager LEFT OUTER JOIN. Returns `[]` for non-hash opts (string SQL,
 * Arel nodes, composite-key arrays), mirroring Rails' `when Hash` branch.
 *
 * Mirrors: ActiveRecord::QueryMethods#build_where_clause (query_methods.rb:1640)
 * — `references = PredicateBuilder.references(opts)`.
 * @internal
 */
export function referencesFromConditions(conditions: unknown): string[] {
  if (!isPlainObject(conditions)) return [];
  return PredicateBuilder.references(conditions).map((ref) => ref.value);
}

// Resolve a single CTE sub-query value into an arel body node, mirroring Rails'
// `build_with_expression_from_value(value, nested)`. A raw SQL string /
// `SqlLiteral` becomes `Nodes.Grouping(SqlLiteral)`
// (`when SqlLiteral then Grouping.new(value)`), so it carries its own operand
// parens. A `Relation` contributes its real Arel SelectStatement node
// (`value._cteBodyArelNode()`, mirroring `value.arel(.ast)`) and an
// `Arel::SelectManager` its `.ast` — so adapter quoting and bind collection are
// preserved through to the visitor rather than frozen at `toSql()` time. Rails'
// `nested` flag selects `value.arel` (a manager) vs `value.arel.ast` (a node);
// trails' Cte/UnionAll operands must be visitable AST nodes, so both branches
// resolve to the SelectStatement node — `nested` is threaded to match Rails'
// reduction shape and the single-element unwrap below. A relation whose SQL
// `buildArel` cannot fully encode (set-op/eager body) returns null and
// falls back to its inlined SQL as a bare `SqlLiteral`.
function buildCteLeaf(q: unknown, nested: boolean): Nodes.Node {
  if (typeof q === "string") return new Nodes.Grouping(Arel.sql(q) as any);
  if (q instanceof Nodes.SqlLiteral) return new Nodes.Grouping(q as any);
  if (q instanceof SelectManager) return q.ast as unknown as Nodes.Node;
  const node = (q as any)._cteBodyArelNode?.(nested);
  if (node) return node as Nodes.Node;
  return Arel.sql((q as any).toSql()) as unknown as Nodes.Node;
}

/** Validate and resolve a CTE name+query into an arel expression node. */
function resolveCteEntry(name: string, query: unknown): Nodes.Node {
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
      if (typeof q !== "string" && typeof q?.toSql !== "function") {
        const typeName =
          q !== null && typeof q === "object"
            ? `type object (${(q as object).constructor?.name ?? "unknown"})`
            : `type ${typeof q}`;
        throw argumentError(`Unsupported argument type in array for CTE "${name}": ${typeName}`);
      }
    }
    // Rails reduces array sub-queries into a left-nested `Arel::Nodes::UnionAll`
    // AST (build_with_expression_from_value). A single-element array unwraps to
    // its sole leaf with `nested = false`; multi-element leaves are resolved with
    // `nested = true`. The SQLite visitor strips the leaves' `Grouping` parens
    // inside UNION ALL (infix_value_with_paren); PG/MySQL keep them.
    if (query.length === 1) return buildCteLeaf(query[0], false);
    return (query as unknown[])
      .map((q) => buildCteLeaf(q, true))
      .reduce((left, right) => new Nodes.UnionAll(left as any, right as any));
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
  return buildCteLeaf(query, false);
}

/** Upsert a CTE into withValues by name (last-write-wins), matching Rails behavior. */
function upsertCte(
  ctes: ReadonlyArray<{ name: string; expression: Nodes.Node; recursive: boolean }>,
  name: string,
  expression: Nodes.Node,
  recursive: boolean,
): Array<{ name: string; expression: Nodes.Node; recursive: boolean }> {
  const next = [...ctes];
  const existing = next.findIndex((c) => c.name === name);
  if (existing >= 0) {
    next[existing] = { name, expression, recursive };
  } else {
    next.push({ name, expression, recursive });
  }
  return next;
}

/**
 * Render the `WITH [RECURSIVE] <name> AS (body), ...` clause for a set of CTEs.
 * `compile` lowers a CTE body node to `[sql, binds]` through the dialect's arel
 * visitor (binds collected, not inlined — Relation/SelectManager bodies thread
 * their bind values to the caller in body order); `quoteName` quotes the CTE
 * name through the adapter (double quotes on SQLite/PG, backticks on MySQL) —
 * mirroring Rails' `visit_Arel_Nodes_Cte`, which renders the name via
 * `quote_table_name`. `UnionAll` / `Grouping` bodies already emit their own
 * surrounding parens, so the `AS (...)` parens are only added for any other
 * (bare) node. Returns the clause SQL plus the concatenated body binds (in CTE
 * declaration order); the caller prepends these to the main query's binds since
 * the `WITH` clause renders first.
 * @internal
 */
export function buildCteSql(
  ctes: Array<{ name: string; expression: Nodes.Node; recursive: boolean }>,
  compile: (node: Nodes.Node) => [string, unknown[]],
  quoteName: (name: string) => string,
): { sql: string; binds: unknown[] } {
  const recursive = ctes.some((c) => c.recursive);
  const binds: unknown[] = [];
  const defs = ctes
    .map((c) => {
      // Each body compiles with a fresh collector, so PG `$N` placeholders
      // restart at `$1` per CTE. Shift this body's placeholders up by the binds
      // already emitted by earlier CTEs so the concatenated WITH clause numbers
      // globally (mirrors Rails compiling all with_statements through one
      // collector). SQLite/MySQL use positional `?`, so the shift is a no-op.
      const offset = binds.length;
      const [rawBody, bodyBinds] = compile(c.expression);
      const body =
        offset > 0
          ? rawBody.replace(/\$(\d+)/g, (_m, n) => `$${parseInt(n, 10) + offset}`)
          : rawBody;
      binds.push(...bodyBinds);
      const wrapped =
        c.expression instanceof Nodes.UnionAll || c.expression instanceof Nodes.Grouping
          ? body
          : `(${body})`;
      return `${quoteName(c.name)} AS ${wrapped}`;
    })
    .join(", ");
  return { sql: `WITH ${recursive ? "RECURSIVE " : ""}${defs}`, binds };
}

function withBang(this: QueryMethodsHost, ...ctes: Array<Record<string, unknown>>): any {
  for (const cte of ctes) {
    if (!isPlainObject(cte)) {
      const typeName =
        cte !== null && typeof cte === "object"
          ? `type object (${(cte as object).constructor?.name ?? "unknown"})`
          : `type ${typeof cte}`;
      throw argumentError(`Unsupported argument type: ${typeName}`);
    }
    // A `with_values` entry fed back in — Rails' `with_values` holds the raw
    // args, so `relation.with!(*with_values)` round-trips through Merger's
    // NORMAL_VALUES loop (merger.rb:57-66); trails resolves at `with!` time, so
    // the already-resolved entry is upserted as-is rather than re-parsed.
    if (isCteEntry(cte)) {
      // `self.with_values |= args` (query_methods.rb) — a union of the raw
      // args, so two CTEs sharing an alias both survive a merge and the
      // database is the one that objects.
      if (!this.withValues.includes(cte)) this.withValues = [...this.withValues, cte];
      continue;
    }
    for (const [name, query] of Object.entries(cte)) {
      const expression = resolveCteEntry(name, query);
      this.withValues = upsertCte(this.withValues, name, expression, false);
    }
  }
  return this;
}

function isCteEntry(
  value: Record<string, unknown>,
): value is { name: string; expression: Nodes.Node; recursive: boolean } {
  return (
    typeof value.name === "string" &&
    value.expression instanceof Nodes.Node &&
    typeof value.recursive === "boolean"
  );
}

function withRecursiveBang(this: QueryMethodsHost, ...ctes: Array<Record<string, unknown>>): any {
  for (const cte of ctes) {
    if (!isPlainObject(cte)) {
      const typeName =
        cte !== null && typeof cte === "object"
          ? `type object (${(cte as object).constructor?.name ?? "unknown"})`
          : `type ${typeof cte}`;
      throw argumentError(`Unsupported argument type: ${typeName}`);
    }
    for (const [name, query] of Object.entries(cte)) {
      const expression = resolveCteEntry(name, query);
      this.withValues = upsertCte(this.withValues, name, expression, true);
    }
  }
  return this;
}

function reselectBang(this: QueryMethodsHost, ...columns: any[]): any {
  this.selectValues = columns.map((c: any) => {
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
    // Rails' `_select!(-> { aliases.columns })` (join_dependency.rb:155) stores
    // the Proc itself; `arel_columns` calls it at build_select time.
    if (typeof c === "function") return c;
    if (typeof c === "object" && c !== null && "value" in c)
      return new Nodes.SqlLiteral((c as { value: string }).value);
    return String(c);
  });
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
  const seenThunks = new Set<unknown>();
  for (const existing of this.selectValues) {
    if (typeof existing === "string") seenStrings.add(existing);
    else if (existing instanceof Nodes.Node) addNodeToSeen(existing);
    else if (typeof existing === "function") seenThunks.add(existing);
    else seenStrings.add((existing as { value: string }).value);
  }
  for (const col of normalized) {
    if (typeof col === "string") {
      if (!seenStrings.has(col)) {
        this.selectValues = [...this.selectValues, col];
        seenStrings.add(col);
      }
    } else if (col instanceof Nodes.Node) {
      if (!nodeIsDuplicate(col)) {
        this.selectValues = [...this.selectValues, col];
        addNodeToSeen(col);
      }
    } else if (typeof col === "function") {
      // Ruby `|=` dedups Procs by object identity.
      if (!seenThunks.has(col)) {
        this.selectValues = [...this.selectValues, col];
        seenThunks.add(col);
      }
    } else {
      const key = (col as { value: string }).value;
      if (!seenStrings.has(key)) {
        this.selectValues = [...this.selectValues, col];
        seenStrings.add(key);
      }
    }
  }
  return this;
}

function groupBang(
  this: QueryMethodsHost,
  ...columns: (string | import("@blazetrails/arel").Nodes.Node)[]
): any {
  this.groupValues = [...this.groupValues, ...(columns as string[])];
  return this;
}

function regroupBang(
  this: QueryMethodsHost,
  ...columns: (string | import("@blazetrails/arel").Nodes.Node)[]
): any {
  this.groupValues = [...(columns as string[])];
  return this;
}

function orderBang(this: QueryMethodsHost, ...args: OrderArg[]): any {
  if (args.length > 0) preprocessOrderArgs.call(this, args as unknown[]);
  // Mirrors Rails' `self.order_values |= args`: union dedupes repeated terms.
  this.orderValues = dedupeOrderClauses([
    ...this.orderValues,
    ...(args as unknown[]),
  ]) as typeof this.orderValues;
  return this;
}

function reorderBang(this: QueryMethodsHost, ...args: OrderArg[]): any {
  preprocessOrderArgs.call(this, args as unknown[]);
  this._rawOrderClauses = [];
  this.reorderingValue = true;
  this.orderValues = dedupeOrderClauses(args as unknown[]) as typeof this.orderValues;
  return this;
}
// Remove duplicate order terms while preserving first-seen order. orderBang
// mirrors Rails' `self.order_values |= args` and reorderBang its `args.uniq!` —
// both dedupe by value (query_methods.rb order!/reorder!).
//
// Ruby compares Arel nodes structurally (Arel::Nodes::Node#eql?), so the key is
// structural: an Attribute holds a back reference to its Arel::Table, which
// JSON.stringify cannot serialize.
let orderClauseIdentity = 0;
const orderClauseIdentities = new WeakMap<object, number>();

function orderClauseKey(clause: unknown): string {
  if (typeof clause === "string") return `s:${clause}`;
  if (clause instanceof Nodes.SqlLiteral) return `s:${String((clause as any).value ?? "")}`;
  if (clause instanceof Nodes.Attribute) {
    return `a:${relationName((clause as any).relation?.name)}.${(clause as any).name}`;
  }
  if (clause instanceof Nodes.Node && "expr" in (clause as any)) {
    return `${clause.constructor.name}(${orderClauseKey((clause as any).expr)})`;
  }
  if (clause !== null && typeof clause === "object") {
    let id = orderClauseIdentities.get(clause);
    if (id === undefined) {
      id = ++orderClauseIdentity;
      orderClauseIdentities.set(clause, id);
    }
    return `o:${id}`;
  }
  return `v:${String(clause)}`;
}

function dedupeOrderClauses<T>(clauses: T[]): T[] {
  const seen = new Set<string>();
  return clauses.filter((c) => {
    const key = orderClauseKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/**
 * Value keys accepted by `SpawnMethods#except` — Rails' `Relation::VALUE_METHODS`.
 * A superset of `UnscopeType`: it additionally covers value keys that have no
 * `unscope` equivalent (`distinct`, `strictLoading`, `references`, `extending`,
 * `unscope`, `reordering`, `skipQueryCache`, `reverseOrder`), mirroring
 * `relation_with values.except(*skips)`.
 *
 * `reverseOrder` (`:reverse_order`, a SINGLE_VALUE_METHOD) is included for
 * surface parity with `Relation::VALUE_METHODS` and the merger, but resetting it
 * is a faithful no-op: trails applies `reverseOrder` eagerly (flipping
 * `orderValues` in place), leaving `reverseOrderValue` vestigial-nil — exactly
 * as the pinned Rails' `reverse_order!` leaves `values[:reverse_order]` nil.
 */
export type ExceptKey =
  | UnscopeType
  | "distinct"
  | "strictLoading"
  | "references"
  | "extending"
  | "unscope"
  | "reordering"
  | "skipQueryCache"
  | "reverseOrder";

/**
 * The full `Relation::VALUE_METHODS` key surface handled by `SpawnMethods#except`
 * (reset the named keys) and `SpawnMethods#only` (reset every key NOT named — the
 * complement of `values.slice(*onlies)`). A superset of `VALID_UNSCOPING_VALUES`
 * with the seven value keys that have no `unscope` equivalent.
 */
export const EXCEPT_ONLY_KEYS: readonly ExceptKey[] = [
  ...VALID_UNSCOPING_VALUES,
  "distinct",
  "strictLoading",
  "references",
  "extending",
  "unscope",
  "reordering",
  "skipQueryCache",
  "reverseOrder",
];

/**
 * Argument type for `SpawnMethods#except`. Rails' `values.except(*skips)`
 * (spawn_methods.rb:59-60) accepts ANY key — unrecognized ones are a silent
 * no-op. The `(string & {})` arm preserves `ExceptKey` autocomplete while
 * still admitting arbitrary strings without a cast (e.g. `Post.except("bogus")`).
 */
export type ExceptSkip = ExceptKey | (string & {});

/**
 * Reset a single value-key: delete it from `@values` so it reads back as its
 * default, then clear the trails-only sidecar store that backs it outside the
 * hash.
 *
 * Mirrors: the `@values.delete(scope)` half of `QueryMethods#unscope!`. Rails
 * keeps every value in `@values`, so deleting the key is the whole reset; the
 * switch below covers only the stores trails still keeps beside the hash.
 */
export function resetValueForScope(host: QueryMethodsHost, scope: ExceptKey): void {
  delete host._values[scope];
  switch (scope) {
    case "order":
      host._rawOrderClauses = [];
      break;
    case "joins":
      host._joinClauses = [];
      break;
    case "leftOuterJoins":
      host._joinClauses = host._joinClauses.filter((j) => j.type !== "left");
      break;
    case "references":
      host._manualReferences = [];
      break;
  }
}

/**
 * The value keys whose trails representation spills outside `@values` into a
 * sidecar store, so replacing the hash wholesale has to clear them too.
 */
const SIDECAR_BACKED_KEYS: readonly ExceptKey[] = [
  "order",
  "joins",
  "leftOuterJoins",
  "references",
];

/**
 * Replace `@values` wholesale.
 *
 * Mirrors: the assignment in `SpawnMethods#relation_with` (spawn_methods.rb:71-74),
 * `spawn.tap { |r| r.values = values }` — a key the incoming hash omits simply
 * reads back as its default.
 *
 * @internal
 */
export function setValues(host: QueryMethodsHost, values: Record<string, unknown>): void {
  host._values = values;
  for (const scope of SIDECAR_BACKED_KEYS) {
    if (!(scope in values)) resetValueForScope(host, scope);
  }
}

function unscopeBang(
  this: QueryMethodsHost,
  ...types: Array<string | { where: string | string[] }>
): any {
  // Rails unscope! does `self.unscope_values += args` so a later merge of this
  // relation re-applies the resets (query_methods.rb / merger.rb).
  this.unscopeValues = [...this.unscopeValues, ...types];
  for (const rawScope of types) {
    if (typeof rawScope === "string") {
      // Rails: `scope = :left_outer_joins if scope == :left_joins` — the
      // `leftJoins` alias is normalized before the validity check, so it is
      // not itself a member of VALID_UNSCOPING_VALUES.
      const scope = rawScope === "leftJoins" ? "leftOuterJoins" : rawScope;
      if (!VALID_UNSCOPING_VALUES.has(scope as UnscopeType)) {
        throw argumentError(
          `Called unscope() with invalid unscoping argument ':${scope}'. Valid arguments are :${[...VALID_UNSCOPING_VALUES].join(", :")}.`,
        );
      }
      resetValueForScope(this, scope as UnscopeType);
    } else if (rawScope && typeof rawScope === "object") {
      for (const [key, target] of Object.entries(rawScope)) {
        if (key !== "where") {
          throw argumentError(
            `Object arguments to unscope() must use "where" as the key, e.g. unscope({ where: "column_name" }).`,
          );
        }
        const targets = Array.isArray(target) ? target : [target];
        this.whereClause = this.whereClause.except(...targets);
      }
    } else {
      throw argumentError(
        `Unrecognized scoping: ${JSON.stringify(rawScope)}. Use unscope({ where: "column_name" }) or one of: ${[...VALID_UNSCOPING_VALUES].join(", ")}.`,
      );
    }
  }
  return this;
}

function joinsBang(this: QueryMethodsHost, ...args: (string | Nodes.Join)[]): any {
  // Rails joins! uses |= (array union), deduplicating by Ruby eql?/hash —
  // structural for Hash specs, strings, and even Arel nodes (Arel::Nodes::Binary
  // defines eql?/hash by class + members, arel/nodes/binary.rb:20-29).
  // structuralUnionEq mirrors that: === first, then deepEqual (which delegates
  // to a node's own eql for Arel nodes).
  for (const arg of args) {
    if (!this.joinsValues.some((seen) => structuralUnionEq(seen, arg)))
      this.joinsValues = [...this.joinsValues, arg];
  }
  return this;
}

function leftOuterJoinsBang(this: QueryMethodsHost, ...args: AssociationSpec[]): any {
  // Mirrors Rails left_outer_joins! which stores into left_outer_joins_values
  // (separate from joins_values, which is the inner-join path).
  // |= dedups by eql?/hash — structural for Hash specs, not JS reference.
  for (const arg of args) {
    if (!this.leftOuterJoinsValues.some((seen) => structuralUnionEq(seen, arg)))
      this.leftOuterJoinsValues = [...this.leftOuterJoinsValues, arg];
  }
  return this;
}

/** @internal */
export function buildWhereClause(
  this: QueryMethodsHost,
  opts: unknown,
  rest: unknown[] = [],
): WhereClause {
  // Mirrors build_where_clause (query_methods.rb:1614): unwrap/forbid
  // strong-params objects before any other handling.
  opts = sanitizeForbiddenAttributes(opts as Record<string, unknown>);

  if (Array.isArray(opts)) {
    // Mirrors Ruby `opts, *rest = opts` (query_methods.rb:1616-1618): the
    // array destructure OVERWRITES rest with the array's tail, discarding any
    // rest that was passed alongside the array — it does not append to it.
    const [head, ...tail] = opts as unknown[];
    return buildWhereClause.call(this, head, tail);
  }

  if (opts instanceof Nodes.Node) return new WhereClause([opts]);

  if (typeof opts === "string") {
    // Mirrors build_where_clause (query_methods.rb:1620-1628): a bare fragment is
    // wrapped verbatim as Arel.sql(opts); a fragment whose first rest arg is a
    // Hash and that carries a `:word` token builds a named BoundSqlLiteral; a `?`
    // fragment builds a positional BoundSqlLiteral; any remaining rest-bearing
    // fragment (no `?`, no named hash) falls back to sanitize_sql.
    let parts: Nodes.Node[];
    if (rest.length === 0) {
      parts = [Arel.sql(opts)];
    } else if (isPlainObject(rest[0]) && /:\w+/.test(opts)) {
      parts = [buildNamedBoundSqlLiteral.call(this, opts, rest[0])];
    } else if (opts.includes("?")) {
      parts = [buildBoundSqlLiteral.call(this, opts, rest)];
    } else {
      parts = [new Nodes.SqlLiteral(this.model.sanitizeSqlArray(opts, ...rest))];
    }
    return new WhereClause(parts);
  }

  if (isPlainObject(opts)) {
    // Mirrors build_where_clause (query_methods.rb:1640): a hash condition
    // auto-adds references for its nested-hash / dotted-key tables, so an
    // includes(...) with a WHERE on the joined table promotes to eager JOIN.
    referencesBang.call(this, ...referencesFromConditions(opts));
    const mc = this.model;
    const aliases: Record<string, string> = mc?._attributeAliases ?? {};
    // Rails never pre-casts hash values here — build_where_clause hands them
    // raw to PredicateBuilder, whose QueryAttribute bind casts/serializes at
    // compile time (predicate_builder.rb:57-69 → build_bind_attribute →
    // value_for_database).
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts)) {
      const resolved = aliases[key] ?? key;
      transformed[resolved] = value;
    }
    opts = transformed;
    const parts = this.predicateBuilder.buildFromHash(
      opts as Record<string, unknown>,
      (tableName: string) => lookupTableKlassFromJoinDependencies.call(this, tableName),
    );
    return new WhereClause(parts);
  }

  throw argumentError(`Unsupported argument type: ${String(opts)} (${typeof opts})`);
}

function whereBang(this: QueryMethodsHost, opts: any, ...rest: unknown[]): any {
  if (opts == null) return this;
  const clause = buildWhereClause.call(this, opts, rest);
  this.whereClause = this.whereClause.plus(clause);
  return this;
}

/**
 * True for values that PredicateBuilder will route through its
 * RelationHandler (subquery IN/NOT IN). Mirrors the shape check in
 * `PredicateBuilder#isRelation`: a Relation exposes `_model` and a
 * `toArel()` method.
 */
function isRelationLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "_model" in value &&
    typeof (value as { toArel?: unknown }).toArel === "function"
  );
}

function invertWhereBang(this: QueryMethodsHost): any {
  this.whereClause = this.whereClause.invert();
  return this;
}

/**
 * Build an Error tagged with `name = "ArgumentError"` so callers can
 * catch it the same way they would catch Rails' ArgumentError
 * (`catch err if err.name === 'ArgumentError'`). Exported so other
 * modules (PredicateBuilder, Relation public methods, Base.where /
 * WhereChain#not, etc.) can raise the same shape without
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
/** Order-preserving uniq using {@link deepEqual} (mirrors Ruby `Array#uniq`). */
function uniqArray(arr: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const el of arr) {
    if (!out.some((seen) => deepEqual(seen, el))) out.push(el);
  }
  return out;
}

/**
 * Ruby `Array#|=` (and `uniq`) dedup by `eql?`/`hash` — structural for Hash
 * specs, strings, and Arel nodes alike (Arel::Nodes::Binary, which Join extends,
 * defines eql?/hash by class + members: arel/nodes/binary.rb:20-29). This mirrors
 * that for the join-value unions (`joins_values`, `left_outer_joins_values`):
 * {@link deepEqual} tests `===` first, then delegates to a node's own `eql`, and
 * falls back to per-key structural equality for plain-object specs — so
 * `leftJoins({ posts: "x" })` called twice folds to one entry as in Rails.
 * @internal
 */
export function structuralUnionEq(a: unknown, b: unknown): boolean {
  if (a instanceof JoinDependency || b instanceof JoinDependency) return a === b;
  return deepEqual(a, b);
}

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

  // boundary: deepEqual underpins the and!/or! merge-compatibility check
  // (structurallyIncompatibleValuesFor). Caller-supplied JS Date values
  // compare by epoch since Object.is treats distinct Date instances as unequal.
  // Use Object.is on the epoch so two invalid (NaN) Dates compare equal too.
  if (a instanceof Date) return b instanceof Date && Object.is(a.getTime(), b.getTime());
  // boundary: paired with the `a instanceof Date` branch above.
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
 * Mirrors: ActiveRecord::QueryMethods::STRUCTURAL_VALUE_METHODS
 * (query_methods.rb:2261-2264) — `Relation::VALUE_METHODS - [:extending, :where,
 * :having, :unscope, :references, :annotate, :optimizer_hints]`.
 */
const STRUCTURAL_VALUE_METHODS: readonly string[] = [
  "includes",
  "eagerLoad",
  "preload",
  "select",
  "group",
  "order",
  "joins",
  "leftOuterJoins",
  "with",
  "limit",
  "offset",
  "lock",
  "readonly",
  "reordering",
  "strictLoading",
  "reverseOrder",
  "distinct",
  "createWith",
  "skipQueryCache",
  "from",
];

/**
 * Mirrors: ActiveRecord::QueryMethods#structurally_incompatible_values_for
 * (query_methods.rb:2266-2277) — compare `@values[method]` on both sides,
 * treating a non-Array on the other side as compatible and comparing Arrays
 * after `uniq`.
 * @internal
 */
export function structurallyIncompatibleValuesFor(
  this: QueryMethodsHost,
  other: QueryMethodsHost,
): string[] {
  const values = other._values;
  const incompat: string[] = [];
  for (const method of STRUCTURAL_VALUE_METHODS) {
    let v1 = this._values[method];
    let v2 = values[method];
    if (Array.isArray(v1)) {
      if (!Array.isArray(v2)) continue;
      v1 = uniqArray(v1);
      v2 = uniqArray(v2);
    }
    if (!deepEqual(v1, v2)) incompat.push(method);
  }
  // trails splits `:joins` storage across `@values[:joins]` and the trails-only
  // `_joinClauses` (the explicit-ON and where-association joins), so the second
  // store is compared too — under the same `:joins` name, never reported twice.
  if (!deepEqual(this._joinClauses, other._joinClauses) && !incompat.includes("joins")) {
    incompat.push("joins");
  }
  return incompat;
}

function isRelationForCombining(value: unknown): value is QueryMethodsHost {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const wc = v.whereClause as Record<string, unknown> | undefined;
  const hc = v.havingClause as Record<string, unknown> | undefined;
  return (
    typeof wc === "object" &&
    wc !== null &&
    typeof wc.merge === "function" &&
    typeof wc.or === "function" &&
    typeof hc === "object" &&
    hc !== null &&
    typeof hc.merge === "function" &&
    typeof hc.or === "function" &&
    Array.isArray(v.referencesValues)
  );
}

function rubyClassNameOf(value: unknown): string {
  if (value === null) return "NilClass";
  if (Array.isArray(value)) return "Array";
  switch (typeof value) {
    case "object": {
      // Rails uses `other.class.name`; a plain object maps to Ruby's Hash,
      // but a class instance should report its own constructor name.
      const ctor = value.constructor;
      return ctor && ctor !== Object ? ctor.name : "Hash";
    }
    case "string":
      return "String";
    case "boolean":
      return value ? "TrueClass" : "FalseClass";
    case "number":
      return Number.isInteger(value) ? "Integer" : "Float";
    default:
      return typeof value;
  }
}

function assertRelationForCombining(other: unknown, methodName: string): void {
  if (!isRelationForCombining(other)) {
    throw argumentError(
      `You have passed ${rubyClassNameOf(other)} object to #${methodName}. Pass an ActiveRecord::Relation object instead.`,
    );
  }
}

function assertStructurallyCompatible(
  self: QueryMethodsHost,
  other: QueryMethodsHost,
  methodName: string,
): void {
  const incompat = structurallyIncompatibleValuesFor.call(self, other);
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
  return structurallyIncompatibleValuesFor.call(self, other).length === 0;
}

function andBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "and");
  assertStructurallyCompatible(this, other, "and");
  // Mirrors Rails: where_clause |= other.where_clause;
  //                having_clause |= other.having_clause;
  //                references_values |= other.references_values
  this.whereClause = this.whereClause.union(other.whereClause);
  this.havingClause = this.havingClause.union(other.havingClause);
  const unionStrings = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];
  this.referencesValues = unionStrings(this.referencesValues, other.referencesValues);
  this._manualReferences = unionStrings(this._manualReferences, other._manualReferences ?? []);
  return this;
}

function orBang(this: QueryMethodsHost, other: any): any {
  assertRelationForCombining(other, "or");
  assertStructurallyCompatible(this, other, "or");
  this.whereClause = this.whereClause.or(other.whereClause);
  this.havingClause = this.havingClause.or(other.havingClause);
  const unionStrings = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];
  this.referencesValues = unionStrings(this.referencesValues, other.referencesValues);
  this._manualReferences = unionStrings(this._manualReferences, other._manualReferences ?? []);
  return this;
}

function havingBang(
  this: QueryMethodsHost,
  opts: string | Record<string, unknown> | Nodes.Node,
  ...rest: unknown[]
): any {
  // Rails' `having` no-ops on a blank condition (`opts.blank? ? self : …`,
  // query_methods.rb:1198) — including an empty hash. Guard it here (mirroring
  // the same check `where` applies) so `having({})` stays a no-op rather than
  // routing an empty hash through PredicateBuilder, which now expands it to the
  // `1=0` contradiction.
  if (opts == null || isBlankArgument(opts)) return this;

  if (typeof opts === "string") {
    const sql = rest.length > 0 ? this._model.sanitizeSqlArray(opts, ...rest) : opts;
    this.havingClause = this.havingClause.plus(new WhereClause([new Nodes.SqlLiteral(sql)]));
    return this;
  }

  if (opts instanceof Nodes.Node) {
    this.havingClause = this.havingClause.plus(new WhereClause([opts]));
    return this;
  }

  if (typeof opts !== "object" || Array.isArray(opts)) {
    throw argumentError(`Unsupported argument type for having: ${typeof opts} (${String(opts)})`);
  }

  this.havingClause = this.havingClause.plus(
    new WhereClause([...this.predicateBuilder.buildFromHash(opts)]),
  );
  return this;
}

function limitBang(this: QueryMethodsHost, value: number | null): any {
  if (value == null) {
    this.limitValue = null;
    return this;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 0) {
    throw new Error(`Invalid limit value: ${String(value)}`);
  }
  this.limitValue = num;
  return this;
}

function offsetBang(this: QueryMethodsHost, value: number | null): any {
  // Mirrors `offset!` (query_methods.rb:1231-1234): the raw value is stored and
  // integer-coerced later, by `build_arel`'s `offset_value.to_i` (:1758).
  this.offsetValue = value;
  return this;
}

function lockBang(this: QueryMethodsHost, locks: string | boolean = true): any {
  if (typeof locks === "string") {
    this.lockValue = locks;
  } else {
    this.lockValue = locks ? "FOR UPDATE" : null;
  }
  return this;
}

function noneBang(this: QueryMethodsHost): any {
  if (!this._isNone) {
    this.whereClause = this.whereClause.plus(new WhereClause([new Nodes.SqlLiteral("1=0")]));
    this._isNone = true;
  }
  return this;
}

function isNullRelation(this: QueryMethodsHost): boolean {
  return this._isNone;
}

function readonlyBang(this: QueryMethodsHost, value = true): any {
  this.readonlyValue = value;
  return this;
}

function strictLoadingBang(this: QueryMethodsHost, value = true): any {
  this.strictLoadingValue = value;
  return this;
}

function createWithBang(this: QueryMethodsHost, value: Record<string, unknown> | null): any {
  if (value) {
    // Mirrors create_with! (query_methods.rb:1352): forbid un-permitted params.
    value = sanitizeForbiddenAttributes(value);
    this.createWithValue = { ...this.createWithValue, ...value };
  } else {
    this.createWithValue = {};
  }
  return this;
}

function fromBang(this: QueryMethodsHost, value: any, subqueryName?: string): any {
  this.fromClause = new FromClause(value ?? null, subqueryName ?? null);
  return this;
}

function distinctBang(this: QueryMethodsHost, value = true): any {
  this.distinctValue = value;
  return this;
}

function extendingBang(
  this: QueryMethodsHost,
  ...modules: Array<Record<string, (...args: any[]) => any> | ((rel: any) => void)>
): any {
  for (const mod of modules) {
    if (typeof mod === "function") {
      mod(this);
    } else {
      this.extendingValues = [...this.extendingValues, mod];
      // Bind extension methods to the scope-proxy-wrapped relation, not the
      // raw one, so a bare named-scope call inside an extension body (Rails'
      // `has_many :comments do; def newest; created.last; end; end`) resolves
      // through the same method_missing/scope delegation as `rel.created`.
      const wrapped = wrapWithScopeProxy(this);
      for (const [name, fn] of Object.entries(mod)) {
        (this as any)[name] = fn.bind(wrapped);
      }
    }
  }
  return this;
}

function optimizerHintsBang(this: QueryMethodsHost, ...args: string[]): any {
  // `self.optimizer_hints_values |= args` (query_methods.rb:1490-1493) — a
  // union, so a hint already present is not repeated.
  this.optimizerHintsValues = [...new Set([...this.optimizerHintsValues, ...args])];
  return this;
}

function reverseOrderBang(this: QueryMethodsHost): any {
  // Rails hands the whole (compact_blank'd) order list to reverse_sql_order, so an
  // empty order falls into its default branch: ORDER BY <pk> DESC, or an
  // IrreversibleOrderError when the table has no primary key. Mapping over the
  // clauses here skips that branch entirely, so delegate the empty case.
  // Rails' compact_blank is reject(&:blank?). activesupport's isBlank is not a
  // substitute here: it reports a key-less object as blank, but Ruby's blank? is
  // false for an Arel node (it has no #empty?), so routing clauses through it
  // would drop every Ordering. Only nil/blank-string clauses are blank in this
  // list; Arel nodes never are.
  //
  // `_rawOrderClauses` is the trails-side carrier for order SQL Rails keeps in
  // the same `order_values` list, so `reverse_sql_order`'s String branch owns
  // them here rather than at a caller-side "is this order reversible" branch.
  const rawClauses = this._rawOrderClauses;
  if (rawClauses.length > 0) {
    this._rawOrderClauses = (reverseSqlOrder.call(this, rawClauses) as string[]).map((clause) =>
      String(clause),
    );
  }
  const clauses = this.orderValues.filter(
    (clause) => clause != null && !(typeof clause === "string" && /^\s*$/.test(clause)),
  );
  if (clauses.length === 0) {
    // A raw order clause is still an order_values entry in Rails, so the
    // default ORDER BY <pk> DESC branch does not apply when one is present.
    if (rawClauses.length === 0) {
      this.orderValues = reverseSqlOrder.call(this, []) as typeof this.orderValues;
    }
    return this;
  }
  this.orderValues = clauses.map((clause) => {
    if (clause instanceof Nodes.Node) {
      // Arel::Nodes::SqlLiteral is a String subclass in Rails, so reverse_sql_order
      // reverses it via the `when String` branch (flip trailing ASC↔DESC), not .desc.
      if (clause instanceof Nodes.SqlLiteral) {
        const raw = String((clause as any).value ?? "").trim();
        if (isDoesNotSupportReverse(raw)) {
          throw new IrreversibleOrderError(
            `Order ${JSON.stringify(raw)} cannot be reversed automatically`,
          );
        }
        // Mirror Rails' String branch: split comma-separated terms and flip each
        // via `gsub(asc) || gsub(desc) || (s << " DESC")` (mutually exclusive).
        const flipped = raw
          .split(",")
          .map((term) => {
            const s = term.trim();
            if (/\s+ASC$/i.test(s)) return s.replace(/\s+ASC$/i, " DESC");
            if (/\s+DESC$/i.test(s)) return s.replace(/\s+DESC$/i, " ASC");
            return `${s} DESC`;
          })
          .join(", ");
        return new Nodes.SqlLiteral(flipped);
      }
      // Mirrors Rails reverse_sql_order: flip Arel::Nodes::Ordering subclasses
      // (Ascending/Descending/NullsFirst/NullsLast) via reverse(), and fall back
      // to desc() for bare expressions (Attribute, NodeExpression).
      if (typeof (clause as any).reverse === "function") return (clause as any).reverse();
      if (typeof (clause as any).desc === "function") return (clause as any).desc();
      return clause;
    }
    // A string order arg stays bare (Rails leaves String args unchanged in
    // order_values), so reversing it mirrors reverse_sql_order's String branch:
    // split on comma and flip each term's trailing ASC↔DESC (appending DESC when
    // unmarked). reverseSqlOrder runs isDoesNotSupportReverse (the faithful port
    // of does_not_support_reverse?), so unbalanced-paren sections and
    // "nulls first/last" still raise.
    const reversed = reverseSqlOrder.call(this, [clause]) as string[];
    return new Nodes.SqlLiteral(reversed.join(", "));
  });
  return this;
}

function skipQueryCacheBang(this: QueryMethodsHost, value = true): any {
  this.skipQueryCacheValue = value;
  return this;
}

function skipPreloadingBang(this: QueryMethodsHost): any {
  this._skipPreloading = true;
  return this;
}

function annotateBang(this: QueryMethodsHost, ...comments: string[]): any {
  this.annotateValues = [...this.annotateValues, ...comments];
  return this;
}

/**
 * Mirrors: ActiveRecord::QueryMethods#uniq! (query_methods.rb:1541-1546) —
 * `if values = @values[name]` then `values.uniq! if values.is_a?(Array) && !values.empty?`.
 */
function uniqBang(this: QueryMethodsHost, name?: string): any {
  if (name === undefined) return this;
  const values = this._values[name];
  if (Array.isArray(values) && values.length > 0) {
    this._values[name] = [...new Set(values)];
  }
  return this;
}

function excludingBang(this: QueryMethodsHost, records: any[]): any {
  const primaryKey = this.primaryKey;
  if (Array.isArray(primaryKey)) {
    throw new Error("excluding does not support models with composite primary keys");
  }
  const pk = primaryKey;

  // Rails `excluding!`: `predicate_builder[primary_key, records].invert`, where
  // `records` is `records + relations.flat_map(&:ids)` — scalar AR records plus
  // every relation arg's eagerly-materialized ids — built into ONE predicate.
  // Ruby materializes those ids before this call (synchronous query execution);
  // trails' builder is synchronous-and-lazy, so `_excludingArgs` leaves any
  // UNLOADED relation in `records` for us to defer here.
  const unloadedRelations = records.filter((r) => isRelationLike(r));
  const literalRecords = records.filter((r) => !isRelationLike(r));

  // No unloaded relations: every value's id is known now, so build the literal
  // predicate exactly as Rails does (array handler dereferences AR records to
  // their ids).
  if (unloadedRelations.length === 0) {
    // Rails `predicate_builder[primary_key, records].invert` — `#[]` reads the
    // attribute straight off the builder's arel table (predicate_builder.rb:53-55).
    this.whereClause = this.whereClause.plus(
      new WhereClause([
        this.predicateBuilder
          .build(this.predicateBuilder.table.arelTable.get(pk), literalRecords)
          .invert(),
      ]),
    );
    return this;
  }

  // Otherwise record a single `DeferredIdsNotIn` carrying both the known literal
  // record ids and the unloaded relations. trails cannot run their id-select
  // synchronously, so the load pipeline materializes `relations.flat_map(&:ids)`
  // and substitutes one literal `id NOT IN (records + relIds)` before compile —
  // matching Rails' single predicate and its extra-query-per-relation semantics
  // rather than emitting a `NOT IN (SELECT ...)` subquery. Folding the literals
  // into the same marker keeps it ONE predicate, not an `AND` of `NOT IN`s. The
  // marker carries a pk-select subquery only as a `toSql()` display fallback for
  // the (rare) no-load path; eager materialization here would require an async
  // `excluding`, breaking the chainable contract.
  const attribute = this.predicateBuilder.table.arelTable.get(pk);
  // Mirror the array handler's `x.is_a?(Base) ? x.id : x` deref.
  const literalIds = literalRecords.map((r) => (isBaseInstance(r) ? (r as any).id : r));
  // Build the positive `IN (subquery)` (Rails builds positively and inverts);
  // only its subquery `right` is needed for the marker's display fallback.
  const inlineSubquery = (this.predicateBuilder.build(attribute, unloadedRelations[0]) as Nodes.In)
    .right as Nodes.Node;
  this.whereClause = this.whereClause.plus(
    new WhereClause([
      new DeferredIdsNotIn(attribute, inlineSubquery, literalIds, unloadedRelations),
    ]),
  );
  return this;
}

/**
 * Mirrors: ActiveRecord::QueryMethods#construct_join_dependency
 * (query_methods.rb:1598).
 * @internal
 */
export function constructJoinDependency(
  this: QueryMethodsHost,
  associations: string | AssociationSpec[],
  joinType?: unknown,
): JoinDependency {
  return new JoinDependency(
    this.model,
    this.table,
    associations,
    (joinType ?? null) as typeof Nodes.InnerJoin | typeof Nodes.OuterJoin | null,
  );
}

// ---------------------------------------------------------------------------
// Private helpers — mirrors ActiveRecord::QueryMethods private block.
// Most stay non-exported so the extractor marks them internal: true.
// A handful are exported (assertModifiableBang, checkIfMethodHasArgumentsBang,
// isTableNameMatches, arelColumn{,s,WithTable,sFromHash}) so Relation can
// wire them as instance methods without re-implementing the bodies; they
// keep `@internal` JSDoc so TypeDoc + the rails-private-jsdoc lint rule
// continue to treat them as Rails-private.
// ---------------------------------------------------------------------------

/** @internal */
function asyncBang(this: QueryMethodsHost): QueryMethodsHost {
  (this as any)._async = true;
  return this;
}

/** Mirrors: ActiveRecord::QueryMethods#async (query_methods.rb:1678-1680). @internal */
export function async(this: QueryMethodsHost): QueryMethodsHost {
  return asyncBang.call((this as any).spawn());
}

/** @internal */
export function assertModifiableBang(this: QueryMethodsHost): void {
  if ((this as any)._loaded) {
    throw new UnmodifiableRelation();
  }
}

export function isBlankArgument(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * Mirrors `Relation#check_if_method_has_arguments!`
 * (query_methods.rb:2213-2222). `methodName` is Rails' `__callee__` Symbol,
 * spelled with its leading colon; interpolating a Symbol renders its name, so
 * the message drops the colon.
 * @internal
 */
export function checkIfMethodHasArgumentsBang(
  this: QueryMethodsHost,
  methodName: string,
  args: unknown[],
  message?: string,
  block?: (args: unknown[]) => void,
): void {
  if (!args || args.length === 0) {
    throw argumentError(message ?? `The method .${methodName.slice(1)}() must contain arguments.`);
  } else {
    block?.(args);

    const flat = flattenedArgs(args);
    args.length = 0;
    for (const a of flat) {
      if (!isBlankArgument(a)) args.push(a);
    }
  }
}

/** @internal */
export function flattenedArgs(args: unknown[]): unknown[] {
  // Mirrors Ruby `Array#flatten!`: recurse into nested arrays only. Hashes
  // (plain objects) and every other value pass through untouched, so
  // `with({ cte: rel })` keeps its CTE definition hash intact.
  return args.flatMap((e) => (Array.isArray(e) ? flattenedArgs(e) : e));
}

const VALID_DIRECTIONS = new Set(["asc", "desc"]);

/** @internal */
export function validateOrderArgs(this: QueryMethodsHost, args: unknown[]): void {
  for (const arg of args) {
    if (arg instanceof Map) {
      for (const [, value] of arg) {
        if (!VALID_DIRECTIONS.has(String(value).toLowerCase())) {
          throw argumentError(
            `Direction "${value}" is invalid. Valid directions are: [:asc, :desc, :ASC, :DESC, "asc", "desc", "ASC", "DESC"]`,
          );
        }
      }
      continue;
    }
    if (!isPlainObject(arg)) continue;
    for (const [, value] of Object.entries(arg)) {
      if (isPlainObject(value)) {
        validateOrderArgs.call(this, [value]);
      } else if (!VALID_DIRECTIONS.has(String(value).toLowerCase())) {
        throw argumentError(
          `Direction "${value}" is invalid. Valid directions are: [:asc, :desc, :ASC, :DESC, "asc", "desc", "ASC", "DESC"]`,
        );
      }
    }
  }
}

/** @internal */
export function processWithArgs(
  this: QueryMethodsHost,
  args: unknown[],
): Record<string, unknown>[] {
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

/** Ruby `Object#to_i` semantics: nil → 0, leading-integer parse otherwise. */
function toI(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** @internal */
export function buildCastValue(name: string, value: unknown): Attribute {
  return Attribute.withCastValue(name, value, new ValueType());
}

/**
 * Normalize a bind value before handing it to `BoundSqlLiteral`. Mirrors the
 * `ActiveRecord::Relation === value` branch of Rails' `build_bound_sql_literal`
 * / `build_named_bound_sql_literal` (query_methods.rb): a Relation is inlined as
 * `Arel.sql(value.to_sql)` so `where("id IN (?)", SomeRelation)` produces a
 * subquery rather than reaching `visitBindValue`'s `quote()`. Arel nodes are
 * rendered to SQL the same way (trails passes nodes here where Rails would not).
 * @internal
 */
export function normalizeBoundValue(this: QueryMethodsHost, value: unknown): unknown {
  if (value instanceof Nodes.Node) {
    return Arel.sql(connectionFor(this._model).toSql(value));
  }
  if (isRelationLike(value)) {
    return Arel.sql((value as { toSql(): string }).toSql());
  }
  // Mirrors the array / id_for_database transforms in build_bound_sql_literal /
  // build_named_bound_sql_literal (query_methods.rb:1686-1715): a collection
  // maps id_for_database over its elements (empty → nil), and a scalar AR object
  // is reduced to its id_for_database. The visitor's cast_bound_value + quote
  // run later, at render time. (Array/Set only, matching `quoteBoundValue` in
  // sanitization.ts rather than every `respond_to?(:map)` iterable.)
  if (Array.isArray(value) || value instanceof Set) {
    const mapped = Array.from(value).map((v) => (hasIdForDatabase(v) ? v.idForDatabase() : v));
    return mapped.length === 0 ? null : mapped;
  }
  if (hasIdForDatabase(value)) return value.idForDatabase();
  return value;
}

function hasIdForDatabase(value: unknown): value is { idForDatabase(): unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    typeof (value as { idForDatabase?: unknown }).idForDatabase === "function"
  );
}

/** @internal */
export function buildNamedBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: Record<string, unknown>,
): Nodes.BoundSqlLiteral {
  const namedBinds: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    namedBinds[key] = normalizeBoundValue.call(this, value);
  }
  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, [], namedBinds);
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

/** @internal */
export function buildBoundSqlLiteral(
  this: QueryMethodsHost,
  statement: string,
  values: unknown[],
): Nodes.BoundSqlLiteral {
  const positionalBinds = values.map((value) => normalizeBoundValue.call(this, value));
  try {
    return new Nodes.BoundSqlLiteral(`(${statement})`, positionalBinds, {});
  } catch (e: any) {
    throw new PreparedStatementInvalid(e?.message ?? String(e), { cause: e });
  }
}

/** @internal */
export function buildSubquery(
  this: QueryMethodsHost,
  subqueryAlias: string,
  selectValue: unknown,
): SelectManager {
  // query_methods.rb:1606: `except(:optimizer_hints).arel.as(subquery_alias)`.
  const relation =
    typeof (this as any).except === "function" ? (this as any).except("optimizerHints") : this;
  if (typeof relation.toArel !== "function") {
    throw new ActiveRecordError("Cannot build subquery: relation does not support toArel()");
  }
  // No identifier gate — the alias is caller-trusted and wrapped verbatim in a
  // `SqlLiteral` by `SelectManager#as`, matching Rails' `build_from`.
  const subquery = relation.toArel().as(subqueryAlias);
  const sm = new SelectManager(subquery);
  sm.project(selectValue as any);
  const hints: string[] = (this as any).optimizerHintsValues ?? [];
  if (hints.length > 0) sm.optimizerHints(...hints);
  return sm;
}

/** @internal */
export function isDoesNotSupportReverse(order: string): boolean {
  const plain = String(order);
  if (
    plain.includes(",") &&
    plain.split(",").find((section) => section.split("(").length !== section.split(")").length) !==
      undefined
  ) {
    return true;
  }
  return /\bnulls\s+(?:first|last)\b/i.test(plain);
}

/** @internal */
export function reverseSqlOrder(this: QueryMethodsHost, orderQuery: unknown[]): unknown[] {
  if (orderQuery.length === 0) {
    const pk = (this as any)._model?.primaryKey;
    // Rails guards on `if primary_key` alone: a composite primary key is an
    // Array, which is truthy, so it takes the same `table[primary_key].desc`
    // path as a scalar one. The raise is reserved for a nil primary key.
    if (pk) {
      const arelTable: any = this.table;
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

/** @internal */
export function extractTableNameFrom(orderTerm: string): string | null {
  const match = orderTerm.match(/^\W?(\w+)\W?\./);
  return match ? match[1] : null;
}

/**
 * Ruby `x.is_a?(Symbol)`. A Ruby Symbol is a JS string carrying its leading
 * colon (CLAUDE.md) — `:bar` is `":bar"` — so the colon is the discriminator
 * the Ruby side gets from the type. Rails turns on it at
 * query_methods.rb:1980 (`column_name.is_a?(Symbol) || !column_name.match?(/\W/)`)
 * and :2003 (`Arel.sql(is_symbol ? quote_table_name(field) : field)`).
 */
function isRubySymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/** Ruby `Symbol#name`. */
function symbolToName(s: string): string {
  const name = s.slice(1);
  if (name.trim() === "") {
    throw argumentError("Order symbols must have a non-blank name");
  }
  return name;
}

/** @internal */
export function columnReferences(orderArgs: unknown[]): string[] {
  const refs: string[] = [];
  for (const arg of orderArgs) {
    if (Array.isArray(arg)) {
      // `order([...])` passes a single array; Rails splats order args, so flatten
      // here too — otherwise a qualified column inside the array (e.g.
      // `order(["comments.body", ...])`) never registers its table reference and
      // an `includes` it names is not promoted to `eager_load`.
      refs.push(...columnReferences(arg));
    } else if (typeof arg === "string") {
      const term = isRubySymbol(arg) ? symbolToName(arg) : arg;
      const t = extractTableNameFrom(term);
      if (t) refs.push(t);
    } else if (arg instanceof Nodes.Attribute) {
      refs.push(relationName(arg.relation.name));
    } else if (arg instanceof Nodes.Ordering) {
      const expr = (arg as any).expr;
      if (expr instanceof Nodes.Attribute) {
        refs.push(relationName(expr.relation.name));
      }
    } else if (arg instanceof Map) {
      // Rails' Hash arm extracts a table only from String/Symbol keys; an Arel
      // key with a scalar direction falls through to nil, so `order(node => dir)`
      // never promotes an includes to eager_load.
      for (const [key, value] of arg) {
        if (isPlainObject(value)) {
          refs.push(String(key));
        } else if (typeof key === "string") {
          const t = extractTableNameFrom(isRubySymbol(key) ? symbolToName(key) : key);
          if (t) refs.push(t);
        }
      }
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

/** @internal */
export function sanitizeOrderArguments(this: QueryMethodsHost, orderArgs: unknown[]): unknown[] {
  for (let i = 0; i < orderArgs.length; i++) {
    orderArgs[i] = (this.model as any)?.sanitizeSqlForOrder?.(orderArgs[i]) ?? orderArgs[i];
  }
  return orderArgs;
}

function flattenedOrderKeysForRawSqlCheck(orderArgs: unknown[]): string[] {
  const result: string[] = [];
  for (const arg of orderArgs) {
    if (Array.isArray(arg)) {
      result.push(...flattenedOrderKeysForRawSqlCheck(arg));
    } else if (typeof arg === "string") {
      result.push(arg);
    } else if (arg instanceof Nodes.Node) {
      // Arel nodes (SqlLiteral, Attribute, Ordering, …) are pre-sanitized; skip them.
    } else if (arg instanceof Map) {
      for (const key of arg.keys()) {
        if (typeof key === "string") result.push(key);
      }
    } else if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        result.push(key);
        if (isPlainObject(value)) result.push(...flattenedOrderKeysForRawSqlCheck([value]));
      }
    }
  }
  return result;
}

function orderedNode(node: unknown, dir: unknown): unknown {
  return String(dir).toLowerCase() === "desc"
    ? new Nodes.Descending(node)
    : new Nodes.Ascending(node);
}

/** @internal */
export function preprocessOrderArgs(this: QueryMethodsHost, orderArgs: unknown[]): void {
  // disallowRawSqlBang skips symbols — resolve symbol names to strings first
  // so their descriptions are validated against the column-name matcher.
  const flattenedArgs = flattenedOrderKeysForRawSqlCheck(orderArgs).map((k) =>
    isRubySymbol(k) ? symbolToName(k) : k,
  );
  this.model.disallowRawSqlBang(flattenedArgs, {
    permit: (
      this.model.adapterClassSync() as unknown as { columnNameWithOrderMatcher(): RegExp }
    ).columnNameWithOrderMatcher(),
  });
  validateOrderArgs.call(this, orderArgs);
  const refs = columnReferences(orderArgs);
  if (refs.length > 0) {
    const existing: string[] = (this as any).referencesValues ?? [];
    (this as any).referencesValues = [...new Set([...existing, ...refs])];
  }
  const mapped: unknown[] = [];
  for (const arg of orderArgs) {
    if (isRubySymbol(arg)) {
      mapped.push(new Nodes.Ascending(orderColumn.call(this, symbolToName(arg))));
    } else if (arg instanceof Map) {
      // JS object keys can't be Arel nodes, so a Map is the analogue of Rails'
      // `order(node => :desc)` — the `when Arel::Nodes::Node` branch, which
      // sends the direction to the key itself instead of resolving it.
      for (const [key, value] of arg) {
        mapped.push(
          key instanceof Nodes.Node
            ? orderedNode(key, value)
            : orderedNode(orderColumn.call(this, String(key)), value),
        );
      }
    } else if (isPlainObject(arg)) {
      for (const rawKey of Object.keys(arg)) {
        const key = isRubySymbol(rawKey) ? symbolToName(rawKey) : rawKey;
        const value = (arg as Record<PropertyKey, unknown>)[rawKey];
        if (isPlainObject(value)) {
          for (const [field, dir] of Object.entries(value)) {
            mapped.push(orderedNode(orderColumn.call(this, [key, field].join(".")), dir));
          }
        } else {
          mapped.push(orderedNode(orderColumn.call(this, key), value));
        }
      }
    } else {
      mapped.push(arg);
    }
  }
  orderArgs.length = 0;
  orderArgs.push(...mapped);
}

/** @internal */
export function buildOrder(this: QueryMethodsHost, arel: any): void {
  // `_rawOrderClauses` is the trails-side carrier for `inOrderOf`'s generated
  // SQL, which Rails keeps inside order_values as an Arel CASE node.
  for (const rawClause of ((this as any)._rawOrderClauses ?? []) as string[]) {
    arel.order?.(new Nodes.SqlLiteral(rawClause));
  }
  // An Arel::Nodes::SqlLiteral is a String subclass in Ruby, so compact_blank
  // drops a blank one along with nil and "".
  const orders = ((this as any).orderValues ?? []).filter((o: unknown) => {
    if (o === null || o === undefined) return false;
    if (typeof o === "string") return o.trim() !== "";
    if (o instanceof Nodes.SqlLiteral) return String((o as any).value ?? "").trim() !== "";
    return true;
  });
  if (orders.length > 0) arel.order?.(...orders);
}

/** @internal */
export function buildCaseForValuePosition(
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

/** @internal */
export function resolveArelAttributes(this: QueryMethodsHost, attrs: unknown[]): unknown[] {
  const builder = (this as any).predicateBuilder;
  return attrs.flatMap((attr) => {
    if (attr !== null && typeof attr === "object" && typeof (attr as any).eq === "function") {
      return [attr];
    }
    if (attr !== null && typeof attr === "object" && !Array.isArray(attr)) {
      return Object.entries(attr as Record<string, unknown>).flatMap(([table, columns]) => {
        const tableName = String(table);
        return (Array.isArray(columns) ? columns : [columns]).map(
          (column) =>
            builder?.resolveArelAttribute?.(tableName, String(column)) ??
            new ArelTable(tableName).get(String(column)),
        );
      });
    }
    const s = String(attr);
    if (s.includes(".")) {
      const [table, column] = s.split(".", 2);
      return [builder?.resolveArelAttribute?.(table, column) ?? new ArelTable(table).get(column)];
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
  asyncBang,
  // query_methods.rb's private column helpers. Rails defines these once, in
  // QueryMethods, and Relation gets them by `include`; they ride the same
  // mixin here so `relation.ts` does not redeclare a second copy.
  isTableNameMatches,
  arelColumn,
  arelColumnWithTable,
  async,
  buildWhereClause,
  // Mirrors `alias :build_having_clause :build_where_clause`
  // (query_methods.rb:1654) — HAVING conditions parse identically to WHERE.
  buildHavingClause: buildWhereClause,
  buildNamedBoundSqlLiteral,
  buildBoundSqlLiteral,
  buildSubquery,
  buildCastValue,
  flattenedArgs,
  validateOrderArgs,
  processWithArgs,
  isDoesNotSupportReverse,
  reverseSqlOrder,
  extractTableNameFrom,
  columnReferences,
  sanitizeOrderArguments,
  preprocessOrderArgs,
  buildOrder,
  buildCaseForValuePosition,
  resolveArelAttributes,
  orderColumn,
  processSelectArgs,
  arelColumnAliasesFromHash,
  buildFrom,
  buildSelect,
  buildWithExpressionFromValue,
  buildWithValueFromHash,
  lookupTableKlassFromJoinDependencies,
  eachJoinDependencies,
  buildJoinDependencies,
  buildArel,
  selectNamedJoins,
  selectAssociationList,
  buildJoinBuckets,
  buildJoins,
  buildWith,
  buildWithJoinNode,
  structurallyIncompatibleValuesFor,
} as const;

// ---------------------------------------------------------------------------
// PR 2a private helpers — column resolution, select/from/with building.
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the active connection for a model on a relation-build read. Prefers
 * the connection threaded by the enclosing `withConnection` wrap (Rails
 * threads the `with_connection` connection through query building) so the read
 * stays off the deprecated `.connection` getter — which would flip the lease
 * permanent under `permanent_connection_checkout = :deprecated|:disallowed` when
 * a scope is built inside a wrap (eager-load/preload scope construction during
 * `first`/`last`/`find_each`). Falls back to the getter outside a wrap, which
 * lets `Base.connection` propagate its `ConnectionNotDefined` (or other
 * connection errors) so callers see the real cause rather than a `TypeError` on
 * the next `.quote*`/`.toSql` access.
 */
function connectionFor(modelClass: any): any {
  return threadedConnectionFor(modelClass) ?? modelClass?.connection;
}

/** @internal */
export function isTableNameMatches(this: QueryMethodsHost, from: unknown): boolean {
  const table: any = this.table;
  if (!table) return false;
  const modelClass: any = this.model;
  const name = escapeRegex(table.name);
  const quotedTableName = connectionFor(modelClass).quoteTableName(table.name);
  const quoted = escapeRegex(quotedTableName);
  // Mirror Rails: from.to_sql if from.respond_to?(:to_sql)
  const fromStr = typeof (from as any)?.toSql === "function" ? (from as any).toSql() : String(from);
  return new RegExp(`(?:^|(?<!FROM)\\s)(?:\\b${name}\\b|${quoted})(?!\\.)`, "i").test(fromStr);
}

/** @internal */
export function arelColumn(
  this: QueryMethodsHost,
  field: string | number | Nodes.Node | null,
  fallback?: (attr: string) => unknown,
): unknown {
  const modelClass: any = this.model;
  // Rails: a raw Arel node has no columns_hash/table.column form; it falls to
  // the block, else passes through unchanged (query_methods.rb:1996-2003).
  if (field instanceof Nodes.Node) return fallback ? fallback(field as any) : field;
  // Ruby `field = field.name if is_symbol = field.is_a?(Symbol)` then `field.to_s`
  // (query_methods.rb:1991-1992) — which is what carries `sum`'s Integer identity
  // default through as the literal it sums over, and `async_sum`'s nil one
  // (calculations.rb:182) as `""`, the empty `SUM()`.
  const isSymbol = isRubySymbol(field);
  let fieldStr = isSymbol ? symbolToName(field) : field == null ? "" : String(field);
  fieldStr = modelClass?._attributeAliases?.[fieldStr] ?? fieldStr;

  const fromClause = (this as any).fromClause;
  const from = fromClause?.name || fromClause?.value;

  if (modelClass?.columnsHash?.()[fieldStr] && (!from || isTableNameMatches.call(this, from))) {
    const table: any = this.table;
    return table.get(fieldStr);
  }
  const dotMatch = fieldStr.match(/^(?<table>(?:\w+\.)?\w+)\.(?<column>\w+)$/);
  if (dotMatch) {
    return arelColumnWithTable.call(this, dotMatch.groups!.table, dotMatch.groups!.column);
  }
  if (fallback) return fallback(fieldStr);
  // Ruby `Arel.sql(is_symbol ? quote_table_name(field) : field)`
  // (query_methods.rb:2005): a Symbol names a column and is quoted; a String is
  // raw SQL and is not.
  const quoted = isSymbol ? connectionFor(modelClass).quoteTableName(fieldStr) : fieldStr;
  return Arel.sql(quoted);
}

/** @internal */
export function arelColumns(this: QueryMethodsHost, columns: unknown[]): unknown[] {
  return columns.flatMap((field) => {
    if (field instanceof Nodes.Node) return [field]; // Arel nodes pass through directly
    if (typeof field === "string") return [arelColumn.call(this, field)];
    if (typeof field === "function") return [field()];
    if (isPlainObject(field)) return arelColumnsFromHash.call(this, field);
    return [field];
  });
}

/** @internal */
export function arelColumnWithTable(
  this: QueryMethodsHost,
  tableName: string,
  columnName: string,
): unknown {
  const existing = (this as any).referencesValues ?? [];
  if (!existing.includes(tableName)) (this as any).referencesValues = [...existing, tableName];
  // Ruby discriminates `column_name.is_a?(Symbol)` (query_methods.rb:1980): a
  // Symbol names a column, a String may be an expression.
  const isSymbol = isRubySymbol(columnName);
  if (isSymbol) columnName = symbolToName(columnName);
  const modelClass: any = this.model;
  // Schema-qualified table names (e.g. "schema.table") must not be passed to
  // ArelTable — the visitor quotes the whole string as one identifier, producing
  // "schema.table"."col" instead of "schema"."table"."col".
  if (tableName.includes(".")) {
    return Arel.sql(
      `${connectionFor(modelClass).quoteTableName(tableName)}.${connectionFor(modelClass).quoteColumnName(columnName)}`,
    );
  }
  if (isSymbol || !/\W/.test(columnName)) {
    const builder = (this as any).predicateBuilder;
    // Rails passes `lookup_table_klass_from_join_dependencies` as the block
    // (query_methods.rb:1982-1984), so a table name that only resolves through a
    // join dependency still finds its model — and its type caster.
    return (
      builder?.resolveArelAttribute?.(tableName, columnName, (name: string) =>
        lookupTableKlassFromJoinDependencies.call(this, name),
      ) ?? new ArelTable(tableName).get(columnName)
    );
  }
  return Arel.sql(`${connectionFor(modelClass).quoteTableName(tableName)}.${columnName}`);
}

/** @internal */
export function arelColumnsFromHash(
  this: QueryMethodsHost,
  fields: Record<string, unknown>,
): unknown[] {
  return Object.keys(fields).flatMap((key) => {
    const columns = fields[key];
    const tbl = isRubySymbol(key) ? symbolToName(key) : key;
    if (typeof columns === "string") {
      return [arelColumnWithTable.call(this, tbl, columns)];
    }
    if (Array.isArray(columns)) {
      return columns.map((col) => arelColumnWithTable.call(this, tbl, col));
    }
    throw new TypeError(`Expected Symbol, String or Array, got: ${typeof columns}`);
  });
}

/** @internal */
export function orderColumn(this: QueryMethodsHost, field: string): unknown {
  return arelColumn.call(this, field, (attrName: string) => {
    if (attrName === "count" && ((this as any).groupValues ?? []).length > 0) {
      const table: any = this.table;
      return table.get(attrName);
    }
    return Arel.sql(connectionFor(this.model).quoteTableName(attrName), { retryable: true });
  });
}

/** @internal */
export function processSelectArgs(this: QueryMethodsHost, fields: unknown[]): unknown[] {
  return fields.flatMap((field) => {
    // Mirror Rails `check_if_method_has_arguments!` → `compact_blank!`: a nil
    // (null/undefined) select arg is dropped, so `select(null)` clears nothing
    // instead of projecting a literal "null" column.
    if (field === null || field === undefined) return [];
    if (isPlainObject(field)) return arelColumnAliasesFromHash.call(this, field);
    return [field];
  });
}

function nodeAs(attr: unknown, quotedAlias: string): unknown {
  if (typeof (attr as any)?.as === "function") return (attr as any).as(quotedAlias);
  const attrSql = typeof (attr as any)?.toSql === "function" ? (attr as any).toSql() : String(attr);
  return Arel.sql(`${attrSql} AS ${quotedAlias}`);
}

/** @internal */
export function arelColumnAliasesFromHash(
  this: QueryMethodsHost,
  fields: Record<string, unknown>,
): unknown[] {
  return Object.keys(fields).flatMap((key) => {
    const columnsAliases = fields[key];
    const tableName = isRubySymbol(key) ? symbolToName(key) : key;
    const modelClass: any = this.model;
    const quoteAlias = (a: unknown): string =>
      connectionFor(modelClass).quoteColumnName(isRubySymbol(a) ? symbolToName(a) : String(a));
    if (isPlainObject(columnsAliases)) {
      return Object.keys(columnsAliases as object).map((col) => {
        const alias = (columnsAliases as any)[col];
        const attr = arelColumnWithTable.call(this, tableName, col);
        return nodeAs(attr instanceof Nodes.Node ? attr : Arel.sql(String(col)), quoteAlias(alias));
      });
    }
    if (Array.isArray(columnsAliases)) {
      return (columnsAliases as string[]).map((col) =>
        arelColumnWithTable.call(this, tableName, col),
      );
    }
    if (typeof columnsAliases === "string") {
      return [nodeAs(arelColumn.call(this, key), quoteAlias(columnsAliases))];
    }
    return [];
  });
}

/** @internal */
export function buildFrom(this: QueryMethodsHost): unknown {
  const fromClause = (this as any).fromClause;
  const opts = fromClause?.value;
  let name = fromClause?.name;
  if (opts && typeof opts.toArel === "function") {
    name ??= "subquery";
    const alias = String(name);
    // No identifier gate: Rails' `build_from` stores the caller-provided
    // `subquery_name` verbatim and wraps it in a `SqlLiteral` via
    // `SelectManager#as`, so the alias is caller-trusted. A regex guard here was
    // stricter than Rails and left the two `from(Relation)` paths asymmetric.
    // When the from-value is a Relation that needs eager loading (Rails
    // `opts.eager_loading?`), derive the from clause via
    // `apply_join_dependency` first (Rails build_from). This folds the eager
    // `includes`/`eager_load` into LEFT OUTER JOINs so a WHERE that references
    // the joined table (e.g. `posts.type`) resolves inside the subquery.
    // `applyJoinDependency` clones internally, so the caller's relation
    // is not mutated.
    let resolved: any = opts;
    if (
      typeof opts._eagerLoadingForSql === "function" &&
      opts._eagerLoadingForSql() &&
      typeof opts.applyJoinDependency === "function"
    ) {
      resolved = opts.applyJoinDependency();
    }
    // Rails build_from wraps `opts.arel.as(name)`, where `arel` is the full
    // `build_arel` — joins, HAVING, nested FROM, LOCK, CTEs, etc. Use the
    // comprehensive builder rather than the projection-only `toArel`, so the
    // subquery stays a live AST: its binds parameterize and its retryability is
    // determined by the actual child nodes (not unconditionally disabled).
    // `build_arel` projects the qualified table star (`"comments".*`) and does
    // NOT run `JoinDependency#apply_column_aliases` — that column-alias
    // projection (`t0_r0…`) is applied only in Rails' `exec_queries`/`to_sql`/
    // `pluck` paths, when the OUTER relation is eager, never in `build_from`.
    // So the folded eager subquery here emits plain star, matching Rails and
    // the where-subquery path (`relation-handler`); this is intentional, not a
    // shape deviation to converge away. See the
    // `eager-from-subquery-column-alias-projection` story.
    const subArel =
      typeof resolved.toArel === "function" ? resolved.toArel() : resolved.buildArel();
    return subArel.as(alias);
  }
  return opts;
}

// A table's `.*` projection. `Table#star` is a getter; a table ALIAS
// (Nodes.TableAlias) has no such helper, but `get("*")` yields the equivalent
// `<alias>.*` Attribute (the "*" sentinel skips column-name quoting either way).
function tableStar(table: any): unknown {
  return table.star ?? table.get("*");
}

/**
 * Mirror of Rails `Relation#build_select`: project the select list onto the
 * given Arel manager, defaulting to the qualified table star.
 *
 * @internal
 */
export function buildSelect(this: QueryMethodsHost, arel: any): void {
  const model: any = this.model;
  if (any(this.selectValues)) {
    arel.project(...arelColumns.call(this, this.selectValues));
  } else if (
    (model?.ignoredColumns?.length ?? 0) > 0 ||
    model?.enumerateColumnsInSelectStatements
  ) {
    arel.project(
      ...(model?.columnNames?.() ?? []).map((field: string) => {
        const table: any = (this as any).table ?? model?.arelTable;
        return table.get(field);
      }),
    );
  } else {
    const table: any = (this as any).table ?? model?.arelTable;
    arel.project(table ? tableStar(table) : Arel.sql("*"));
  }
}

/** @internal */
export function buildWithExpressionFromValue(this: QueryMethodsHost, value: unknown): unknown {
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
    const parts = value.map((query) => buildWithExpressionFromValue.call(this, query));
    return parts.reduce(
      (result: unknown, value: unknown) => new Nodes.UnionAll(result as any, value as any),
    );
  }
  throw argumentError(`Unsupported argument type: \`${String(value)}\` ${typeof value}`);
}

/** @internal */
export function buildWithValueFromHash(
  this: QueryMethodsHost,
  hash: Record<string, unknown>,
): unknown[] {
  return Object.keys(hash).map((key) => {
    const name = isRubySymbol(key) ? symbolToName(key) : key;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw argumentError(
        `Invalid CTE name "${name}": must be a valid SQL identifier (letters, digits, underscores, not starting with a digit).`,
      );
    }
    const expr = buildWithExpressionFromValue.call(this, (hash as any)[key]);
    return new Nodes.TableAlias(expr as any, name);
  });
}

// Rails passes lookupTableKlassFromJoinDependencies as a block to
// predicate_builder.build_from_hash so a nested-hash key that is a join's table
// name (rather than a direct reflection) resolves to the right model. It is
// wired through buildWhereClause's buildFromHash call above.
/** @internal */
export function lookupTableKlassFromJoinDependencies(
  this: QueryMethodsHost,
  tableName: string,
): unknown {
  let found: unknown = null;
  eachJoinDependencies.call(this, undefined, (join: any) => {
    if (tableName === join.tableName) found = join.baseKlass;
  });
  return found;
}

/** @internal */
export function eachJoinDependencies(
  this: QueryMethodsHost,
  joinDependencies: JoinDependency[] | undefined,
  block: (join: any) => void,
): void {
  const deps = joinDependencies ?? buildJoinDependencies.call(this);
  for (const jd of deps) {
    jd.each(block);
  }
}

/** @internal */
export function buildJoinDependencies(this: QueryMethodsHost): JoinDependency[] {
  // Mirror Rails build_join_dependencies (query_methods.rb):
  //   joins = joins_values | left_outer_joins_values | eager_load | includes
  //   join_dependencies.unshift construct_join_dependency(select_named_joins(joins, …), nil)
  // i.e. ALL named association joins fold into a single JoinDependency (nil join
  // type, since this set is consulted for table-klass / cast-type lookups, not
  // SQL emission). The named association joins in `joins_values` lead the union;
  // _joinClauses hold pre-resolved raw SQL (table + ON), not association names,
  // and do not contribute here.
  const joinNames: AssociationSpec[] = [];
  const addNames = (specs: ReadonlyArray<AssociationSpec>) => {
    for (const a of specs) if (!joinNames.includes(a)) joinNames.push(a);
  };
  addNames(this.joinsValues as AssociationSpec[]);
  addNames(this.leftOuterJoinsValues);
  addNames(this.eagerLoadValues);
  addNames(this.includesValues);

  const stashedJoins: JoinDependency[] = [];
  const named = selectNamedJoins.call(this, joinNames, stashedJoins);
  const jd = constructJoinDependency.call(this, named as AssociationSpec[], null);
  stashedJoins.unshift(jd);
  return stashedJoins;
}

/** @internal */
export function buildArel(
  this: QueryMethodsHost,
  // Rails threads the `with_connection` connection into every `build_arel`
  // call (query_methods.rb:1595, relation.rb:1023) and reads it for
  // `connection.sanitize_limit` (query_methods.rb:1757). trails' Arel building
  // is reachable on a model with no established connection (subquery/CTE
  // construction in tests), where `_conn()` raises — so a null connection
  // degrades to the same `sanitize_limit` as a module function, exactly as
  // `_annotationComments` degrades to the abstract `sanitizeAsSqlComment`.
  connection?: { sanitizeLimit(limit: unknown): number | Nodes.SqlLiteral } | null,
  aliases?: AliasTracker,
): any {
  const table: any = this.table;
  const arel = new SelectManager(table);

  buildJoins.call(this, arel, aliases);

  if (!this.whereClause.isEmpty()) arel.where(this.whereClause.ast);
  if (!this.havingClause.isEmpty()) arel.having(this.havingClause.ast);

  if (this.limitValue !== null)
    arel.take(
      buildCastValue(
        "LIMIT",
        connection?.sanitizeLimit
          ? connection.sanitizeLimit(this.limitValue)
          : sanitizeLimit(this.limitValue),
      ),
    );
  if (this.offsetValue !== null) arel.skip(buildCastValue("OFFSET", toI(this.offsetValue)));

  if (this.groupValues.length > 0)
    arel.group(
      ...(arelColumns.call(this, [...new Set(this.groupValues)]) as (Nodes.Node | string)[]),
    );

  buildOrder.call(this, arel);
  buildWith.call(this, arel);
  buildSelect.call(this, arel);

  if (this.optimizerHintsValues.length > 0) arel.optimizerHints?.(...this.optimizerHintsValues);
  arel.distinct(this.distinctValue);

  if (!this.fromClause.isEmpty()) arel.from(buildFrom.call(this) as any);

  if (this.lockValue) arel.lock(this.lockValue);

  if (this.annotateValues.length > 0) {
    const annotates =
      this.annotateValues.length > 1 ? [...new Set(this.annotateValues)] : this.annotateValues;
    arel.comment?.(...annotates);
  }

  return arel;
}

/** @internal */
export function selectNamedJoins(
  this: QueryMethodsHost,
  joinNames: unknown[],
  stashedJoins: unknown[] | null = null,
  block?: (join: unknown) => void,
): unknown[] {
  // Mirror Rails: partition into CTEJoins (symbols matching a with_value key)
  // vs ordinary association specs.
  const cteJoins: string[] = [];
  const associations: unknown[] = [];

  for (const joinName of joinNames) {
    if (
      isRubySymbol(joinName) &&
      any(this.withValues, (cte) => cte.name === symbolToName(joinName))
    ) {
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

/**
 * Mirrors `select_association_list` (query_methods.rb:1810-1823).
 *
 * Its `when Hash, Symbol, Array` arm keeps association specs and drops a raw
 * SQL String through the `else`. TypeScript collapses Ruby's Symbol and String
 * onto one type, so that `when` cannot be spelled by type: a string is a Symbol
 * here only when it names an association (or carries the leading colon), the
 * same discriminator `joins()` applies at insert time.
 *
 * @internal
 */
export function selectAssociationList(
  this: QueryMethodsHost,
  associations: unknown[],
  stashedJoins: unknown[] | null = null,
  block?: (join: unknown) => void,
): unknown[] {
  const result: unknown[] = [];
  for (const association of associations) {
    if (
      Array.isArray(association) ||
      isPlainObject(association) ||
      (typeof association === "string" && this._isNamedJoinValue(association))
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

/**
 * Rails only accepts Symbol/Hash/Array as a left-outer arg — a bare String is
 * not a Symbol, so `left_outer_joins("raw sql")` raises "only Hash, Symbol and
 * Array are allowed" lazily from build_join_buckets' block
 * (query_methods.rb:1830-1836) for anything its `select_association_list`
 * (query_methods.rb:1810-1824) does not recognize as a spec or stash as a
 * JoinDependency. trails collapses Ruby Symbol and String to one JS string
 * type, so an association name and a raw SQL fragment are indistinguishable by
 * type; a raw fragment is a string containing whitespace, which no association
 * identifier has. Reject those (and any other non-spec value) at build time,
 * mirroring Rails' lazy raise point and message. A JoinDependency is allowed
 * through — `select_association_list` stashes it rather than raising.
 *
 * @internal
 */
export function assertValidLeftOuterJoinsBang(values: unknown[]): void {
  for (const v of values) {
    if (typeof v === "string") {
      if (/\s/.test(v)) throw argumentError("only Hash, Symbol and Array are allowed");
    } else if (!Array.isArray(v) && !isPlainObject(v) && !(v instanceof JoinDependency)) {
      throw argumentError("only Hash, Symbol and Array are allowed");
    }
  }
}

/**
 * Rails' inner `select_named_joins` block (query_methods.rb:1865-1873): an Arel
 * Join node that survived the leading-join loop becomes a join_node
 * unconditionally, a CTEJoin — a `joins()` symbol matching a `with(...)` CTE
 * name — becomes an InnerJoin join_node, and anything else raises a plain
 * RuntimeError `"unknown class: <ClassName>"` (NOT the left-outer bucket's
 * ArgumentError, query_methods.rb:1834). Shared by `buildJoinBuckets` and the
 * live path's `emitJoinPlan`, which partition the same joins_values the same
 * way.
 *
 * @internal
 */
export function selectInnerNamedJoins(
  this: QueryMethodsHost,
  values: unknown[],
  stashedJoins: unknown[],
  joinNodes: Nodes.Join[],
): AssociationSpec[] {
  return selectNamedJoins.call(this, values, stashedJoins, (join) => {
    if (join instanceof Nodes.Join) {
      joinNodes.push(join);
    } else if (join instanceof CTEJoin) {
      joinNodes.push(buildWithJoinNode.call(this, join.name, Nodes.InnerJoin) as Nodes.Join);
    } else {
      throw new Error(
        `unknown class: ${(join as { constructor?: { name?: string } })?.constructor?.name}`,
      );
    }
  }) as AssociationSpec[];
}

/** @internal */
export function buildJoinBuckets(
  this: QueryMethodsHost,
): [Record<string, unknown[]>, typeof Nodes.InnerJoin | typeof Nodes.OuterJoin] {
  const buckets: Record<string, unknown[]> = {
    leading_join: [],
    join_node: [],
    stashed_join: [],
    named_join: [],
  };

  const joinsValues = this.joinsValues;

  // Mirror Rails build_join_buckets (query_methods.rb:1828–1876):
  // When left_outer_joins_values is non-empty, Rails runs select_named_joins on
  // them to build stashed_left_joins. If joins_values is also empty, it returns
  // early with OuterJoin type and named_join populated. Otherwise the left-outer
  // JoinDependency is prepended to stashed_left_joins.
  const leftOuterJoinsValues = this.leftOuterJoinsValues;
  const stashedLeft: JoinDependency[] = [];
  if (leftOuterJoinsValues.length > 0) {
    assertValidLeftOuterJoinsBang(leftOuterJoinsValues);
    // Mirror Rails' block (query_methods.rb:1830-1836): a CTEJoin becomes an
    // OuterJoin join_node; any other non-association value raises.
    const namedLeft = selectNamedJoins.call(this, leftOuterJoinsValues, stashedLeft, (left) => {
      if (left instanceof CTEJoin) {
        buckets.join_node.push(buildWithJoinNode.call(this, left.name, Nodes.OuterJoin));
      } else {
        throw argumentError("only Hash, Symbol and Array are allowed");
      }
    });

    if (joinsValues.length === 0 && this._joinClauses.length === 0) {
      // query_methods.rb:1838-1842: `if joins_values.empty?`.
      buckets.named_join.push(...namedLeft);
      buckets.stashed_join.push(...stashedLeft);
      return [buckets, Nodes.OuterJoin];
    }

    const leftJd = constructJoinDependency.call(
      this,
      namedLeft as AssociationSpec[],
      Nodes.OuterJoin,
    );
    stashedLeft.unshift(leftJd);
  }

  // query_methods.rb:1847-1850. The popped JoinDependency is the eager stash
  // `apply_join_dependency` pushed in; a cross-klass merged one fails
  // `base_klass == model` and stays in the stream for `select_named_joins`.
  const joins = [...joinsValues];
  const lastJoinValue = joins[joins.length - 1];
  let stashedEagerLoad: JoinDependency | undefined;
  if (lastJoinValue instanceof JoinDependency) {
    if (lastJoinValue.baseKlass === this.model) {
      joins.pop();
      stashedEagerLoad = lastJoinValue;
    }
  }

  // query_methods.rb:1856-1862: `stashed_eager_load || stashed_left_joins`.
  const hasStashed = Boolean(stashedEagerLoad) || stashedLeft.length > 0;

  // query_methods.rb:1851-1853. Rails wraps every String; trails collapses
  // Ruby's Symbol and String into one type, so an association-name string
  // stays a named join value instead of becoming a raw SQL fragment.
  for (const [i, v] of joins.entries()) {
    if (typeof v === "string" && !this._isNamedJoinValue(v)) {
      joins[i] = new Nodes.StringJoin(Arel.sql(v.trim()) as any) as Nodes.Join;
    }
  }

  // query_methods.rb:1855-1862: only the LEADING run of Join nodes is shifted
  // off and routed by `hasStashed`; a Join node sitting behind a named join
  // falls through to the `select_named_joins` block below, which buckets it as
  // a join_node unconditionally.
  while (joins[0] instanceof Nodes.Join) {
    const joinNode = joins.shift() as Nodes.Join;
    if (!(joinNode instanceof Nodes.LeadingJoin) && hasStashed) {
      buckets.join_node.push(joinNode);
    } else {
      buckets.leading_join.push(joinNode);
    }
  }

  // query_methods.rb:1864-1873.
  const innerJoinNodes: Nodes.Join[] = [];
  buckets.named_join.push(
    ...selectInnerNamedJoins.call(this, joins, buckets.stashed_join, innerJoinNodes),
  );
  buckets.join_node.push(...innerJoinNodes);

  // query_methods.rb:1875-1876 — the eager stash goes in LAST.
  buckets.stashed_join.push(...stashedLeft);
  if (stashedEagerLoad) buckets.stashed_join.push(stashedEagerLoad);

  return [buckets, Nodes.InnerJoin];
}

/**
 * Resolved inputs for `emitJoinPlan` — the bucket-routed join nodes plus the
 * stashed JoinDependencies to fold into the primary named/left JD. `buildJoins`
 * computes a plan and hands it to the shared emitter. The eager JoinDependency
 * rides in `joins_values` (Rails `apply_join_dependency`) and is stashed from
 * there; `aliases` is threaded in only by the `from(relation)` subquery path,
 * from `build_from`.
 *
 * @internal
 */
export interface JoinEmissionPlan {
  /** LeadingJoin nodes (and, when no stash exists, all raw join nodes), prepended. */
  leadingJoins: Nodes.Join[];
  /** Non-leading raw join nodes, appended last. */
  joinNodes: Nodes.Join[];
  /**
   * JoinDependencies folded into the primary named/left JD's `joinConstraints`
   * (the folded left-outer JD — and, on the subquery path, the eager stash).
   * When no named/left-outer association join exists, the first is the primary.
   */
  stashedJoins: JoinDependency[];
  /** `buckets[:named_join]`, already partitioned by the caller. */
  namedJoins: AssociationSpec[];
  /**
   * The join type `build_join_buckets` returned alongside the buckets
   * (query_methods.rb:1841/1878).
   */
  joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  /** Tracker threaded in from `build_from`; absent on the live path. */
  aliases?: AliasTracker;
  /**
   * The shared tracker, built by the caller via the converged
   * `Relation#aliasTracker(leading_joins + join_nodes, aliases)`
   * (query_methods.rb:1894) and seeded with the resolved `_joinClauses`
   * tables (`seedJoinClauseAliases`). A memoized thunk, not an instance:
   * Rails only builds `alias_tracker` inside the
   * `unless named_joins.empty? && stashed_joins.empty?` guard
   * (query_methods.rb:1893), so a relation with no join dependencies to emit
   * must never touch it — `Relation#aliasTracker` reads
   * `model.connectionPool()`, which raises `ConnectionNotDefined` on a
   * connectionless model.
   */
  tracker: () => AliasTracker;
}

/**
 * Single shared port of Rails `build_joins` (query_methods.rb:1881) emission:
 * given a resolved {@link JoinEmissionPlan}, push every join node onto the
 * Arel `SelectManager`. `buildJoins` delegates here so the left_outer/joins
 * dedup fold (PR #3501 / #3890) lives in exactly one place and cannot re-drift.
 *
 * @internal
 */
export function emitJoinPlan(this: QueryMethodsHost, manager: any, plan: JoinEmissionPlan): void {
  if (plan.leadingJoins.length > 0) manager.prependJoinNodes(...plan.leadingJoins);

  // Raw join clauses (pre-resolved SQL join specs). `as` aliasing mirrors the
  // live path; `on` is an Arel predicate node (binds thread through the
  // collector) or an inlined raw-SQL fragment wrapped as SqlLiteral.
  for (const j of this._joinClauses as any[]) {
    const tableNode = j.quoted
      ? j.as
        ? new ArelTable(j.table, { as: j.as })
        : new ArelTable(j.table)
      : j.table;
    const onNode = typeof j.on === "string" ? Arel.sql(j.on) : j.on;
    if (j.type === "inner") {
      manager.join(tableNode);
    } else {
      manager.outerJoin(tableNode);
    }
    if (onNode != null) manager.on(onNode);
  }

  // One AliasTracker shared across every JoinDependency, mirroring Rails' single
  // `build_joins` `alias_tracker(leading_joins + join_nodes, aliases)`
  // (query_methods.rb:1891). Built by the caller (`buildJoins`) via the
  // converged `Relation#aliasTracker` and threaded in on the plan. Seeding it
  // with the leading-join + join-node tables means a JoinDependency joining a
  // table already claimed by a leading/raw join node is re-aliased to its
  // `alias_candidate`. Each dependency claims and aliases its tables lazily at
  // emit-time in `makeConstraints`, so threading this one tracker through every
  // `joinConstraints` makes a merged join onto an already-joined table collide
  // and alias. `plan.aliases` is the tracker threaded in from `build_from`
  // (Rails' `aliases` argument), whose counts the caller folded in. Invoked
  // lazily (see JoinEmissionPlan#tracker) only where a JoinDependency emits;
  // `trackerWasBuilt` records that a forcing site actually ran, gating the
  // aliases writeback below.
  let trackerWasBuilt = false;
  const sharedTracker = (): AliasTracker => {
    trackerWasBuilt = true;
    return plan.tracker();
  };
  const references = (this as any)._aliasableReferences();

  // Rails build_joins (query_methods.rb:1881-1897) emits ALL named association
  // joins — joins_values (InnerJoin) plus the folded left_outer JoinDependency —
  // through a SINGLE `construct_join_dependency(named_joins, join_type)` whose
  // `join_constraints(stashed_joins, …)` folds the stash in one call, so an
  // association joined both ways (`joins(:posts).left_outer_joins(:posts)`)
  // dedups via `walk` to one INNER JOIN. `join_type` is InnerJoin normally,
  // OuterJoin in the pure-left-outer short-circuit (no joins_values). The guard
  // mirrors `unless named_joins.empty? && stashed_joins.empty?`; when named_joins
  // is empty but the stash is not, Rails still builds an empty
  // `construct_join_dependency([], InnerJoin)` and folds the stash into it.
  const namedJoins = plan.namedJoins;
  const joinType = plan.joinType;
  if (namedJoins.length > 0 || plan.stashedJoins.length > 0) {
    const jd = constructJoinDependency.call(this, namedJoins, joinType);
    for (const node of jd.joinConstraints(plan.stashedJoins, sharedTracker(), references))
      manager.appendJoinNode(node);
  }

  // `build_joins` concats `buckets[:join_node]` once (query_methods.rb:1899);
  // both callers filled it in Rails' order — raw joins_values Join nodes from
  // the `while joins.first.is_a?(Arel::Nodes::Join)` loop
  // (query_methods.rb:1856-1863) before the CTE nodes the select_named_joins
  // block appends (query_methods.rb:1865-1873).
  for (const node of plan.joinNodes) manager.appendJoinNode(node);

  // When a tracker was threaded in (Rails passes the alias HASH itself to
  // `join_scope.arel(alias_tracker.aliases)`, so claims made while building this
  // manager mutate the caller's tracker), propagate the alias counts this
  // emission claimed back into it. Without this, a scope's `joins(:post)` join
  // source and a sibling explicit `:post` join in the SAME outer JoinDependency
  // would both re-alias `posts` to the same candidate and collide — the outer
  // tracker must learn what the nested scope build already claimed.
  // Only when a JoinDependency emission actually forced the tracker: Rails'
  // `build_joins` skips `alias_tracker` entirely when the
  // `named_joins.empty? && stashed_joins.empty?` guard fails, even with
  // `aliases` supplied (query_methods.rb:1893) — a joinless nested
  // `join_scope.arel(aliases)` build claims nothing in the caller's hash, and
  // forcing the thunk here would re-open the `connectionPool()` raise on a
  // connectionless model that the lazy tracker exists to avoid.
  if (plan.aliases && trackerWasBuilt) {
    for (const [name, count] of sharedTracker().aliases) {
      if (count > (plan.aliases.aliases.get(name) ?? 0)) plan.aliases.aliases.set(name, count);
    }
  }
}

/** @internal */
export function buildJoins(this: QueryMethodsHost, arel: any, aliases?: AliasTracker): void {
  // query_methods.rb:1882 — `return if joins_values.empty? && left_outer_joins_values.empty?`.
  // `_joinClauses` is trails-only compensation for raw join clauses living
  // outside `joins_values` (see merged-join-alias-tracker.ts).
  if (
    this.joinsValues.length === 0 &&
    this.leftOuterJoinsValues.length === 0 &&
    this._joinClauses.length === 0
  )
    return;

  // Buckets fold eager into stashed_join. Delegate emission to the shared
  // `build_joins` port.
  const [buckets, joinType] = buildJoinBuckets.call(this);
  const leadingJoins = buckets.leading_join as Nodes.Join[];
  const joinNodes = buckets.join_node as Nodes.Join[];
  // Rails: `alias_tracker = alias_tracker(leading_joins + join_nodes, aliases)`
  // (query_methods.rb:1894) — the converged `Relation#aliasTracker`, built
  // lazily behind the same `unless named_joins.empty? && stashed_joins.empty?`
  // guard Rails builds it under (see JoinEmissionPlan#tracker). The
  // `_joinClauses` seeding is trails-only compensation for raw join clauses
  // living outside `joins_values` (see merged-join-alias-tracker.ts).
  let memoTracker: AliasTracker | undefined;
  const tracker = (): AliasTracker => {
    if (!memoTracker) {
      memoTracker = this.aliasTracker([...leadingJoins, ...joinNodes], aliases?.aliases);
      seedJoinClauseAliases(this, memoTracker);
    }
    return memoTracker;
  };
  emitJoinPlan.call(this, arel, {
    leadingJoins,
    joinNodes,
    stashedJoins: buckets.stashed_join as JoinDependency[],
    namedJoins: buckets.named_join as AssociationSpec[],
    joinType,
    aliases,
    tracker,
  });
}

/** @internal */
export function buildWith(this: QueryMethodsHost, arel: any): void {
  if (!this.withValues || this.withValues.length === 0) return;

  const hasRecursive = this.withValues.some((c) => c.recursive);
  const withNodes = this.withValues.map((c) => new Nodes.Cte(c.name, c.expression as any));

  if (hasRecursive) {
    arel.withRecursive?.(...withNodes);
  } else {
    arel.with?.(...withNodes);
  }
}

/** @internal */
export function buildWithJoinNode(
  this: QueryMethodsHost,
  name: string,
  kind: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin = Nodes.InnerJoin,
): unknown {
  const mc = this.model;
  const table: any = this.table;
  if (!table) throw new ActiveRecordError("Cannot build CTE join node: model has no arelTable");
  const withTable = new ArelTable(name);
  // Rails: with_table[model.model_name.to_s.foreign_key].eq(table[model.primary_key])
  const modelName = String(mc?.modelName ?? mc?.name ?? "Model");
  const fk = foreignKey(modelName);
  if (Array.isArray(mc?.primaryKey)) {
    throw new ActiveRecordError("Cannot build CTE join node with composite primary keys");
  }
  const pk = mc?.primaryKey ?? "id";
  return table
    .join(withTable, kind)
    .on(withTable.get(fk).eq(table.get(pk)))
    .joinSources()[0];
}
