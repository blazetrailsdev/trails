import { Temporal } from "@blazetrails/activesupport/temporal";
import { hexdigest, Notifications } from "@blazetrails/activesupport";
import {
  Table,
  SelectManager,
  Nodes,
  Visitors,
  UpdateManager,
  DeleteManager,
} from "@blazetrails/arel";
import type { Base } from "./base.js";
import { _setRelationCtor, _setScopeProxyWrapper } from "./base.js";
import { ConnectionNotEstablished, RecordNotSaved, RecordNotUnique } from "./errors.js";
import { disallowRawSqlBang } from "./sanitization.js";
import {
  columnNameMatcher as abstractColumnNameMatcher,
  defaultSqlTimezone,
} from "./connection-adapters/abstract/sql-formatting.js";
import { habtmTargetFk, joinHabtmTableNames, modelRegistry } from "./associations.js";
import { applyThenable, stripThenable } from "./relation/thenable.js";
import { getInheritanceColumn, isStiSubclass } from "./inheritance.js";
import {
  underscore as _toUnderscore,
  camelize as _camelize,
  singularize as _singularize,
  pluralize as _pluralize,
} from "@blazetrails/activesupport";

import { Range } from "./connection-adapters/postgresql/oid/range.js";
export { Range };
import {
  WhereChain,
  QueryMethodBangs,
  areStructurallyCompatible,
  VALID_UNSCOPING_VALUES,
  argumentError,
  assertModifiableBang as _assertModifiableBang,
  checkIfMethodHasArgumentsBang as _checkIfMethodHasArgumentsBang,
  isTableNameMatches as _isTableNameMatches,
  arelColumn as _arelColumn,
  arelColumns as _arelColumns,
  arelColumnWithTable as _arelColumnWithTable,
  arelColumnsFromHash as _arelColumnsFromHash,
  referencesFromConditions,
  type UnscopeType,
  type AssociationSpec,
} from "./relation/query-methods.js";
import * as _qm from "./relation/query-methods.js";
import {
  Batches,
  ensureValidOptionsForBatchingBang as _ensureValidOptionsForBatchingBang,
  applyLimits as _applyLimits,
  applyStartLimit as _applyStartLimit,
  applyFinishLimit as _applyFinishLimit,
  batchCondition as _batchCondition,
  buildBatchOrders as _buildBatchOrders,
  actOnIgnoredOrder as _actOnIgnoredOrder,
  batchOnLoadedRelation as _batchOnLoadedRelation,
  recordCursorValues as _recordCursorValues,
  compareValuesForOrder as _compareValuesForOrder,
  batchOnUnloadedRelation as _batchOnUnloadedRelation,
} from "./relation/batches.js";
import { wrapWithScopeProxy } from "./relation/delegation.js";
import { InsertAll, type InsertAllOptions } from "./insert-all.js";
import { ScopeRegistry } from "./scoping.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { include, type Included } from "@blazetrails/activesupport";
import {
  Calculations,
  type CalculationMethods,
  groupColumnToArel,
  aggregateColumn as _aggregateColumn,
  isAllAttributes as _isAllAttributes,
  hasInclude as _hasInclude,
  performCalculation as _performCalculation,
  isDistinctSelect as _isDistinctSelect,
  operationOverAggregateColumn as _operationOverAggregateColumn,
  executeSimpleCalculation as _executeSimpleCalculation,
  executeGroupedCalculation as _executeGroupedCalculation,
  typeFor as _typeFor,
  lookupCastTypeFromJoinDependencies as _lookupCastTypeFromJoinDependencies,
  typeCastPluckValues as _typeCastPluckValues,
  typeCastCalculatedValue as _typeCastCalculatedValue,
  selectForCount as _selectForCount,
  isBuildCountSubquery as _isBuildCountSubquery,
  buildCountSubquery as _buildCountSubquery,
} from "./relation/calculations.js";
import * as _fm from "./relation/finder-methods.js";
import { FinderMethods } from "./relation/finder-methods.js";
import * as _sm from "./relation/spawn-methods.js";
import { SpawnMethods } from "./relation/spawn-methods.js";
import { FromClause } from "./relation/from-clause.js";
import { TableMetadata } from "./table-metadata.js";
import {
  WhereClause,
  getWrappedSqlPredicates as predicatesWithWrappedSqlLiterals,
} from "./relation/where-clause.js";
import { BatchEnumerator } from "./relation/batches/batch-enumerator.js";
import { touchAttributesWithTime } from "./timestamp.js";
import { ExplainRegistry } from "./explain-registry.js";
import {
  renderBind as _renderBind,
  collectingQueriesForExplain as _collectingQueriesForExplain,
} from "./explain.js";
import { inspectExplainOption } from "./adapter.js";
import type { DatabaseAdapter, ExplainOption } from "./adapter.js";
import { rubyInspectArray } from "./relation/ruby-inspect.js";
import { JoinDependency } from "./associations/join-dependency.js";
import { invokeScopeLambda } from "./associations/association-scope.js";
import type { AliasTracker } from "./associations/alias-tracker.js";

/**
 * A Relation returned from `load()` / `reload()` — a normal Relation with
 * `then` stripped so `await rel.load()` resolves to the relation itself
 * rather than being recursively unwrapped through the thenable contract to
 * `T[]`. (Matches `stripThenable` which only shadows `.then`; `.catch` and
 * `.finally` aren't part of `Awaited<>`'s unwrap rules, so they stay.)
 */
export type LoadedRelation<R> = Omit<R, "then">;

/**
 * Enforce Rails' `extract_options!` shape on variadic `explain(...)`
 * inputs: at most one hash option, and if present it must be the last
 * positional argument. This keeps adapters (especially MySQL, whose
 * `EXPLAIN FORMAT=X ANALYZE` is invalid) from receiving orderings they
 * can't render.
 */
/**
 * Add a join clause to `clauses` for whereMissing/whereAssociated.
 * - Skip if a join with the same table+ON already exists regardless of type
 *   (e.g. leftJoins(:assoc).whereAssociated(:assoc) is valid — the existing
 *   LEFT OUTER JOIN already covers the table; the IS NOT NULL predicate
 *   provides the restriction).
 * - Throw if a join to the same table with a *different* ON clause exists —
 *   that would require aliasing which is not supported.
 */
function formatCacheTimestamp(ts: Temporal.Instant, format: "usec" | "number" | string): string {
  const dt = ts.toZonedDateTimeISO("UTC");
  const y = dt.year.toString().padStart(4, "0");
  const mo = dt.month.toString().padStart(2, "0");
  const d = dt.day.toString().padStart(2, "0");
  const h = dt.hour.toString().padStart(2, "0");
  const mi = dt.minute.toString().padStart(2, "0");
  const s = dt.second.toString().padStart(2, "0");
  if (format === "number") return `${y}${mo}${d}${h}${mi}${s}`;
  if (format !== "usec") {
    throw new Error(
      `Unknown cacheTimestampFormat: ${JSON.stringify(format)}. Supported values: "usec", "number".`,
    );
  }
  const us = (dt.millisecond * 1000 + dt.microsecond).toString().padStart(6, "0");
  return `${y}${mo}${d}${h}${mi}${s}${us}`;
}

function _addAssocJoin(
  clauses: Array<{ type: "inner" | "left"; table: string; on: string; quoted?: boolean }>,
  type: "inner" | "left",
  join: { table: string; on: string },
  assocName: string,
  modelClass: any,
  leftOuterJoinsValues?: ReadonlyArray<unknown>,
): void {
  // If the association is already covered by _leftOuterJoinsValues (deferred
  // LEFT OUTER JOIN path), skip — the join will be emitted when the manager
  // is built, so adding a second join here would cause ambiguous column names.
  if (leftOuterJoinsValues?.some((v) => typeof v === "string" && v === assocName)) return;
  const sameTableJoins = clauses.filter((j) => j.table === join.table);
  if (sameTableJoins.length > 0) {
    if (sameTableJoins.every((j) => j.on === join.on)) return; // all compatible — skip
    throw new Error(
      `where${type === "inner" ? "Associated" : "Missing"}: cannot add ${type.toUpperCase()} JOIN for '${assocName}' on ${modelClass.name} ` +
        `— a different join to '${join.table}' already exists and cannot be represented without aliasing.`,
    );
  }
  clauses.push({ type, table: join.table, on: join.on, quoted: true });
}

/**
 * Return the alias bare if it is a valid SQL identifier (letters/digits/underscore,
 * starting with a letter or underscore), otherwise double-quote and escape it.
 * Mirrors Rails: aliases come from Symbol/string caller code — Rails assumes they
 * are safe identifiers. We add a guard so malformed aliases don't produce invalid SQL.
 */
function _safeAlias(alias: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias) ? alias : `"${alias.replace(/"/g, '""')}"`;
}

function validateExplainOptions(options: ExplainOption[]): void {
  let seenHash = false;
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (typeof o === "string") {
      if (seenHash) {
        throw new Error(
          "EXPLAIN option hash must be the last argument (Rails' extract_options! semantics)",
        );
      }
      continue;
    }
    if (!o || typeof o !== "object") {
      throw new TypeError(
        `EXPLAIN option must be a string flag or an options hash; got ${String(o)}`,
      );
    }
    if (seenHash) {
      throw new Error("EXPLAIN accepts at most one option hash");
    }
    seenHash = true;
  }
}

/**
 * Relation — the lazy, chainable query interface.
 *
 * Mirrors: ActiveRecord::Relation
 */

function hasTopLevelComma(s: string): boolean {
  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      // SQL doubled-quote escape ("" or ``)
      if (ch === quote && s[i + 1] === quote) {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return true;
  }
  return false;
}

function resolveColumnNameMatcher(adapter: any): RegExp {
  // Walk adapter → inner to find a static columnNameMatcher on the concrete adapter class.
  let a = adapter;
  while (a) {
    const matcher = (a.constructor as any)?.columnNameMatcher?.();
    if (matcher) return matcher;
    a = a.inner;
  }
  return abstractColumnNameMatcher();
}

/**
 * Sentinel preload scope threaded into the preloader when the parent relation
 * is strict-loading. The preloader's `cascade_strict_loading` reads
 * `isStrictLoading` to propagate strictness onto the derived scope, while
 * `isEmptyScope` keeps it from being merged like a real scope.
 *
 * Mirrors: ActiveRecord::Relation::StrictLoadingScope
 */
export const StrictLoadingScope = {
  isEmptyScope: true,
  isStrictLoading: true,
} as const;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Relation<T extends Base> {
  private _modelClass: typeof Base;
  /** @internal */
  _whereClause: WhereClause = WhereClause.empty();
  private _orderClauses: Array<string | [string, "asc" | "desc"] | { raw: string } | Nodes.Node> =
    [];
  private _rawOrderClauses: string[] = [];
  private _reordering = false;
  private _limitValue: number | null = null;
  private _offsetValue: number | null = null;
  private _selectColumns: (string | symbol | Nodes.Node)[] | null = null;
  private _isDistinct = false;
  private _distinctOnColumns: string[] = [];
  private _groupColumns: string[] = [];
  /** @internal */
  _havingClause: WhereClause = WhereClause.empty();
  private _isNone = false;
  private _lockValue: string | null = null;
  private _setOperation: {
    type: "union" | "unionAll" | "intersect" | "except";
    other: Relation<T>;
  } | null = null;
  private _joinClauses: Array<{
    type: "inner" | "left";
    table: string;
    on: string;
    quoted?: boolean;
  }> = [];
  private _joinValues: (string | Nodes.Join)[] = [];
  private _leftOuterJoinsValues: AssociationSpec[] = [];
  private _includesAssociations: AssociationSpec[] = [];
  private _preloadAssociations: AssociationSpec[] = [];
  private _eagerLoadAssociations: AssociationSpec[] = [];
  private _isReadonly = false;
  private _isStrictLoading = false;
  private _annotations: string[] = [];
  private _optimizerHints: string[] = [];
  private _referencesValues: string[] = [];
  private _fromClause: FromClause = FromClause.empty();
  private _createWithAttrs: Record<string, unknown> = {};
  private _extending: Array<Record<string, (...args: any[]) => any>> = [];
  private _ctes: Array<{ name: string; sql: string; recursive: boolean }> = [];
  private _skipPreloading = false;
  private _skipQueryCache = false;
  private _loaded = false;
  private _records: T[] = [];
  private _loadAsyncPromise?: Promise<T[]>;
  // Monotonic token bumped on reset()/reload() so an in-flight toArray()
  // that started before the reset can detect it lost the race and skip
  // committing stale records/loaded state.
  private _loadToken = 0;

  // Retryability of the most recently compiled SELECT, captured in
  // _compileSelectSql before any FROM-clause recompile can reset the shared
  // visitor's collector. Read by toArray() to set allowRetry.
  private _lastSelectRetryable = false;

  private _table: Table | null = null;

  constructor(modelClass: typeof Base, table?: Table, predicateBuilder?: PredicateBuilder) {
    this._modelClass = modelClass;
    if (table) {
      this._table = table;
    }
    if (predicateBuilder) {
      this._predicateBuilder = predicateBuilder;
    }
  }

  /**
   * Add WHERE conditions. Accepts:
   *  - a hash of column/value pairs
   *  - a raw SQL string with optional bind values
   *  - an Arel `Nodes.Node`
   *  - composite-key positional form: `where(['c1','c2'], [[v1a,v1b], ...])`
   *    (the JS analog of Rails' `where({[c1, c2] => [tuples]})` —
   *    JS object keys can't be arrays, so columns become a leading
   *    positional argument)
   *
   * Mirrors: ActiveRecord::Relation#where
   *
   * Examples:
   *   where({ name: "dean" })
   *   where("age > ?", 18)
   *   where("name LIKE ?", "%dean%")
   *   where(['shop_id', 'order_number'], [[1, 100], [2, 200]])
   */
  where(): WhereChain<Relation<T>>;
  where(conditions: undefined): WhereChain<Relation<T>>;
  where(conditions: Record<string, unknown> | null): Relation<T>;
  where(sql: string, ...binds: unknown[]): Relation<T>;
  where(node: Nodes.Node): Relation<T>;
  /**
   * Composite-key form: `where(['c1', 'c2'], [[v11, v12], [v21, v22]])`
   * compiles to `(c1 = v11 AND c2 = v12) OR (c1 = v21 AND c2 = v22)`.
   * The Rails analog is `where({['c1', 'c2'] => [[v11, v12], ...]})` —
   * JS object keys can't be arrays, so columns become a leading
   * positional argument. Tuples containing null/undefined are
   * filtered (SQL tuple-equality treats any null component as a
   * non-match); after filtering, an empty list short-circuits via
   * `none()`.
   */
  where(cols: string[], tuples: unknown[][]): Relation<T>;
  where(
    conditionsOrSql?: Record<string, unknown> | string | Nodes.Node | string[] | null,
    ...rest: unknown[]
  ): Relation<T> | WhereChain<Relation<T>> {
    if (conditionsOrSql === undefined) return new WhereChain<Relation<T>>(this._clone());
    // Composite-key form: array of column names + array of tuples.
    if (Array.isArray(conditionsOrSql) && conditionsOrSql.every((c) => typeof c === "string")) {
      // Fast-fail on malformed call: must have exactly one extra
      // argument that is an array of tuples. Without this guard, a
      // stray `where(['a','b'])` would fall through to whereBang and
      // treat the array as a record (numeric keys), producing
      // nonsense.
      if (rest.length !== 1 || !Array.isArray(rest[0])) {
        throw argumentError(
          "Relation#where(cols, tuples): composite-key form requires a tuples argument as an array of arrays",
        );
      }
      const cols = conditionsOrSql as string[];
      const tuples = rest[0] as unknown[][];
      const node = this.predicateBuilder.buildComposite(cols, tuples);
      if (node === null) return this._clone().noneBang();
      return this._clone().whereBang(node);
    }
    return this._clone().whereBang(
      conditionsOrSql as Record<string, unknown> | string | Nodes.Node | null,
      ...rest,
    );
  }

  /**
   * Replace all existing WHERE conditions with new ones.
   *
   * Mirrors: ActiveRecord::Relation#rewhere
   */
  rewhere(conditions: Record<string, unknown>): Relation<T> {
    const rel = this._clone();
    const keysToReplace = new Set(Object.keys(conditions));
    rel._whereClause = rel._whereClause.except(...keysToReplace);
    const castConditions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(conditions)) {
      castConditions[key] =
        value instanceof Relation
          ? value
          : Array.isArray(value)
            ? value.map((v) => this._castWhereValue(key, v))
            : this._castWhereValue(key, value);
    }
    rel._whereClause.predicates.push(...this.predicateBuilder.buildFromHash(castConditions));
    return rel;
  }

  /**
   * Filter for records WHERE the association IS present.
   *
   * Mirrors: ActiveRecord::QueryMethods::WhereChain#associated — emits an
   * INNER JOIN on the association then WHERE assoc_pk IS NOT NULL.
   * Skips if an identical (table+ON) join already exists, regardless of join
   * type; throws if a different join to the same table is present (aliasing
   * not supported).
   */
  whereAssociated(...assocNames: string[]): Relation<T> {
    let rel: Relation<T> = this;
    for (const assocName of assocNames) {
      rel._requireAssociation(assocName);
      const target = rel._resolveAssociationTarget(assocName);
      if (!target) {
        throw new Error(
          `whereAssociated: association resolution failed for '${assocName}' on ${(rel._modelClass as any).name} — ` +
            `through/HABTM associations may require a registered intermediate model, ` +
            `and some join shapes (such as composite primary/foreign keys) are not supported.`,
        );
      }
      const cloned = rel._clone();
      for (const join of target.joins) {
        _addAssocJoin(
          cloned._joinClauses,
          "inner",
          join,
          assocName,
          rel._modelClass as any,
          cloned._leftOuterJoinsValues,
        );
      }
      const tgtTable = new Table(target.table);
      for (const pk of target.pks) {
        cloned._whereClause.predicates.push(tgtTable.get(pk).notEq(null));
      }
      rel = cloned;
    }
    return rel;
  }

  /**
   * Filter for records WHERE the association IS missing.
   *
   * Mirrors: ActiveRecord::QueryMethods::WhereChain#missing — emits a
   * LEFT OUTER JOIN on the association then WHERE assoc_pk IS NULL.
   */
  whereMissing(...assocNames: string[]): Relation<T> {
    let rel: Relation<T> = this;
    for (const assocName of assocNames) {
      rel._requireAssociation(assocName);
      const target = rel._resolveAssociationTarget(assocName);
      if (!target) {
        throw new Error(
          `whereMissing: association resolution failed for '${assocName}' on ${(rel._modelClass as any).name} — ` +
            `through/HABTM associations may require a registered intermediate model, ` +
            `and some join shapes (such as composite primary/foreign keys) are not supported.`,
        );
      }
      const cloned = rel._clone();
      for (const join of target.joins) {
        _addAssocJoin(
          cloned._joinClauses,
          "left",
          join,
          assocName,
          rel._modelClass as any,
          cloned._leftOuterJoinsValues,
        );
      }
      const tgtTable = new Table(target.table);
      for (const pk of target.pks) {
        cloned._whereClause.predicates.push(tgtTable.get(pk).eq(null));
      }
      rel = cloned;
    }
    return rel;
  }

  private _requireAssociation(assocName: string): void {
    const modelClass = this._modelClass as any;
    const associations: any[] = modelClass._associations ?? [];
    if (!associations.some((a: any) => a.name === assocName)) {
      throw new Error(
        `Association named '${assocName}' was not found on ${modelClass.name}; perhaps you misspelled it?`,
      );
    }
  }

  /**
   * Resolve all join steps and target PK columns for a named association.
   *
   * `pks` mirrors Rails' `Array(reflection.association_primary_key)` — one
   * entry per PK column so callers emit one IS NULL/NOT NULL predicate each.
   * The ON clause produced by `_resolveAssociationJoin` is a column-to-column
   * expression (e.g. `"authors"."id" = "books"."author_id"`); if an array FK
   * were used it would stringify to `"a,b"` — an invalid column reference.
   * We guard against that before returning (see composite-FK check below).
   *
   * When the target model is not in `modelRegistry` the fallback behavior
   * differs by association type:
   * - `belongsTo`: target table name is not safe to infer — Rails always has
   *   a registered model class, so `tableName` is always available; without
   *   registration the inferred name (e.g. "authors") may differ from the real
   *   table (e.g. "wm_authors"). Falls back to WHERE source.fk IS NULL which
   *   is data-correct but not the Rails JOIN form. **Register the model** to
   *   get the JOIN form.
   * - `hasOne`/`hasMany`: target table is inferred from className + pluralise,
   *   and a JOIN ON is built from association options.
   * - through/HABTM: returns null (caller throws).
   */
  private _resolveAssociationTarget(
    assocName: string,
  ): { joins: Array<{ table: string; on: string }>; table: string; pks: string[] } | null {
    const modelClass = this._modelClass as any;
    const associations: any[] = modelClass._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === assocName);
    if (!assocDef) return null;

    // Primary path: registry-based resolution handles all association types.
    const resolved = this._resolveAssociationJoin(assocName);
    if (resolved) {
      const joins = Array.isArray(resolved) ? resolved : [resolved];
      const lastJoin = joins[joins.length - 1];
      let rawPk: string | string[] = "id";
      if (assocDef.type === "belongsTo") {
        const targetModel = modelRegistry.get(assocDef.options.className ?? _camelize(assocName));
        rawPk = assocDef.options.primaryKey ?? targetModel?.primaryKey ?? "id";
      } else {
        // Singularize for all plural collection association types.
        const isPlural =
          assocDef.type === "hasMany" ||
          assocDef.type === "hasAndBelongsToMany" ||
          (assocDef.type as string) === "hasManyThrough";
        const className =
          assocDef.options.className ?? _camelize(isPlural ? _singularize(assocName) : assocName);
        const targetModel = modelRegistry.get(className);
        rawPk = targetModel?.primaryKey ?? "id";
      }
      // _resolveAssociationJoin now zips composite FK/PK arrays into multiple
      // Eq predicates AND'd together — emit one IS NOT NULL / IS NULL predicate
      // per PK column at the call site (whereAssociated/whereMissing).
      const pks = Array.isArray(rawPk) ? rawPk : [rawPk];
      return { joins, table: lastJoin.table, pks };
    }

    // Fallback: target model not in registry — derive JOIN from options.
    // NOTE: for belongsTo, the target table name is not reliably inferrable
    // without a registered model (the actual tableName may differ from the
    // class-name convention). We fall back to a source-table FK null/non-null
    // predicate, which is data-correct but not the Rails JOIN form. **Register
    // the model** to get the JOIN form.
    const sourceTable = modelClass.tableName;
    if (assocDef.type === "belongsTo") {
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
      const pks = Array.isArray(foreignKey) ? foreignKey : [foreignKey];
      return { joins: [], table: sourceTable, pks };
    }
    if (Array.isArray(assocDef.options.foreignKey)) {
      throw new Error(
        `whereMissing/whereAssociated: composite foreignKey on '${assocName}' is not yet supported in fallback path.`,
      );
    }
    if (assocDef.type === "hasOne" || assocDef.type === "hasMany") {
      const className =
        assocDef.options.className ??
        _camelize(assocDef.type === "hasMany" ? _singularize(assocName) : assocName);
      const targetTable = assocDef.options.tableName ?? _pluralize(_toUnderscore(className));
      const rawSourcePk = assocDef.options.primaryKey ?? modelClass.primaryKey ?? "id";
      if (Array.isArray(rawSourcePk)) {
        throw new Error(
          `whereMissing/whereAssociated: composite primaryKey on '${assocName}' is not yet supported in fallback path.`,
        );
      }
      const sourcePk = rawSourcePk;
      const foreignKey = assocDef.options.as
        ? (assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`)
        : (assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
      const tgt = new Table(targetTable);
      const src = new Table(sourceTable);
      const onPredicates: Nodes.Node[] = [tgt.get(foreignKey).eq(src.get(sourcePk))];
      if (assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        onPredicates.push(tgt.get(typeCol).eq(modelClass.name));
      }
      const onNode = onPredicates.length === 1 ? onPredicates[0] : new Nodes.And(onPredicates);
      const on = this._arelVisitor().compile(onNode);
      return { joins: [{ table: targetTable, on }], table: targetTable, pks: ["id"] };
    }
    return null;
  }

  private _resolveHasManySubquery(
    modelClass: any,
    assocDef: any,
    assocName: string,
  ): {
    targetTable: string;
    foreignKey: string;
    typeNodes: InstanceType<typeof Nodes.Node>[];
  } {
    const targetClassName = assocDef.options.className ?? _camelize(_singularize(assocName));
    const targetModel = modelRegistry.get(targetClassName);
    if (!targetModel) {
      throw new Error(
        `Model '${targetClassName}' not found in registry for association '${assocName}'`,
      );
    }
    const targetTable = targetModel.tableName;
    const tgtTable = new Table(targetTable);
    let foreignKey: string;
    const typeNodes: InstanceType<typeof Nodes.Node>[] = [];
    if (assocDef.options.as) {
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`;
      const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
      typeNodes.push(tgtTable.get(typeCol).eq(modelClass.name));
    } else {
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`;
    }
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && isStiSubclass(targetModel)) {
      const stiNames = [
        targetModel.name,
        ...(targetModel.descendants ?? []).map((d: any) => d.name),
      ];
      typeNodes.push(tgtTable.get(inheritanceCol).in(stiNames));
    }
    return { targetTable, foreignKey, typeNodes };
  }

  private _resolveHasManyJoin(
    modelClass: any,
    assocDef: any,
    assocName: string,
  ): { targetTable: string; foreignKey: string; onClause: string } {
    const targetClassName = assocDef.options.className ?? _camelize(_singularize(assocName));
    const targetModel = modelRegistry.get(targetClassName);
    if (!targetModel) {
      throw new Error(
        `Model '${targetClassName}' not found in registry for association '${assocName}'`,
      );
    }
    const targetTable = targetModel.tableName;
    const sourceTable = modelClass.tableName;
    const pk = (assocDef.options.primaryKey ?? modelClass.primaryKey) as string;
    let foreignKey: string;
    let onClause: string;
    if (assocDef.options.as) {
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`;
      const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
      onClause = `"${targetTable}"."${foreignKey}" = "${sourceTable}"."${pk}" AND "${targetTable}"."${typeCol}" = '${modelClass.name}'`;
    } else {
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`;
      onClause = `"${targetTable}"."${foreignKey}" = "${sourceTable}"."${pk}"`;
    }
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && isStiSubclass(targetModel)) {
      const stiNames = [
        targetModel.name,
        ...(targetModel.descendants ?? []).map((d: any) => d.name),
      ];
      const inList = stiNames.map((n: string) => `'${n}'`).join(", ");
      onClause += ` AND "${targetTable}"."${inheritanceCol}" IN (${inList})`;
    }
    return { targetTable, foreignKey, onClause };
  }

  /**
   * Add NOT WHERE conditions. Accepts a hash of column/value pairs,
   * or the composite-key positional form (mirrors `where(cols, tuples)`).
   *
   * Mirrors: ActiveRecord::Relation#where.not
   */
  whereNot(conditions: Record<string, unknown>): Relation<T>;
  whereNot(cols: string[], tuples: unknown[][]): Relation<T>;
  whereNot(conditions: Record<string, unknown> | string[], tuples?: unknown[][]): Relation<T> {
    const rel = this._clone();
    for (const t of referencesFromConditions(conditions)) {
      if (!rel._referencesValues.includes(t)) rel._referencesValues.push(t);
    }
    if (Array.isArray(conditions) && conditions.every((c) => typeof c === "string")) {
      // Fast-fail on malformed call: see Relation#where guard for
      // the same reasoning. Without this, a stray
      // `whereNot(['a','b'])` falls through to Object.entries and
      // produces an invalid predicate.
      if (!Array.isArray(tuples)) {
        throw argumentError(
          "Relation#whereNot(cols, tuples): composite-key form requires a tuples argument as an array of arrays",
        );
      }
      const node = this.predicateBuilder.buildComposite(conditions as string[], tuples);
      // null = empty/all-filtered → NOT (no rows) = ALL rows = no
      // predicate added (matches Rails' `where.not(...)` no-op for
      // empty hashes).
      if (node !== null) {
        rel._whereClause.predicates.push(new Nodes.Not(new Nodes.Grouping(node)));
      }
      return rel;
    }
    const castConditions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(conditions as Record<string, unknown>)) {
      castConditions[key] = Array.isArray(value)
        ? value.map((v) => this._castWhereValue(key, v))
        : this._castWhereValue(key, value);
    }
    // Mirrors Rails' WhereClause#invert — branches on the actual predicate count,
    // not the key count, since one key can expand to multiple predicates:
    // - 1 predicate → invert_predicate (NOT NULL, !=, NOT BETWEEN, NOT IN, etc.)
    // - 2+ predicates → NOT(p1 AND p2 AND ...) — semantically different from p1 != AND p2 !=
    const positiveNodes = this.predicateBuilder.buildFromHash(castConditions);
    if (positiveNodes.length <= 1) {
      rel._whereClause.predicates.push(
        ...this.predicateBuilder.buildNegatedFromHash(castConditions),
      );
    } else {
      rel._whereClause.predicates.push(new Nodes.Not(new Nodes.And(positiveNodes)));
    }
    return rel;
  }

  /**
   * Combine this relation with another using OR.
   *
   * Mirrors: ActiveRecord::Relation#or
   */
  or(other: Relation<T>): Relation<T> {
    if (this._isNone) return other._clone();
    return this._clone().orBang(other);
  }

  /**
   * Combine this relation with another using AND — merges all WHERE
   * conditions from the other relation into this one.
   *
   * Mirrors: ActiveRecord::Relation#and
   */
  and(other: Relation<T>): Relation<T> {
    return this._clone().andBang(other);
  }

  /**
   * WHERE ANY of the given conditions match (OR logic).
   * Accepts an array of condition hashes.
   *
   * Mirrors: ActiveRecord::Relation#where.any (Rails 7.1)
   */
  whereAny(...conditions: Record<string, unknown>[]): Relation<T> {
    if (conditions.length === 0) return this;
    if (conditions.length === 1) return this.where(conditions[0]);

    const buildClause = (cond: Record<string, unknown>): WhereClause => {
      const cast: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(cond)) {
        cast[key] =
          value instanceof Relation
            ? value
            : Array.isArray(value)
              ? value.map((v) => this._castWhereValue(key, v))
              : this._castWhereValue(key, value);
      }
      return new WhereClause(this.predicateBuilder.buildFromHash(cast));
    };

    let combined = buildClause(conditions[0]);
    for (let i = 1; i < conditions.length; i++) {
      combined = combined.or(buildClause(conditions[i]));
    }
    const rel = this._clone();
    if (combined.predicates.length > 0) rel._whereClause.predicates.push(combined.ast);
    return rel;
  }

  /**
   * WHERE ALL of the given conditions match (AND logic).
   * Accepts an array of condition hashes.
   *
   * Mirrors: ActiveRecord::Relation#where.all (Rails 7.1)
   */
  whereAll(...conditions: Record<string, unknown>[]): Relation<T> {
    let rel: Relation<T> = this;
    for (const cond of conditions) {
      rel = rel.where(cond);
    }
    return rel;
  }

  /**
   * Exclude specific records from the result.
   *
   * Mirrors: ActiveRecord::Relation#excluding / #without
   */
  excluding(...records: T[]): Relation<T> {
    const ids = records.map((r) => r.id).filter((id) => id != null);
    if (ids.length === 0) return this;
    return this._clone().excludingBang(ids);
  }

  /**
   * Alias for excluding.
   *
   * Mirrors: ActiveRecord::Relation#without
   */
  without(...records: T[]): Relation<T> {
    return this.excluding(...records);
  }

  /**
   * Add ORDER BY. Accepts column name or { column: "asc"|"desc" }.
   *
   * Mirrors: ActiveRecord::Relation#order
   */
  order(
    ...args: Array<
      | string
      | Record<string, "asc" | "desc" | "ASC" | "DESC">
      | Nodes.Node
      | string[]
      | [Nodes.Node, ...unknown[]]
      | Map<Nodes.Node | string, "asc" | "desc" | "ASC" | "DESC">
    >
  ): Relation<T> {
    return this._clone().orderBang(...(args as any));
  }

  /**
   * Set LIMIT.
   *
   * Mirrors: ActiveRecord::Relation#limit
   */
  limit(value: number | null): Relation<T> {
    return this._clone().limitBang(value);
  }

  /**
   * Set OFFSET.
   *
   * Mirrors: ActiveRecord::Relation#offset
   */
  offset(value: number | null): Relation<T> {
    return this._clone().offsetBang(value);
  }

  /**
   * Select specific columns, or filter loaded records with a block.
   *
   * Mirrors: ActiveRecord::Relation#select
   *
   * Examples:
   *   select("name", "email")          // column projection
   *   select("COUNT(*) as total")       // raw SQL expression
   *   select(record => record.active)   // block form (returns array)
   */
  select(fn: (record: T) => boolean): Promise<T[]>;
  select(...columns: (string | Nodes.Node | Record<string, unknown>)[]): Relation<T>;
  select(...args: any[]): Relation<T> | Promise<T[]> {
    if (args.length === 1 && typeof args[0] === "function") {
      return this.toArray().then((records) => records.filter(args[0]));
    }
    const fields = this.processSelectArgs(args);
    return this._clone()._selectBang(...fields);
  }

  /**
   * Replace existing select columns.
   *
   * Mirrors: ActiveRecord::Relation#reselect
   */
  reselect(...columns: (string | Nodes.Node | Record<string, unknown>)[]): Relation<T> {
    const fields = this.processSelectArgs(columns as unknown[]);
    return this._clone().reselectBang(...fields);
  }

  /**
   * Make the query DISTINCT.
   *
   * Mirrors: ActiveRecord::Relation#distinct
   */
  distinct(): Relation<T> {
    return this._clone().distinctBang();
  }

  /**
   * PostgreSQL DISTINCT ON — select distinct rows based on specific columns.
   *
   * Mirrors: ActiveRecord::Relation#distinct_on (PostgreSQL only)
   */
  distinctOn(...columns: string[]): Relation<T> {
    const rel = this._clone();
    rel._isDistinct = true;
    rel._distinctOnColumns = columns;
    return rel;
  }

  /**
   * Add GROUP BY.
   *
   * Mirrors: ActiveRecord::Relation#group
   */
  group(...columns: string[]): Relation<T> {
    return this._clone().groupBang(...columns);
  }

  /**
   * Add HAVING clause. Accepts raw SQL string (with optional bind values),
   * a hash of column/value pairs, or an Arel node.
   *
   * Mirrors: ActiveRecord::Relation#having
   */
  having(condition: string, ...binds: unknown[]): Relation<T>;
  having(condition: Record<string, unknown>): Relation<T>;
  having(condition: Nodes.Node): Relation<T>;
  having(
    condition: string | Record<string, unknown> | Nodes.Node,
    ...binds: unknown[]
  ): Relation<T> {
    return this._clone().havingBang(condition, ...binds);
  }

  /**
   * Replace GROUP BY columns.
   *
   * Mirrors: ActiveRecord::Relation#regroup
   */
  regroup(...columns: string[]): Relation<T> {
    return this._clone().regroupBang(...columns);
  }

  /**
   * Replace ordering.
   *
   * Mirrors: ActiveRecord::Relation#reorder
   */
  reorder(
    ...args: Array<
      | string
      | Record<string, "asc" | "desc" | "ASC" | "DESC">
      | Nodes.Node
      | string[]
      | [Nodes.Node, ...unknown[]]
      | Map<Nodes.Node | string, "asc" | "desc" | "ASC" | "DESC">
    >
  ): Relation<T> {
    return this._clone().reorderBang(...(args as any));
  }

  /**
   * Reverse the existing order.
   *
   * Mirrors: ActiveRecord::Relation#reverse_order
   */
  reverseOrder(): Relation<T> {
    return this._clone().reverseOrderBang();
  }

  /**
   * Order by specific values of a column.
   *
   * Mirrors: ActiveRecord::Relation#in_order_of
   */
  inOrderOf(column: string | Nodes.Node, values: unknown[], filter = true): Relation<T> {
    if (values.length === 0) return this.none();

    const rel = this._clone();

    // Mirrors Rails: `column.is_a?(Arel::Nodes::SqlLiteral) ? column : order_column(column.to_s)`.
    // An Arel expression (e.g. `Arel.sql("id * 2")`) is used verbatim; a string/symbol
    // resolves through orderColumn, which handles `"table.column"` for joined associations
    // (and records the reference on the cloned relation).
    const arelCol =
      column instanceof Nodes.Node ? column : (_qm.orderColumn.call(rel as any, column) as any);

    // Normalize undefined → null so eq(null) emits IS NULL (not the invalid = NULL).
    const normalized = values.map((v) => (v === undefined ? null : v));

    // Build CASE WHEN col = v1 THEN 1 ... END ASC (searched form, 1-indexed).
    // Mirrors Rails' build_case_for_value_position: Arel::Nodes::Case.new (no operand)
    // with column.eq(value) predicates. With filter=false, an ELSE clause places
    // non-matching rows last instead of dropping them.
    const caseNode = new Nodes.Case();
    normalized.forEach((v, i) => {
      caseNode.when(arelCol.eq(v), new Nodes.Quoted(i + 1));
    });
    if (!filter) {
      caseNode.else(new Nodes.Quoted(values.length + 1));
    }
    const orderNode = new Nodes.Ascending(caseNode);

    // Push to _orderClauses (not _rawOrderClauses) so the CASE expression is
    // appended in call-order relative to any existing order clauses.
    // _applyOrderToManager detects CASE-style SQL via the "(" heuristic and
    // a /\bcase\b/i check, then emits it as SqlLiteral.
    rel._orderClauses.push(orderNode.toSql());

    // Add WHERE col IN (values) filter — mirrors Rails' arel_column.in(values.compact).
    // Attribute#in uses buildQuoted (no type-caster context), matching Rails which
    // pre-casts values via type_cast_for_database before calling in(). Callers
    // should pre-cast for typed columns (e.g. enum integer mappings).
    if (filter) {
      const hasNull = normalized.includes(null);
      const nonNull = normalized.filter((v) => v !== null);
      let whereNode: Nodes.Node = arelCol.in(nonNull);
      if (hasNull) whereNode = new Nodes.Or(whereNode, arelCol.eq(null));
      rel._whereClause.predicates.push(hasNull ? new Nodes.Grouping(whereNode) : whereNode);
    }

    return rel;
  }

  /**
   * Invert all existing WHERE conditions.
   * Swaps where ↔ whereNot clauses.
   *
   * Mirrors: ActiveRecord::Relation#invert_where
   */
  invertWhere(): Relation<T> {
    return this._clone().invertWhereBang();
  }

  /**
   * Returns a human-readable string representation of the relation.
   *
   * Mirrors: ActiveRecord::Relation#inspect
   */
  inspect(): string {
    const parts: string[] = [];
    parts.push(`${this._modelClass.name}.all`);
    if (!this._whereClause.isEmpty()) {
      const sql = this._whereClause.toSql();
      if (sql) parts.push(`.where(${JSON.stringify(sql)})`);
    }
    if (this._orderClauses.length > 0) {
      parts.push(`.order(${JSON.stringify(this._orderClauses)})`);
    }
    if (this._limitValue !== null) {
      parts.push(`.limit(${this._limitValue})`);
    }
    if (this._offsetValue !== null) {
      parts.push(`.offset(${this._offsetValue})`);
    }
    if (this._selectColumns !== null) {
      const cols = this._selectColumns.map((c) =>
        c instanceof Nodes.SqlLiteral
          ? `sql(${JSON.stringify(c.value)})`
          : c instanceof Nodes.Node
            ? `sql(${JSON.stringify(c.toSql())})`
            : typeof c === "symbol"
              ? c.description
              : JSON.stringify(c),
      );
      parts.push(`.select(${cols.join(", ")})`);
    }
    if (this._isDistinct) {
      parts.push(`.distinct`);
    }
    if (this._groupColumns.length > 0) {
      parts.push(`.group(${JSON.stringify(this._groupColumns)})`);
    }
    if (this._isNone) {
      parts.push(`.none`);
    }
    return parts.join("");
  }

  /**
   * Returns a relation that will always produce an empty result.
   *
   * Mirrors: ActiveRecord::Relation#none
   */
  none(): Relation<T> {
    return this._clone().noneBang();
  }

  /**
   * Add a lock clause (FOR UPDATE by default).
   *
   * Mirrors: ActiveRecord::Relation#lock
   */
  lock(clause: string | boolean = true): Relation<T> {
    return this._clone().lockBang(clause);
  }

  /**
   * Mark loaded records as readonly.
   *
   * Mirrors: ActiveRecord::Relation#readonly
   */
  readonly(value = true): Relation<T> {
    return this._clone().readonlyBang(value);
  }

  /**
   * Check if this relation is marked readonly.
   *
   * Mirrors: ActiveRecord::Relation#readonly?
   */
  get isReadonly(): boolean {
    return this._isReadonly;
  }

  /**
   * Check if this relation carries a lock clause.
   *
   * Mirrors: ActiveRecord::Relation#locked? (`alias :locked? :lock_value`)
   */
  get isLocked(): boolean {
    return this._lockValue !== null;
  }

  /**
   * The relation's lock clause, or null when unlocked.
   *
   * Mirrors: ActiveRecord::Relation#lock_value (SINGLE_VALUE_METHODS).
   */
  get lockValue(): string | null {
    return this._lockValue;
  }

  /**
   * Check if this relation has strict loading enabled.
   *
   * Mirrors: ActiveRecord::Relation#strict_loading?
   */
  get isStrictLoading(): boolean {
    return this._isStrictLoading;
  }

  /**
   * Enable strict loading — lazily-loaded associations will raise.
   *
   * Mirrors: ActiveRecord::Relation#strict_loading
   */
  strictLoading(value = true): Relation<T> {
    return this._clone().strictLoadingBang(value);
  }

  /**
   * Add SQL comments to the query.
   *
   * Mirrors: ActiveRecord::Relation#annotate
   */
  annotate(...comments: string[]): Relation<T> {
    return this._clone().annotateBang(...comments);
  }

  /**
   * Add optimizer hints to the query.
   *
   * Mirrors: ActiveRecord::Relation#optimizer_hints
   */
  optimizerHints(...hints: string[]): Relation<T> {
    return this._clone().optimizerHintsBang(...hints);
  }

  /**
   * Return a fresh unscoped relation for the model, discarding any
   * WHERE/ORDER/etc. conditions on this relation.
   *
   * Mirrors: ActiveRecord::Relation#unscoped — delegates to klass.unscoped.
   */
  unscoped(): Relation<T> {
    return this._modelClass.unscoped() as unknown as Relation<T>;
  }

  // merge and spawn are mixed in from spawn-methods.ts

  /**
   * Change the FROM clause (for subqueries or alternate table names).
   *
   * Mirrors: ActiveRecord::Relation#from
   */
  from(source: string | Relation<any> | Nodes.Node, subqueryName?: string): Relation<T> {
    return this._clone().fromBang(source, subqueryName);
  }

  /**
   * Set default attributes for create operations on this relation.
   *
   * Mirrors: ActiveRecord::Relation#create_with
   */
  createWith(attrs: Record<string, unknown> | null): Relation<T> {
    return this._clone().createWithBang(attrs);
  }

  /**
   * Remove specific query parts.
   *
   * Mirrors: ActiveRecord::Relation#unscope
   */
  unscope(...types: Array<UnscopeType | { where: string | string[] }>): Relation<T> {
    return this._clone().unscopeBang(...types);
  }

  /**
   * Keep only the specified query parts and remove everything else.
   *
   * Mirrors: ActiveRecord::SpawnMethods#only
   */
  only(...types: Array<UnscopeType>): Relation<T> {
    const toRemove = [...VALID_UNSCOPING_VALUES].filter((t) => !types.includes(t));
    return this.unscope(...toRemove);
  }

  /**
   * Add custom methods to this relation instance.
   * Accepts an object with methods, or a function that receives the relation.
   *
   * Mirrors: ActiveRecord::Relation#extending
   */
  extending<M extends Record<string, (...args: any[]) => any>>(mod: M): Relation<T> & M;
  extending<M extends Record<string, (...args: any[]) => any>>(
    mod: M | undefined,
  ): Relation<T> & Partial<M>;
  extending(fn: (rel: Relation<T>) => void): Relation<T>;
  extending(): Relation<T>;
  extending(
    mod?: Record<string, (...args: any[]) => any> | ((rel: Relation<T>) => void),
  ): Relation<T> | (Relation<T> & Record<string, (...args: any[]) => any>) {
    if (!mod) return this._clone();
    return this._clone().extendingBang(mod);
  }

  /**
   * UNION with another relation.
   *
   * Mirrors: ActiveRecord::Relation#union
   */
  union(other: Relation<T>): Relation<T> {
    const rel = this._clone();
    rel._setOperation = { type: "union", other };
    return rel;
  }

  /**
   * UNION ALL with another relation.
   *
   * Mirrors: ActiveRecord::Relation#union_all
   */
  unionAll(other: Relation<T>): Relation<T> {
    const rel = this._clone();
    rel._setOperation = { type: "unionAll", other };
    return rel;
  }

  /**
   * INTERSECT with another relation.
   *
   * Mirrors: ActiveRecord::Relation#intersect
   */
  intersect(other: Relation<T>): Relation<T> {
    const rel = this._clone();
    rel._setOperation = { type: "intersect", other };
    return rel;
  }

  /**
   * EXCEPT with another relation.
   *
   * Mirrors: ActiveRecord::Relation#except_
   */
  except(other?: Relation<T>): Relation<T> {
    if (!other) return this._clone();
    const rel = this._clone();
    rel._setOperation = { type: "except", other };
    return rel;
  }

  /**
   * Add one or more INNER JOINs. Accepts:
   * - An association name (resolved to a JOIN via reflection)
   * - A raw SQL string
   * - Two strings: (table, onClause) — explicit JOIN/ON pair
   * - Arel `Nodes.Join` instances (e.g. from `SelectManager#joinSources`)
   * - Any mix of the above as variadic args
   *
   * Mirrors: ActiveRecord::Relation#joins — Rails' `joins(*args)` is variadic
   * and accepts strings, symbol association names, or Arel join nodes.
   */
  joins(tableOrSql?: string, on?: string): Relation<T>;
  joins(...nodes: Nodes.Join[]): Relation<T>;
  joins(stringArray: string[]): Relation<T>;
  joins(...args: Array<string | string[] | Nodes.Join>): Relation<T>;
  joins(...args: Array<string | string[] | Nodes.Join | undefined>): Relation<T> {
    const rel = this._clone();
    // Two-string-argument form: joins(table, onClause) — preserved for back-compat.
    if (args.length === 2 && typeof args[0] === "string" && typeof args[1] === "string") {
      rel._joinClauses.push({ type: "inner", table: args[0], on: args[1] });
      return rel;
    }
    // Flatten string arrays: joins(["str1", "str2"]) mirrors Rails array form
    const flatArgs = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    for (const arg of flatArgs) {
      if (!arg) continue;
      // Arel join node — stored as-is to preserve type (mirrors Rails joins_values).
      // Rails joins! uses |= (array union), deduplicating by object identity for
      // nodes and string equality for strings. JS === matches both behaviours.
      if (arg instanceof Nodes.Join) {
        if (!rel._joinValues.includes(arg)) rel._joinValues.push(arg);
        continue;
      }
      const resolved = rel._resolveAssociationJoin(arg);
      if (resolved) {
        const entries = Array.isArray(resolved) ? resolved : [resolved];
        for (const j of entries) {
          rel._joinClauses.push({ type: "inner", table: j.table, on: j.on, quoted: true });
        }
      } else {
        if (!rel._joinValues.includes(arg)) rel._joinValues.push(arg);
      }
    }
    return rel;
  }

  /**
   * Add a LEFT OUTER JOIN. Accepts:
   * - A string association name: `leftJoins("posts")`
   * - A hash spec for nested associations: `leftJoins({ posts: "comments" })`
   * - An array of the above: `leftJoins(["posts", "comments"])`
   * - A raw table name with an explicit ON clause: `leftJoins("posts", "posts.author_id = authors.id")`
   *
   * Mirrors: ActiveRecord::Relation#left_joins
   */
  leftJoins(table: string, on: string): Relation<T>;
  leftJoins(table: AssociationSpec | AssociationSpec[]): Relation<T>;
  leftJoins(table: AssociationSpec | AssociationSpec[], on?: string): Relation<T> {
    const rel = this._clone();
    if (on !== undefined) {
      // Explicit SQL form: LEFT OUTER JOIN table ON condition — only valid for strings.
      if (typeof table !== "string")
        throw argumentError("leftJoins(table, on) requires a string table name");
      if (typeof on !== "string" || !on.trim())
        throw argumentError("leftJoins(table, on) requires a non-empty string ON condition");
      rel._joinClauses.push({ type: "left", table, on });
    } else {
      // Association name/spec form — mirrors Rails left_outer_joins! storing in
      // left_outer_joins_values for deferred resolution via JoinDependency.
      const specs = Array.isArray(table) ? table : [table];
      for (const spec of specs) {
        if (!rel._leftOuterJoinsValues.includes(spec)) rel._leftOuterJoinsValues.push(spec);
      }
    }
    return rel;
  }

  /**
   * Alias for leftJoins.
   *
   * Mirrors: ActiveRecord::Relation#left_outer_joins
   */
  leftOuterJoins(): Relation<T>;
  leftOuterJoins(table: string, on: string): Relation<T>;
  leftOuterJoins(table: AssociationSpec | AssociationSpec[]): Relation<T>;
  leftOuterJoins(table?: AssociationSpec | AssociationSpec[], on?: string): Relation<T> {
    if (table === undefined) return this._clone();
    if (on !== undefined) {
      if (typeof table !== "string")
        throw argumentError("leftOuterJoins(table, on) requires a string table name");
      return this.leftJoins(table, on);
    }
    return this.leftJoins(table);
  }

  /**
   * Append a macro-time association `scope:` lambda to a JOIN's ON
   * predicates, mirroring JoinDependency's scope handling
   * (associations/join-dependency.ts:272-282) and Rails' `joins(:assoc)`,
   * which folds the reflection scope into the join constraint. Routing the
   * scope's conditions through the target model's `where()` casts enum FK
   * values (e.g. `where(last_read: :reading)` → `last_read = 2`), so
   * `where.associated`/`where.missing` see the integer mapping that the
   * raw column-to-column ON would otherwise skip.
   *
   * Invoked via `invokeScopeLambda` so 0-arity `this`-bound scopes
   * (`function () { return this.where(...) }`) and arrow scopes
   * (`(rel) => rel.where(...)`, `(rel, owner) => ...`) are all evaluated, with
   * the Rails `instance_exec(owner) || relation` falsy-fallback. A bare join
   * has no owner instance, so the scope runs with `owner === undefined`.
   *
   * The scope is invoked unconditionally via `invokeScopeLambda`, mirroring
   * JoinDependency (join-dependency.ts:272-282), which neither pre-skips by
   * arity nor rescues scope-evaluation errors. A bare join has no owner, so
   * the scope runs with `owner === undefined` (Rails passes nil in join
   * contexts); owner-parameter scopes that tolerate a nil owner still fold in,
   * and a scope that genuinely requires the owner throws — the same outcome
   * JoinDependency produces. `invokeScopeLambda` (not a raw `scope(rel)` call)
   * is used so 0-arity `this`-bound scopes bind `this` to the relation.
   *
   * @internal
   */
  private _appendAssociationScope(predicates: Nodes.Node[], assocDef: any, targetModel: any): void {
    const scope = assocDef.options.scope;
    if (typeof scope !== "function") return;
    const baseRel = (targetModel as any)._allForPreload();
    const scopeRel = invokeScopeLambda(scope, baseRel, undefined as unknown as Base) || baseRel;
    if (scopeRel?._whereClause && !scopeRel._whereClause.isEmpty()) {
      predicates.push(scopeRel._whereClause.ast);
    }
  }

  /**
   * Resolve an association name to one or more JOIN table/ON pairs.
   * Returns null if the name is not a recognized association.
   *
   * Through and HABTM associations produce multiple joins (the intermediate
   * table(s) plus the final target).
   */
  private _resolveAssociationJoin(
    name: string,
  ): { table: string; on: string } | Array<{ table: string; on: string }> | null {
    const modelClass = this._modelClass as any;
    const associations: any[] = modelClass._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === name);
    if (!assocDef) return null;

    const sourceTable = modelClass.tableName;
    const sourcePk = modelClass.primaryKey ?? "id";

    if (assocDef.type === "belongsTo") {
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(name)}_id`;
      const className = assocDef.options.className ?? _camelize(name);
      const targetModel = modelRegistry.get(className);
      if (!targetModel) return null;
      const targetTable = targetModel.tableName;
      const rawTargetPk = assocDef.options.primaryKey ?? targetModel.primaryKey ?? "id";
      const fkArr = Array.isArray(foreignKey) ? foreignKey : [foreignKey];
      const pkArr = Array.isArray(rawTargetPk) ? rawTargetPk : [rawTargetPk];
      if (fkArr.length !== pkArr.length) return null;
      const tgt = new Table(targetTable);
      const src = new Table(sourceTable);
      const predicates: Nodes.Node[] = pkArr.map((pk, i) => tgt.get(pk).eq(src.get(fkArr[i])));

      // STI type condition on target
      const inheritanceCol = getInheritanceColumn(targetModel);
      if (inheritanceCol && isStiSubclass(targetModel)) {
        const stiNames = [
          targetModel.name,
          ...(targetModel.descendants ?? []).map((d: any) => d.name),
        ];
        predicates.push(tgt.get(inheritanceCol).in(stiNames));
      }

      this._appendAssociationScope(predicates, assocDef, targetModel);
      return {
        table: targetTable,
        on: this._arelVisitor().compile(
          predicates.length === 1 ? predicates[0] : new Nodes.And(predicates),
        ),
      };
    }

    if (assocDef.type === "hasOne" || assocDef.type === "hasMany") {
      // Through association: join through the intermediate model, then the target
      if (assocDef.options.through) {
        return this._resolveThroughJoin(modelClass, assocDef);
      }

      const className =
        assocDef.options.className ??
        _camelize(assocDef.type === "hasMany" ? _singularize(name) : name);
      const targetModel = modelRegistry.get(className);
      if (!targetModel) return null;
      const targetTable = targetModel.tableName;
      const rawPk = assocDef.options.primaryKey ?? sourcePk;
      const foreignKey = assocDef.options.as
        ? (assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`)
        : (assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
      const pkArr = Array.isArray(rawPk) ? rawPk : [rawPk];
      const fkArr = Array.isArray(foreignKey) ? foreignKey : [foreignKey];
      if (pkArr.length !== fkArr.length) return null;
      const tgt = new Table(targetTable);
      const src = new Table(sourceTable);
      const predicates: Nodes.Node[] = pkArr.map((pk, i) => tgt.get(fkArr[i]).eq(src.get(pk)));

      // Polymorphic type condition
      if (assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        predicates.push(tgt.get(typeCol).eq(modelClass.name));
      }

      // STI type condition on target
      const inheritanceCol = getInheritanceColumn(targetModel);
      if (inheritanceCol && isStiSubclass(targetModel)) {
        const stiNames = [
          targetModel.name,
          ...(targetModel.descendants ?? []).map((d: any) => d.name),
        ];
        predicates.push(tgt.get(inheritanceCol).in(stiNames));
      }

      this._appendAssociationScope(predicates, assocDef, targetModel);
      return {
        table: targetTable,
        on: this._arelVisitor().compile(
          predicates.length === 1 ? predicates[0] : new Nodes.And(predicates),
        ),
      };
    }

    // hasManyThrough (test-data style where type is literally "hasManyThrough")
    if (
      (assocDef.type as string) === "hasManyThrough" ||
      (assocDef.type as string) === "hasOneThrough"
    ) {
      return this._resolveThroughJoin(modelClass, assocDef);
    }

    // HABTM: join through the join table, then the target
    if (assocDef.type === "hasAndBelongsToMany") {
      return this._resolveHabtmJoin(modelClass, assocDef);
    }

    return null;
  }

  /**
   * Resolve a has_many/has_one :through association into multiple JOIN clauses.
   */
  private _resolveThroughJoin(
    modelClass: any,
    assocDef: any,
  ): Array<{ table: string; on: string }> | null {
    const sourceTable = modelClass.tableName;
    const sourcePk = modelClass.primaryKey ?? "id";
    const associations: any[] = modelClass._associations ?? [];

    const throughName = assocDef.options.through;
    const throughAssocDef = associations.find((a: any) => a.name === throughName);
    if (!throughAssocDef) return null;

    // Resolve the through (intermediate) model
    const throughClassName =
      throughAssocDef.options.className ??
      _camelize(throughAssocDef.type === "hasMany" ? _singularize(throughName) : throughName);
    const throughModel = modelRegistry.get(throughClassName);
    if (!throughModel) return null;
    const throughTable = (throughModel as any).tableName;

    // Build the first JOIN: source -> through
    const srcTable = new Table(sourceTable);
    const thrTable = new Table(throughTable);
    const throughPredicates: Nodes.Node[] = [];

    if (throughAssocDef.type === "belongsTo") {
      const throughFk = throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughName)}_id`;
      const throughTargetPk = throughAssocDef.options.primaryKey ?? throughModel.primaryKey ?? "id";
      throughPredicates.push(thrTable.get(throughTargetPk).eq(srcTable.get(throughFk)));
    } else {
      const throughPk = throughAssocDef.options.primaryKey ?? sourcePk;
      const throughAsName = throughAssocDef.options.as;
      const throughFk = throughAsName
        ? (throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughAsName)}_id`)
        : (throughAssocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
      throughPredicates.push(thrTable.get(throughFk).eq(srcTable.get(throughPk)));
      if (throughAsName) {
        throughPredicates.push(
          thrTable.get(`${_toUnderscore(throughAsName)}_type`).eq(modelClass.name),
        );
      }
    }

    // Resolve the source association on the through model to build the second JOIN
    const sourceName = assocDef.options.source ?? _singularize(assocDef.name);
    const throughModelAssocs: any[] = (throughModel as any)._associations ?? [];
    const sourceAssocDef =
      throughModelAssocs.find((a: any) => a.name === sourceName) ??
      throughModelAssocs.find((a: any) => a.name === _pluralize(sourceName));

    // Polymorphic source: when the source belongs_to on the through model is
    // polymorphic, `source_type:` on the outer through declares which concrete
    // class to join against (Rails HasManyThroughAssociation, reflection.rb).
    const isPolySource =
      sourceAssocDef?.type === "belongsTo" && sourceAssocDef.options?.polymorphic === true;
    const targetClassName =
      (isPolySource ? assocDef.options.sourceType : undefined) ??
      assocDef.options.className ??
      _camelize(_singularize(assocDef.name));
    if (isPolySource && !assocDef.options.sourceType) return null;
    const targetModel = modelRegistry.get(targetClassName);
    if (!targetModel) return null;
    const targetTable = (targetModel as any).tableName;
    const tgtTable = new Table(targetTable);

    const sourceType = sourceAssocDef?.type ?? "belongsTo";
    const targetPredicates: Nodes.Node[] = [];

    if (sourceType === "belongsTo") {
      const targetFk = sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
      const targetPk = sourceAssocDef?.options?.primaryKey ?? targetModel.primaryKey ?? "id";
      targetPredicates.push(tgtTable.get(targetPk).eq(thrTable.get(targetFk)));
      if (isPolySource) {
        // Mirrors Rails BelongsToReflection: type column is `foreign_type`
        // (options[:foreign_type] || "#{name}_type").
        const typeCol = sourceAssocDef!.options?.foreignType ?? `${_toUnderscore(sourceName)}_type`;
        targetPredicates.push(thrTable.get(typeCol).eq(assocDef.options.sourceType));
      }
    } else {
      const sourceAsName = sourceAssocDef?.options?.as;
      const sourceFk = sourceAsName
        ? (sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceAsName)}_id`)
        : (sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`);
      const rawThroughPk = throughModel.primaryKey ?? "id";
      let throughPkCol: string;
      if (Array.isArray(rawThroughPk)) {
        if (rawThroughPk.includes("id")) {
          throughPkCol = "id";
        } else if (rawThroughPk.length === 1) {
          throughPkCol = rawThroughPk[0];
        } else {
          return null;
        }
      } else {
        throughPkCol = rawThroughPk;
      }
      targetPredicates.push(tgtTable.get(sourceFk).eq(thrTable.get(throughPkCol)));
      if (sourceAsName) {
        targetPredicates.push(
          tgtTable.get(`${_toUnderscore(sourceAsName)}_type`).eq(throughClassName),
        );
      }
    }

    return [
      {
        table: throughTable,
        on: this._arelVisitor().compile(
          throughPredicates.length === 1 ? throughPredicates[0] : new Nodes.And(throughPredicates),
        ),
      },
      {
        table: targetTable,
        on: this._arelVisitor().compile(
          targetPredicates.length === 1 ? targetPredicates[0] : new Nodes.And(targetPredicates),
        ),
      },
    ];
  }

  /**
   * Resolve a HABTM association into JOIN clauses through the join table.
   */
  private _resolveHabtmJoin(
    modelClass: any,
    assocDef: any,
  ): Array<{ table: string; on: string }> | null {
    // Rails' HABTM macro does not forward `:primary_key` to the generated
    // through-`has_many` (Builder::HasAndBelongsToMany#middle_options); the
    // owner-side join always resolves to the model's primary key.
    const sourcePkOption = modelClass.primaryKey ?? "id";
    if (Array.isArray(sourcePkOption)) return null;
    const sourcePk: string = sourcePkOption;
    const sourceTable = modelClass.tableName;

    const fkOption = assocDef.options.foreignKey;
    if (Array.isArray(fkOption)) return null;

    const targetClassName = assocDef.options.className ?? _camelize(_singularize(assocDef.name));
    const targetModel = modelRegistry.get(targetClassName);
    if (!targetModel) return null;
    const targetTable = (targetModel as any).tableName;
    const targetPk = targetModel.primaryKey ?? "id";
    if (Array.isArray(targetPk)) return null;

    // Match Rails Builder::HasAndBelongsToMany#table_name: sort both side
    // tableNames and collapse a shared `[._]`-terminated prefix.
    const defaultJoinTable = joinHabtmTableNames(sourceTable, targetTable);
    const joinTable = assocDef.options.joinTable ?? defaultJoinTable;

    const ownerFk: string = fkOption ?? `${_toUnderscore(modelClass.name)}_id`;
    const targetFk = habtmTargetFk(assocDef.name, assocDef.options);

    const srcT = new Table(sourceTable);
    const joinT = new Table(joinTable);
    const tgtT = new Table(targetTable);
    return [
      {
        table: joinTable,
        on: this._arelVisitor().compile(joinT.get(ownerFk).eq(srcT.get(sourcePk))),
      },
      {
        table: targetTable,
        on: this._arelVisitor().compile(tgtT.get(targetPk as string).eq(joinT.get(targetFk))),
      },
    ];
  }

  /**
   * Specify associations to be eager loaded (preload strategy).
   *
   * Mirrors: ActiveRecord::Relation#includes
   */
  includes(...associations: AssociationSpec[]): Relation<T> {
    return this._clone().includesBang(...associations);
  }

  /**
   * Specify associations to be preloaded with separate queries.
   *
   * Mirrors: ActiveRecord::Relation#preload
   */
  preload(...associations: AssociationSpec[]): Relation<T> {
    return this._clone().preloadBang(...associations);
  }

  /**
   * Specify associations to be eager loaded.
   *
   * Mirrors: ActiveRecord::Relation#eager_load
   */
  eagerLoad(...associations: AssociationSpec[]): Relation<T> {
    return this._clone().eagerLoadBang(...associations);
  }

  // -- Relation state --

  /**
   * Check if the relation has been loaded.
   *
   * Mirrors: ActiveRecord::Relation#loaded?
   */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /**
   * Reset the relation to force re-query next time.
   *
   * Mirrors: ActiveRecord::Relation#reset
   */
  reset(): this {
    this._loaded = false;
    this._records = [];
    this._cacheKeys = undefined;
    this._cacheVersions = undefined;
    // Bump the load token and drop any in-flight loadAsync() promise —
    // an already-running toArray() checks the token after its await and
    // will skip committing if it lost the race, so a stale background
    // load can't re-populate records after a reset.
    this._loadToken += 1;
    this._loadAsyncPromise = undefined;
    return this;
  }

  /**
   * Reset and reload the relation.
   *
   * Mirrors: ActiveRecord::Relation#reload
   */
  async reload(): Promise<LoadedRelation<this>> {
    this.reset();
    await this.load();
    return stripThenable(this);
  }

  /**
   * Return the loaded records. Triggers loading if not yet loaded.
   *
   * Mirrors: ActiveRecord::Relation#records
   */
  async records(): Promise<T[]> {
    await this.load();
    return this._records;
  }

  /**
   * Schedule loading in the background. Returns self for chaining.
   * In JS, this eagerly starts the load as a promise.
   *
   * Mirrors: ActiveRecord::Relation#load_async
   */
  loadAsync(): Relation<T> {
    // Kick off the load in the background and stash the in-flight promise.
    // toArray() already caches _loaded/_records when it resolves, so no
    // .then bookkeeping is needed. A later `await rel.toArray()` drains
    // the stashed promise instead of issuing a second query — and carries
    // any rejection to the awaiter, matching Rails' load_async behavior.
    //
    // Keep the promise cached for the full lifetime of the load (clear
    // in finally) so concurrent callers share the one in-flight query
    // instead of racing to fire additional ones.
    if (!this._loadAsyncPromise && !this._loaded) {
      const loadPromise = this.toArray().finally(() => {
        this._loadAsyncPromise = undefined;
      });
      // Attach a no-op rejection handler so a failure here isn't treated
      // as an unhandled rejection if nothing else awaits the relation.
      // The stored promise still carries the rejection to explicit
      // awaiters (.toArray(), etc.) via a separate chain.
      void loadPromise.catch(() => {});
      this._loadAsyncPromise = loadPromise;
    }
    return this;
  }

  // spawn is mixed in from spawn-methods.ts

  /**
   * Build a new record with the relation's scoped conditions.
   *
   * Mirrors: ActiveRecord::Relation#build
   */
  build(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  build(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  build(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attrs)) {
      return attrs.map((a) => this.build(a, block));
    }
    const record = new this._modelClass({ ...this.scopeForCreate(), ...attrs }) as T;
    if (block) block(record);
    return record;
  }

  /**
   * Create and persist a new record with the relation's scoped conditions.
   *
   * Mirrors: ActiveRecord::Relation#create
   */
  async create(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async create(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async create(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) {
        records.push((await this.create(a, block)) as T);
      }
      return records;
    }
    const record = this.build(attrs, block);
    await record.save();
    return record;
  }

  /**
   * Create and persist a new record, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#create!
   */
  async createBang(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) {
        records.push((await this.createBang(a, block)) as T);
      }
      return records;
    }
    const record = this.build(attrs, block);
    await record.saveBang();
    return record;
  }

  /**
   * Returns count if not loaded, length of loaded records if loaded.
   *
   * Mirrors: ActiveRecord::Relation#size
   */
  async size(): Promise<number> {
    if (this._loaded) return this._records.length;
    return this.count() as Promise<number>;
  }

  /**
   * Check if there are no matching records.
   *
   * Mirrors: ActiveRecord::Relation#empty?
   */
  async isEmpty(): Promise<boolean> {
    if (this._loaded) return this._records.length === 0;
    return !(await this.exists());
  }

  /**
   * Check if there are any matching records.
   *
   * Mirrors: ActiveRecord::Relation#any?
   */
  async isAny(): Promise<boolean> {
    if (this._loaded) return this._records.length > 0;
    return this.exists();
  }

  /**
   * Check if there are multiple matching records.
   *
   * Mirrors: ActiveRecord::Relation#many?
   */
  async isMany(): Promise<boolean> {
    if (this._loaded) return this._records.length > 1;
    return (await this.limitedCount()) > 1;
  }

  /**
   * Check if there is exactly one matching record.
   *
   * Mirrors: ActiveRecord::Relation#one?
   */
  async isOne(): Promise<boolean> {
    if (this._loaded) return this._records.length === 1;
    return (await this.limitedCount()) === 1;
  }

  /**
   * Alias for isEmpty.
   *
   * Mirrors: ActiveRecord::Relation#blank?
   */
  async isBlank(): Promise<boolean> {
    return this.isEmpty();
  }

  /**
   * Alias for isAny (opposite of blank).
   *
   * Mirrors: ActiveRecord::Relation#present?
   */
  async isPresent(): Promise<boolean> {
    return this.isAny();
  }

  /**
   * Return self if any records exist, null otherwise.
   *
   * Mirrors: ActiveRecord::Relation#presence
   */
  async presence(): Promise<LoadedRelation<Relation<T>> | null> {
    return (await this.isAny()) ? stripThenable(this as Relation<T>) : null;
  }

  /**
   * Check if another relation is structurally compatible for use with or().
   *
   * Mirrors: ActiveRecord::Relation#structurally_compatible?
   */
  structurallyCompatible(other: Relation<T>): boolean {
    if (this._modelClass !== other._modelClass) return false;
    return areStructurallyCompatible(this, other);
  }

  /**
   * Return the number of loaded records (alias for toArray().length).
   *
   * Mirrors: ActiveRecord::Relation#length
   */
  async length(): Promise<number> {
    const records = await this.toArray();
    return records.length;
  }

  /**
   * Filter loaded records, removing those that match the predicate.
   *
   * Mirrors: ActiveRecord::Relation#reject (Ruby Enumerable)
   */
  async reject(fn: (record: T) => boolean): Promise<T[]> {
    const records = await this.toArray();
    return records.filter((r) => !fn(r));
  }

  /**
   * Filter to only records where the given column is not null/undefined.
   *
   * Mirrors: Rails where.not(column: nil) pattern
   */
  compactBlank(...columns: string[]): Relation<T> {
    let rel: Relation<T> = this;
    for (const col of columns) {
      rel = rel.whereNot({ [col]: null });
    }
    return rel;
  }

  // -- Terminal methods --

  /**
   * Eagerly load the records and return the relation itself.
   * Useful for chaining: `relation.load().isLoaded` is true.
   *
   * Mirrors: ActiveRecord::Relation#load
   */
  async load(): Promise<LoadedRelation<this>> {
    await this.toArray();
    return stripThenable(this);
  }

  /**
   * Execute the query and return all records.
   *
   * Mirrors: ActiveRecord::Relation#to_a / #load
   */
  async toArray(): Promise<T[]> {
    if (this._isNone) return [];
    if (this._loaded) return [...this._records];
    if (this._loadAsyncPromise) {
      // A prior loadAsync() kicked off the query — share the in-flight
      // promise so callers drain the same query (and carry its errors)
      // instead of racing to issue additional ones. The promise clears
      // itself in loadAsync's .finally once the load settles.
      return this._loadAsyncPromise;
    }

    // Capture the load token before any await so we can detect if a
    // reset() landed while the query was in flight and bail without
    // clobbering the fresh state.
    const token = this._loadToken;

    // Rails: `includes(:assoc).references(:assocs_table)` promotes the
    // matching includes to eager_load so the JOIN is present — otherwise
    // a raw where condition referring to that table would fail.
    // See ActiveRecord::Relation#references_eager_loaded_tables?
    const promotedIncludes = this._includesToPromoteFromReferences();

    let loadedRecords: T[];
    if (this._eagerLoadAssociations.length > 0 || promotedIncludes.length > 0) {
      const allEager = [...new Set([...this._eagerLoadAssociations, ...promotedIncludes])];
      await this._executeEagerLoad(allEager);
      if (token !== this._loadToken) return [];
      loadedRecords = this._records;
      this.loadRecords(loadedRecords);
    } else {
      const sql = this._toSql();
      // _compileSelectSql captures the SELECT's retryability into
      // _lastSelectRetryable at compile time. Reading the visitor's collector
      // here would be wrong: from(ArelNode) recompiles and resets it, and set
      // operations compile each side separately.
      const allowRetry = this._setOperation ? false : this._lastSelectRetryable;
      const result = await this._modelClass.connection.selectAll(
        sql,
        `${this._modelClass.name} Load`,
        [],
        { allowRetry },
      );
      if (token !== this._loadToken) return [];
      const rows = result.toArray();
      loadedRecords = this._instrumentInstantiation(rows);
      this.loadRecords(loadedRecords);
    }

    // Apply readonly and strict_loading flags to loaded records
    if (this._isReadonly) {
      for (const record of this._records) {
        (record as any)._readonly = true;
      }
    }
    if (this._isStrictLoading) {
      for (const record of this._records) {
        (record as any)._strictLoading = true;
      }
    }

    // Preload associations via separate queries (includes + preload minus
    // any includes we already eager-loaded above)
    const preloadAssocs = [
      ...this._includesAssociations.filter((n) => !promotedIncludes.includes(n)),
      ...this._preloadAssociations,
    ];
    if (preloadAssocs.length > 0 && this._records.length > 0) {
      await this._preloadAssociationsForRecords(this._records, preloadAssocs);
      if (token !== this._loadToken) return [];
    }

    return [...this._records];
  }

  /**
   * Rails all-or-nothing promotion: if ANY references_values entry
   * refers to a table that is NOT already joined, ALL includes get
   * promoted to eager_load.
   */
  private _includesToPromoteFromReferences(): AssociationSpec[] {
    if (!this.referencesEagerLoadedTables()) return [];
    const alreadyEagerLoaded = new Set(this._eagerLoadAssociations);
    // Rails promotes ALL includes to eager_load when references points to an
    // unjoined table. JoinDependency#addAssociationSpec recursively JOINs
    // nested hash and dotted-path specs, so we promote every include shape;
    // any spec it can't JOIN falls back to preload at execution time.
    return this._includesAssociations.filter((spec) => !alreadyEagerLoaded.has(spec));
  }

  /**
   * Returns true when any references_values entry points to a table that is
   * not already joined — triggers promoting includes to eager_load.
   *
   * Mirrors: ActiveRecord::Relation#references_eager_loaded_tables?
   */
  private referencesEagerLoadedTables(): boolean {
    if (this._referencesValues.length === 0) return false;
    if (this._includesAssociations.length === 0) return false;

    // Rails references_eager_loaded_tables? (relation.rb) calls build_joins([]) and
    // iterates the returned nodes: StringJoin → tables_in_string(join.left),
    // other joins → join.left.name. Mirror that: strings become StringJoin and we
    // extract via tablesInString; Arel nodes expose their table via left.name when
    // available (InnerJoin/OuterJoin/LeadingJoin all have left: Table).
    // _leftOuterJoinsValues holds association names (not table names). Rails
    // build_joins([]) processes left_outer_joins_values and extracts table names
    // from the resulting join nodes. We resolve via _resolveAssociationJoin to
    // get the actual table name (handles camelCase → snake_case mappings).
    const leftOuterTables = this._leftOuterJoinsValues
      .filter((v): v is string => typeof v === "string")
      .flatMap((v) => {
        const resolved = this._resolveAssociationJoin(v);
        if (!resolved) return [v.toLowerCase()]; // fallback
        const entries = Array.isArray(resolved) ? resolved : [resolved];
        return entries.map((e) => e.table.toLowerCase());
      });
    const joinedTables = new Set<string>([
      ...this._joinClauses.map((j) => j.table.toLowerCase()),
      ...leftOuterTables,
      ...this._joinValues.flatMap((v) => {
        if (typeof v === "string") {
          const join = new Nodes.StringJoin(new Nodes.SqlLiteral(v));
          const sqlText = join.left instanceof Nodes.SqlLiteral ? join.left.value : v;
          return this.tablesInString(sqlText);
        }
        if (v instanceof Nodes.StringJoin) {
          const sqlText = v.left instanceof Nodes.SqlLiteral ? v.left.value : v.toSql();
          return this.tablesInString(sqlText);
        }
        const leftName = (v.left as any)?.name;
        if (typeof leftName === "string") return [leftName.toLowerCase()];
        return this.tablesInString(v.toSql());
      }),
      String((this._modelClass as unknown as { tableName?: string }).tableName ?? "").toLowerCase(),
    ]);

    return this._referencesValues.some((ref) => !joinedTables.has(ref.toLowerCase()));
  }

  /**
   * Extracts table-like identifiers from a raw SQL string (e.g. a JOIN fragment).
   *
   * Mirrors: ActiveRecord::Relation#tables_in_string
   */
  private tablesInString(sql: string): string[] {
    if (!sql) return [];
    // Mirrors Rails' tables_in_string regex: /[a-zA-Z_][.\w]+(?=.?\.)/
    // The `.?` lookahead allows one non-dot char (e.g. a closing `"`) between
    // the identifier and the qualifying dot, so `"posts"."col"` correctly
    // yields `posts`. Downcase to match Rails' Oracle compat comment.
    const matches = sql.match(/[a-zA-Z_][\w.]+(?=.?\.)/g) ?? [];
    return matches.map((s) => s.toLowerCase()).filter((s) => s !== "raw_sql_");
  }

  /**
   * Mirrors: ActiveRecord::Relation#limited_count
   */
  private limitedCount(): Promise<number> {
    if (this._limitValue != null) return this.count() as Promise<number>;
    return this.limit(2).count() as Promise<number>;
  }

  /**
   * Adds each eager-load spec to the JoinDependency, routing nested hashes and
   * dotted paths through JoinDependency#addAssociationSpec (recursive JOINs).
   * Specs that can't be JOINed (polymorphic, composite key, unjoinable through)
   * are returned for preload fallback. Mirrors Rails routing eager_load_values
   * through JoinDependency rather than degrading nested specs to N preloads.
   * @internal
   */
  private _addEagerSpecsToJoinDependency(
    jd: JoinDependency,
    specs: AssociationSpec[],
  ): AssociationSpec[] {
    const fallbackAssocs: AssociationSpec[] = [];
    for (const spec of specs) {
      if (!jd.addAssociationSpec(spec)) fallbackAssocs.push(spec);
    }
    return fallbackAssocs;
  }

  private async _executeEagerLoad(eagerAssocs?: AssociationSpec[]): Promise<void> {
    const eagerAssociations = eagerAssocs ?? this._eagerLoadAssociations;
    const basePk = (this._modelClass as any).primaryKey ?? "id";
    if (
      Array.isArray(basePk) ||
      this._ctes.length > 0 ||
      this._setOperation ||
      !this._fromClause.isEmpty()
    ) {
      const sql = this._toSql();
      const result = await this._modelClass.connection.selectAll(sql, "Eager Load");
      this._records = this._instrumentInstantiation(result.toArray());
      await this._preloadAssociationsForRecords(this._records, eagerAssociations);
      return;
    }

    const jd = new JoinDependency(this._modelClass);

    const fallbackAssocs = this._addEagerSpecsToJoinDependency(jd, eagerAssociations);

    // If no associations could be JOINed, fall back entirely to preload
    if (jd.nodes.length === 0) {
      const sql = this._toSql();
      const rows = await this._modelClass.connection.execute(sql);
      this._records = this._instrumentInstantiation(rows);
      if (fallbackAssocs.length > 0) {
        await this._preloadAssociationsForRecords(this._records, fallbackAssocs);
      }
      return;
    }

    const manager = this._buildEagerJoinManager(jd, basePk);

    let sql = manager.toSql();
    if (this._annotations.length > 0) {
      const comments = this._annotations.map((c) => `/* ${c} */`).join(" ");
      sql = `${sql} ${comments}`;
    }

    const rows = await this._modelClass.connection.execute(sql);

    const { parents, associations } = jd.instantiateFromRows(rows, this._isStrictLoading);

    const inverseMap = new Map<string, string | undefined>();
    const modelAssocs: any[] = (this._modelClass as any)._associations ?? [];
    for (const assoc of modelAssocs) {
      inverseMap.set(assoc.name, assoc.options?.inverseOf);
    }

    for (const parent of parents) {
      const pk = parent.readAttribute(basePk);
      const assocs = associations.get(pk);
      for (const node of jd.nodes) {
        // Skip intermediate through nodes and nested nodes (handled in instantiateFromRows).
        if (node.immediateAssocName.startsWith("_through_")) continue;
        if (node.parentPath !== null) continue;
        const children = assocs?.get(node.immediateAssocName) ?? [];
        const isSingular = node.assocType === "hasOne" || node.assocType === "belongsTo";

        const inverseName = inverseMap.get(node.immediateAssocName);
        if (inverseName) {
          const targets = isSingular ? (children[0] ? [children[0]] : []) : children;
          for (const child of targets) {
            if (!(child as any)._cachedAssociations) {
              (child as any)._cachedAssociations = new Map();
            }
            (child as any)._cachedAssociations.set(inverseName, parent);
          }
        }
      }
    }

    this._records = parents as T[];

    if (fallbackAssocs.length > 0 && this._records.length > 0) {
      await this._preloadAssociationsForRecords(this._records, fallbackAssocs);
    }
  }

  /**
   * Async iterator support — allows `for await (const record of relation)`.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const records = await this.toArray();
    for (const record of records) {
      yield record;
    }
  }

  /**
   * Return the first record, or first N records when n is given.
   *
   * Mirrors: ActiveRecord::Relation#first
   */
  // first, firstBang, last, lastBang, sole, take, takeBang,
  // second, third, fourth, fifth, fortyTwo, secondToLast, thirdToLast,
  // and their bang variants are mixed in from finder-methods.ts

  /**
   * Pick values for columns from the first matching record.
   *
   * Mirrors: ActiveRecord::Relation#pick
   */
  async pick(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown> {
    const values = await this.limit(1).pluck(...columns);
    return values[0] ?? null;
  }

  /**
   * Return the query execution plan for this relation and every query run
   * as a side effect of executing it (eager loads, preloads, association
   * loads). Matches Rails' `ActiveRecord::Relation#explain`: the relation
   * is actually executed while `ExplainRegistry.collect = true`, the
   * subscriber captures every `sql.active_record` notification, and
   * `exec_explain` runs EXPLAIN against each captured SQL.
   *
   * `options` is a mix of flag strings and an optional trailing keyword
   * hash. Supported keyword options are adapter-specific — PG and MySQL
   * each allowlist their own set of `format` values, SQLite ignores
   * options entirely. Ruby's `extract_options!` allows at most one
   * trailing Hash; we enforce the same shape here so MySQL's
   * order-sensitive SQL (`EXPLAIN FORMAT=JSON ANALYZE` is invalid) can't
   * be produced by accident. Examples:
   *
   *     await Post.all().explain("analyze", "verbose")
   *     // → EXPLAIN (ANALYZE, VERBOSE) for: SELECT …
   *
   *     await Post.all().explain("analyze", { format: "json" })
   *     // → EXPLAIN (ANALYZE, FORMAT JSON) for: SELECT …  (PG)
   *     // → EXPLAIN ANALYZE FORMAT=JSON for: SELECT …     (MySQL)
   *
   * Mirrors: ActiveRecord::Relation#explain
   */
  async explain(...options: ExplainOption[]): Promise<string> {
    validateExplainOptions(options);
    const { queries } = await ExplainRegistry.collectingQueries(() => this.toArray());
    return this.execExplain(queries, options);
  }

  /**
   * Render the EXPLAIN output for a list of collected queries. For each
   * [sql, binds] pair, prints the adapter's EXPLAIN clause + SQL header
   * (with binds appended when present) followed by the adapter's plan
   * output — one block per query, separated by blank lines.
   *
   * Mirrors: ActiveRecord::Relation#exec_explain
   * @internal
   */
  async execExplain(
    queries: [string, unknown[]][],
    options: ExplainOption[] = [],
  ): Promise<string> {
    const adapter = this._modelClass.connection;
    if (typeof adapter?.explain !== "function") {
      return "EXPLAIN not supported by this adapter";
    }
    // If no queries were collected (e.g. the relation was already
    // loaded, or `.none()` short-circuited), fall back to explaining
    // `toSql()` directly so `Relation#explain` never returns a blank
    // string. Matches Rails' behavior of always producing output even
    // for degenerate cases.
    const effective: [string, unknown[]][] = queries.length > 0 ? queries : [[this._toSql(), []]];
    const clause = this.buildExplainClause(adapter, options);
    const parts: string[] = [];
    for (const [sql, binds] of effective) {
      let msg = `${clause} ${sql}`;
      if (binds.length > 0) msg += ` ${this._renderExplainBinds(adapter, binds)}`;
      const plan = await adapter.explain(sql, binds, options);
      parts.push(`${msg}\n${plan}`);
    }
    return parts.join("\n\n");
  }

  /**
   * Render a bind array for the EXPLAIN header. Mirrors Rails'
   * `exec_explain` rendering:
   *
   *     msg << binds.map { |attr| render_bind(c, attr) }.inspect
   *
   * where `render_bind` does `connection.type_cast(attr.value_for_database)`
   * — so each bind comes out as its primitive DB-cast value, then
   * Ruby's `Array#inspect` formats the list (strings double-quoted,
   * numbers bare, nil as `nil`).
   *
   * Rails' `render_bind` returns `[attr.name, value]` pairs when the
   * bind is an Attribute object; `ExplainRegistry` collects plain
   * values (no Attribute wrappers here), so we emit the value-only
   * form — same shape, just without the `[name, value]` tuples.
   *
   * Some adapters' `typeCast` can legitimately return non-primitive
   * shapes (PG's `BinaryData` comes out as `{ value, format }`);
   * `_normalizeExplainBindValue` below reduces those to something
   * rubyInspect can render cleanly, and handles binary data the way
   * Rails' `render_bind` does: `<N bytes of binary data>`.
   */
  private _renderExplainBinds(adapter: DatabaseAdapter, binds: unknown[]): string {
    const casted = binds.map((b) => {
      // Rails' `render_bind` short-circuits binary-typed binds BEFORE
      // calling type_cast:
      //   if attr.type.binary? && attr.value
      //     "<#{attr.value_for_database.to_s.bytesize} bytes of binary data>"
      //   else
      //     connection.type_cast(attr.value_for_database)
      //   end
      // We don't have attribute types at this layer, so we detect
      // binary structurally (Buffer / Uint8Array / ArrayBuffer) before
      // handing the value to typeCast — some adapters' typeCast throws
      // on buffer shapes because they're not bindable primitives.
      const binaryBytes = this._binaryByteLength(b);
      if (binaryBytes !== null) return `<${binaryBytes} bytes of binary data>`;
      if (typeof adapter.typeCast !== "function") {
        // Match the "throw loudly" contract the QueryCacheAdapter wrapper uses — a silent fallback would
        // make EXPLAIN output depend on whether the adapter
        // happens to implement `typeCast`, and nothing we ship does
        // without it.
        throw new Error(
          `Relation#explain: adapter ${this._modelClass.connection.adapterName} does not implement typeCast()`,
        );
      }
      return this._normalizeExplainBindValue(adapter.typeCast(b));
    });
    return rubyInspectArray(casted);
  }

  /**
   * Reduce a typeCast'd bind value to a form `rubyInspect` can render
   * as a primitive:
   *   - binary (Buffer / Uint8Array / ArrayBuffer) → `"<N bytes of
   *     binary data>"`, matching Rails' `render_bind` binary branch.
   *   - PG-style bind wrappers (`{ value, format }` from
   *     `pg/quoting.ts`'s `BinaryBind` shape) → unwrap `.value` and
   *     normalize recursively.
   *   - Dates / primitives (including symbols handled by typeCast
   *     earlier) → pass through.
   *   - Anything else → `JSON.stringify`, falling back to
   *     `Object.prototype.toString.call` when non-serializable.
   *
   * Mirrors: the binary branch of
   * ActiveRecord::Relation#render_bind.
   */
  private _normalizeExplainBindValue(value: unknown): unknown {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    // boundary: bound query inspect accepts caller-supplied values.
    // Invalid (NaN) Date prints as "Invalid Date" instead of JSON's "null".
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
    }
    // Temporal values: coerce to ISO string for inspect output.
    // ZonedDateTime uses toInstant().toString() to avoid the bracketed IANA form.
    if (value instanceof Temporal.ZonedDateTime) return value.toInstant().toString();
    if (
      value instanceof Temporal.Instant ||
      value instanceof Temporal.PlainDate ||
      value instanceof Temporal.PlainTime
    ) {
      return value.toString();
    }
    const binaryBytes = this._binaryByteLength(value);
    if (binaryBytes !== null) return `<${binaryBytes} bytes of binary data>`;
    if (typeof value === "object") {
      // Bind-wrapper objects like PG's BinaryBind (`{ value, format }`)
      // — recurse on `.value` so the inspected form shows the payload
      // rather than the wrapper envelope.
      const keys = Object.keys(value as object);
      if (
        "value" in (value as object) &&
        keys.length > 0 &&
        keys.every((k) => k === "value" || k === "format")
      ) {
        return this._normalizeExplainBindValue((value as { value: unknown }).value);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
    }
    return String(value);
  }

  private _binaryByteLength(value: unknown): number | null {
    if (typeof Buffer !== "undefined" && value instanceof Buffer) return value.byteLength;
    if (typeof ArrayBuffer !== "undefined") {
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return (value as ArrayBufferView).byteLength;
    }
    return null;
  }

  /**
   * Build the "EXPLAIN for:" header (Rails prints `EXPLAIN for: <sql>` /
   * `EXPLAIN (ANALYZE, VERBOSE) for: <sql>`). Adapters override via
   * `buildExplainClause(options)`; we fall back to a minimal form for
   * adapters that don't implement it yet.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#build_explain_clause
   */
  private buildExplainClause(adapter: DatabaseAdapter, options: ExplainOption[]): string {
    if (typeof adapter.buildExplainClause === "function") {
      return adapter.buildExplainClause(options);
    }
    if (options.length === 0) return "EXPLAIN for:";
    const parts = options.map((o) => {
      if (typeof o === "string") return o.toUpperCase();
      if (!o || typeof o !== "object" || typeof o.format !== "string") {
        throw new TypeError(
          `EXPLAIN option hash requires a string 'format'; got ${inspectExplainOption(o)}`,
        );
      }
      return `FORMAT ${o.format.toUpperCase()}`;
    });
    return `EXPLAIN (${parts.join(", ")}) for:`;
  }

  // count, sum, average, minimum, maximum are mixed in via
  // interface merge + prototype assignment (see bottom of file)

  private _applyJoinsToManager(manager: SelectManager): void {
    // Mirror Rails build_join_buckets routing (query_methods.rb:1856-1863):
    // When stashed joins exist, non-LeadingJoin nodes go to join_node (appended
    // after), LeadingJoin goes to leading_join (prepended before). Without stashed
    // joins all nodes go to leading_join in insertion order (Rails' else branch).
    // Stashed signal: existing join_sources (set by _buildEagerJoinManager before
    // this call) OR eagerLoad (stashed_eager_load) OR leftOuterJoins associations
    // (stashed_left_joins).
    const hasStashed =
      manager.joinSourceCount > 0 ||
      this._eagerLoadAssociations.length > 0 ||
      this._leftOuterJoinsValues.length > 0;
    const leadingJoins: Nodes.Join[] = [];
    const joinNodes: Nodes.Join[] = [];
    for (const v of this._joinValues) {
      const node: Nodes.Join =
        typeof v === "string" ? new Nodes.StringJoin(new Nodes.SqlLiteral(v.trim())) : v;
      if (!(node instanceof Nodes.LeadingJoin) && hasStashed) {
        joinNodes.push(node);
      } else {
        leadingJoins.push(node);
      }
    }
    if (leadingJoins.length > 0) manager.prependJoinNodes(...leadingJoins);
    for (const join of this._joinClauses) {
      const tableNode = join.quoted ? new Table(join.table) : join.table;
      const onNode = new Nodes.SqlLiteral(join.on);
      if (join.type === "inner") {
        manager.join(tableNode, onNode);
      } else {
        manager.outerJoin(tableNode, onNode);
      }
    }
    // Process left_outer_joins_values: resolve via JoinDependency and emit as
    // StringJoin nodes (mirrors Rails build_join_buckets stashed_left_joins path).
    // Exclude associations already covered by _eagerLoadAssociations OR by
    // includes promoted to eager load (includes().references()) — both cause
    // _buildEagerJoinManager to emit LEFT OUTER JOINs, so emitting again here
    // would produce duplicate JOINs / ambiguous column errors.
    const promotedIncludes = this._includesToPromoteFromReferences();
    const eagerCovered = new Set([...this._eagerLoadAssociations, ...promotedIncludes]);
    const pendingLeftOuter = this._leftOuterJoinsValues.filter((v) => !eagerCovered.has(v));
    if (pendingLeftOuter.length > 0) {
      const jd = QueryMethodBangs.constructJoinDependency.call(
        this as any,
        pendingLeftOuter,
        Nodes.OuterJoin,
      );
      for (const node of jd.joinConstraints([])) manager.appendJoinNode(node);
    }
    for (const node of joinNodes) manager.appendJoinNode(node);
  }

  /**
   * Check if any records exist, optionally with conditions.
   *
   * Mirrors: ActiveRecord::Relation#exists?
   */
  async exists(conditions?: Record<string, unknown> | unknown): Promise<boolean> {
    if (this._isNone) return false;
    // Rails FinderMethods#exists?: `return false if !conditions` — treats an
    // explicit `false` / `null` argument as "no match possible".
    if (conditions === false || conditions === null) return false;
    let rel: Relation<T> = this;
    if (conditions !== undefined) {
      // Mirrors Rails' FinderMethods#exists? argument handling
      // (construct_relation_for_exists):
      //   case conditions
      //   when Array, Hash → where!(conditions)
      //   else             → where!(primary_key => conditions)
      // So strings, numbers, and UUID-shaped PK values all route through
      // the PK-lookup branch; only Array / Hash become condition specs.
      if (Array.isArray(conditions)) {
        // Array form: [sql, ...binds] — delegate to where's string+binds overload.
        // Reject malformed arrays (empty / non-string head) up front so we
        // don't fall into where(undefined) which returns a WhereChain and
        // crashes downstream when we read rel._modelClass.
        if (conditions.length === 0 || typeof conditions[0] !== "string") {
          throw new Error(
            "Relation#exists array conditions must be [sql, ...binds] with a SQL string as the first element",
          );
        }
        rel = this.where(conditions[0], ...(conditions.slice(1) as unknown[]));
      } else if (typeof conditions === "object" && conditions !== null) {
        rel = this.where(conditions as Record<string, unknown>);
      } else {
        // Primary-key lookup. Honor composite primary keys by routing
        // through _buildPkWhereNode; Rails' construct_relation_for_exists
        // reaches the same branch via where(primary_key => conditions).
        const pk = this._modelClass.primaryKey;
        if (Array.isArray(pk)) {
          rel = this.where(this._modelClass._buildPkWhereNode(conditions));
        } else {
          rel = this.where({ [pk]: conditions });
        }
      }
    }
    // Mirrors Rails' `SELECT 1 AS one FROM ... LIMIT 1`: a dedicated
    // existence probe that never instantiates records (no after_find /
    // association loading) and doesn't go through count()'s limit
    // fast-path, which would otherwise hydrate models.
    const table = rel._modelClass.arelTable;
    const manager = table.project(new Nodes.SqlLiteral("1 AS one"));
    rel._applyJoinsToManager(manager);
    rel._applyWheresToManager(manager, table);
    for (const col of rel._groupColumns) manager.group(groupColumnToArel(col, table));
    if (!rel._havingClause.isEmpty()) manager.having(rel._havingClause.ast);
    manager.take(1);
    const rows = await rel._modelClass.connection.execute(manager.toSql());
    return rows.length > 0;
  }

  // -- Async query interface (Rails 7.0+) --
  // In TypeScript, all query methods already return Promises,
  // but these aliases provide Rails 7.0 API parity.

  /**
   * Mirrors: ActiveRecord::Relation#async_count
   */
  asyncCount(column?: string) {
    return this.count(column);
  }

  /**
   * Mirrors: ActiveRecord::Relation#async_sum
   */
  asyncSum(column?: string) {
    return this.sum(column);
  }

  /**
   * Mirrors: ActiveRecord::Relation#async_minimum
   */
  asyncMinimum(column: string) {
    return this.minimum(column);
  }

  /**
   * Mirrors: ActiveRecord::Relation#async_maximum
   */
  asyncMaximum(column: string) {
    return this.maximum(column);
  }

  /**
   * Mirrors: ActiveRecord::Relation#async_average
   */
  asyncAverage(column: string) {
    return this.average(column);
  }

  /**
   * Mirrors: ActiveRecord::Relation#async_pluck
   */
  asyncPluck(...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>) {
    return this.pluck(...columns);
  }

  /**
   * Mirrors: ActiveRecord::Relation#async_ids
   */
  asyncIds() {
    return this.ids();
  }

  /**
   * Generic calculation method.
   *
   * Mirrors: ActiveRecord::Relation#calculate
   */
  async calculate(operation: "count", column?: string): Promise<number | Record<string, number>>;
  async calculate(
    operation: "sum",
    column: string,
  ): Promise<number | bigint | Record<string, number | bigint>>;
  async calculate(
    operation: "average",
    column: string,
  ): Promise<unknown | null | Record<string, unknown>>;
  async calculate(
    operation: "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Record<string, unknown>>;
  async calculate(
    operation: "count" | "sum" | "average" | "minimum" | "maximum",
    column?: string,
  ): Promise<unknown | null | Record<string, unknown>> {
    switch (operation) {
      case "count":
        return this.count(column);
      case "sum":
        return this.sum(column!);
      case "average":
        return this.average(column!);
      case "minimum":
        return this.minimum(column!);
      case "maximum":
        return this.maximum(column!);
      default:
        throw new Error(`Unknown calculation: ${operation}`);
    }
  }

  /**
   * Pluck values for columns.
   *
   * Mirrors: ActiveRecord::Relation#pluck
   */
  async pluck(
    ...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]> {
    if (this._isNone) return [];

    // Mirrors Rails' disallow_raw_sql! check on pluck arguments.
    // Uses the broader column_name_matcher (allows functions like UPPER(col))
    // rather than column_name_with_order_matcher (which is stricter, for order).
    const stringColumns = columns.filter((c): c is string => typeof c === "string");
    if (stringColumns.length > 0) {
      disallowRawSqlBang(stringColumns, resolveColumnNameMatcher(this._modelClass.connection));
    }

    const table = this._modelClass.arelTable;
    const projections = columns.map((c) => {
      if (typeof c !== "string") return c;
      // Table-qualified ("table.col"), quoted ('"table"."col"'), function expressions,
      // or comma-separated lists must pass through as raw SQL.
      // Comma-separated lists are not allowed in a single pluck argument —
      // each column must be passed as a separate argument for correct result mapping.
      if (hasTopLevelComma(c)) {
        throw argumentError(
          `pluck does not allow comma-separated column lists in a single argument. ` +
            `Pass each column as a separate argument: pluck("col1", "col2")`,
        );
      }
      const isComplex =
        c.includes(".") ||
        c.includes("(") ||
        c.includes('"') ||
        c.includes("`") ||
        c.includes("::") ||
        /\s+AS\s+/i.test(c);
      return isComplex ? new Nodes.SqlLiteral(c) : table.get(c);
    });
    // Extract column names for result mapping
    const columnNames = columns.map((c) => {
      if (typeof c === "string") {
        // Explicit AS alias is reliable on all adapters.
        const asMatch = c.match(/\s+AS\s+(?:"([^"]+)"|`([^`]+)`|(\w+))\s*$/i);
        if (asMatch) return asMatch[1] ?? asMatch[2] ?? asMatch[3];
        // Function expressions: the result column label is adapter-specific and
        // can't be reliably predicted — use positional fallback (return null).
        if (c.includes("(")) return null;
        // Table-qualified or quoted identifiers: extract the last plain identifier segment.
        // Handles 1, 2, or 3-part names: col, table.col, schema.table.col.
        const dotMatch = c.match(/(?:["`]?\w+["`]?\.)*["`]?(\w+)["`]?\s*$/);
        if (dotMatch) return dotMatch[1];
        return c;
      }
      if (c instanceof Nodes.Attribute) return c.name;
      return null;
    });
    const manager = table.project(...projections);
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    this._applyOrderToManager(manager, table);

    if (this._isDistinct) manager.distinct();
    if (this._limitValue !== null) manager.take(this._limitValue);
    if (this._offsetValue !== null) manager.skip(this._offsetValue);

    const sql = manager.toSql();
    const result = await this._modelClass.connection.selectAll(
      sql,
      `${this._modelClass.name} Pluck`,
    );

    const rows = result.toArray();
    if (columns.length === 1) {
      const name = columnNames[0];
      if (name) {
        return rows.map((row) => row[name]);
      }
      return rows.map((row) => Object.values(row)[0]);
    }
    return rows.map((row) => {
      return columnNames.map((name, i) => {
        if (name) return row[name];
        return Object.values(row)[i];
      });
    });
  }

  /**
   * Pluck the primary key values.
   *
   * Mirrors: ActiveRecord::Relation#ids
   */
  async ids(): Promise<unknown[]> {
    return this.pluck(this._modelClass.primaryKey as string);
  }

  /**
   * Update all matching records.
   *
   * Mirrors: ActiveRecord::Relation#update_all
   */
  async updateAll(updates: Record<string, unknown>): Promise<number> {
    if (this._isNone) return 0;

    const table = this._modelClass.arelTable;
    const updateValues: [InstanceType<typeof Nodes.Node>, unknown][] = Object.entries(updates).map(
      ([key, val]) => {
        const def = this._modelClass._attributeDefinitions.get(key);
        const isArray = def?.type?.name === "array";
        if (isArray) return [table.get(key), def!.type!.serialize(val)];
        const isRangeCol =
          val instanceof Range &&
          (def?.type as { isForceEquality?(v: unknown): boolean } | undefined)?.isForceEquality?.(
            val,
          );
        if (isRangeCol) return [table.get(key), def!.type!.serialize(val)];
        return [table.get(key), val];
      },
    );
    const um = new UpdateManager().table(table).set(updateValues);
    for (const node of predicatesWithWrappedSqlLiterals(this._whereClause.predicates)) {
      um.where(node);
    }

    const count = await this._modelClass.connection.execUpdate(
      this._arelVisitor().compile(um.ast),
      `${this._modelClass.name} Update All`,
    );
    this.reset();
    return count;
  }

  /**
   * Destroy all matching records (runs callbacks on each record).
   *
   * Mirrors: ActiveRecord::Relation#destroy_all
   */
  async destroyAll(): Promise<T[]> {
    const recs = await this.records();
    for (const record of recs) {
      await record.destroy();
    }
    this.reset();
    return recs;
  }

  /**
   * Delete all matching records.
   *
   * Mirrors: ActiveRecord::Relation#delete_all
   */
  async deleteAll(): Promise<number> {
    if (this._isNone) return 0;

    const table = this._modelClass.arelTable;
    const dm = new DeleteManager().from(table);
    for (const node of predicatesWithWrappedSqlLiterals(this._whereClause.predicates)) {
      dm.where(node);
    }

    const count = await this._modelClass.connection.execDelete(
      this._arelVisitor().compile(dm.ast),
      `${this._modelClass.name} Delete All`,
    );
    this.reset();
    return count;
  }

  /**
   * Touch all matching records (update timestamps without callbacks).
   *
   * Mirrors: ActiveRecord::Relation#touch_all
   */
  async touchAll(...names: string[]): Promise<number> {
    if (this._isNone) return 0;

    const now = Temporal.Now.instant();
    const updates: Record<string, unknown> = {};

    // Always touch updated_at if defined on the model
    if (this._modelClass._attributeDefinitions.has("updated_at")) {
      updates.updated_at = now;
    }
    for (const name of names) {
      updates[name] = now;
    }

    if (Object.keys(updates).length === 0) return 0;

    const table = this._modelClass.arelTable;
    const updateValues: [InstanceType<typeof Nodes.Node>, unknown][] = Object.entries(updates).map(
      ([key, val]) => [table.get(key), val],
    );
    const um = new UpdateManager().table(table).set(updateValues);
    for (const node of predicatesWithWrappedSqlLiterals(this._whereClause.predicates)) {
      um.where(node);
    }

    return this._modelClass.connection.executeMutation(this._arelVisitor().compile(um.ast));
  }

  /**
   * Find the first record matching conditions within this relation, or create one.
   *
   * Mirrors: ActiveRecord::Relation#find_or_create_by
   */
  async findOrCreateBy(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const records = await this.where(conditions).limit(1).toArray();
    if (records.length > 0) return records[0];
    // Rails' scope_for_create: `where_values_hash.merge(create_with_value)` —
    // scope attrs first, createWith overrides, then the caller's conditions
    // and the optional extra hash win over both.
    return this._modelClass.create({
      ...this.scopeForCreate(),
      ...conditions,
      ...extra,
    }) as Promise<T>;
  }

  /**
   * Find the first record matching conditions within this relation, or instantiate one (unsaved).
   *
   * Mirrors: ActiveRecord::Relation#find_or_initialize_by
   */
  async findOrInitializeBy(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const existing = await this.findBy(conditions);
    if (existing) return existing;
    // Same scope_for_create precedence as findOrCreateBy: scope attrs
    // first, createWith overrides, caller's conditions + extra win.
    return new (this._modelClass as any)({
      ...this.scopeForCreate(),
      ...conditions,
      ...extra,
    }) as T;
  }

  /**
   * Try to create first; if uniqueness violation, find the existing record.
   *
   * Mirrors: ActiveRecord::Relation#create_or_find_by
   */
  async createOrFindBy(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    // Rails:
    //   transaction(requires_new: true) { create(attributes, &block) }
    //   rescue ActiveRecord::RecordNotUnique
    //     where(attributes).lock.find_by!(attributes)
    // Nested transaction so the failed INSERT rolls back cleanly
    // before the retry; `.lock` + `find_by!` so the concurrent winner
    // is materialized + row-locked inside the caller's txn.
    try {
      const result = await this._modelClass.transaction(
        () =>
          this._modelClass.create({
            ...this.scopeForCreate(),
            ...conditions,
            ...extra,
          }) as Promise<T>,
        { requiresNew: true },
      );
      // transaction() returns undefined when the block raises Rollback.
      // Don't silently yield undefined — raise so callers see the abort.
      if (result === undefined) {
        // `RecordNotSaved.record` is conventionally the model instance that
        // failed to persist — which doesn't exist here, since the inner
        // create rolled back. Leave record undefined rather than passing
        // the Relation.
        throw new RecordNotSaved(
          `${this._modelClass.name}.createOrFindBy rolled back before persist`,
        );
      }
      return result;
    } catch (e) {
      if (!(e instanceof RecordNotUnique)) throw e;
      return this.where(conditions).lock().findByBang(conditions) as Promise<T>;
    }
  }

  /**
   * Find the first record matching the current where chain, or create one.
   * Extra attributes can be passed to set on the new record.
   *
   * Mirrors: ActiveRecord::Relation#first_or_create
   */
  async firstOrCreate(extra?: Record<string, unknown>): Promise<T> {
    const first = await this.first();
    if (first) return first;
    return this.create(extra);
  }

  /**
   * Find the first record matching the current where chain, or create one (raises on validation failure).
   *
   * Mirrors: ActiveRecord::Relation#first_or_create!
   */
  async firstOrCreateBang(extra?: Record<string, unknown>): Promise<T> {
    const first = await this.first();
    if (first) return first;
    return this.createBang(extra);
  }

  /**
   * Find the first record matching the current where chain, or instantiate one (unsaved).
   *
   * Mirrors: ActiveRecord::Relation#first_or_initialize
   */
  async firstOrInitialize(extra?: Record<string, unknown>): Promise<T> {
    const records = await this.limit(1).toArray();
    if (records.length > 0) return records[0];
    return new (this._modelClass as any)({ ...this.scopeForCreate(), ...extra }) as T;
  }

  /**
   * Insert multiple records in a single INSERT statement (skip callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.insert_all
   */
  async insertAll(
    records: Record<string, unknown>[],
    options?: { uniqueBy?: string | string[] },
  ): Promise<number> {
    return InsertAll.execute(this, records, {
      uniqueBy: options?.uniqueBy,
      onDuplicate: options?.uniqueBy ? "skip" : undefined,
    });
  }

  /**
   * Upsert multiple records in a single statement (skip callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.upsert_all
   */
  async upsertAll(
    records: Record<string, unknown>[],
    options?: {
      uniqueBy?: string | string[];
      updateOnly?: string | string[];
      onDuplicate?: "skip" | "update" | Nodes.SqlLiteral;
    },
  ): Promise<number> {
    return InsertAll.execute(this, records, {
      uniqueBy: options?.uniqueBy,
      updateOnly: options?.updateOnly,
      onDuplicate: options?.onDuplicate ?? "update",
    });
  }

  /**
   * Extract scope attributes from the where clauses (for find_or_create_by).
   */
  /**
   * Return attributes that would be set on records created through this relation.
   *
   * Mirrors: ActiveRecord::Relation#scope_for_create
   */
  scopeForCreate(): Record<string, unknown> {
    return { ...this._scopeAttributes(), ...this._createWithAttrs };
  }

  /**
   * Return the where values hash for inspection.
   *
   * Mirrors: ActiveRecord::Relation#where_values_hash
   */
  whereValuesHash(): Record<string, unknown> {
    return this._whereClause.toH(this._modelClass.tableName);
  }

  // -- Value accessors (for introspection) --

  /**
   * Return the LIMIT clause value.
   *
   * Mirrors: ActiveRecord::Relation#limit_value
   */
  get limitValue(): number | null {
    return this._limitValue;
  }

  /**
   * Return the OFFSET clause value.
   *
   * Mirrors: ActiveRecord::Relation#offset_value
   */
  get offsetValue(): number | null {
    return this._offsetValue;
  }

  /**
   * Return the SELECT columns.
   *
   * Mirrors: ActiveRecord::Relation#select_values
   */
  get selectValues(): (string | symbol | Nodes.Node)[] {
    return this._selectColumns ?? [];
  }

  /**
   * Return the ORDER clauses.
   *
   * Mirrors: ActiveRecord::Relation#order_values
   */
  get orderValues(): Array<string | [string, "asc" | "desc"] | Nodes.Node> {
    return this._orderClauses.map((clause) =>
      typeof clause === "object" && !Array.isArray(clause) && "raw" in clause
        ? new Nodes.SqlLiteral((clause as { raw: string }).raw)
        : clause,
    );
  }

  /**
   * Return the GROUP BY columns.
   *
   * Mirrors: ActiveRecord::Relation#group_values
   */
  get groupValues(): string[] {
    return [...this._groupColumns];
  }

  /**
   * Return the DISTINCT flag.
   *
   * Mirrors: ActiveRecord::Relation#distinct_value
   */
  get distinctValue(): boolean {
    return this._isDistinct;
  }

  /**
   * Return the WHERE clause hashes.
   *
   * Mirrors: ActiveRecord::Relation#where_clause
   */
  get whereValues(): Array<Record<string, unknown>> {
    const h = this._whereClause.toH(this._modelClass.tableName);
    return Object.keys(h).length > 0 ? [h] : [];
  }

  // -- Collection convenience methods --

  /**
   * Load records and group them by the value of a column or function.
   *
   * Mirrors: Enumerable#group_by (used on ActiveRecord::Relation)
   */
  async groupByColumn(keyOrFn: string | ((record: T) => unknown)): Promise<Record<string, T[]>> {
    const records = await this.toArray();
    const result: Record<string, T[]> = {};
    for (const record of records) {
      const key =
        typeof keyOrFn === "string"
          ? String(record.readAttribute(keyOrFn))
          : String(keyOrFn(record));
      if (!result[key]) result[key] = [];
      result[key].push(record);
    }
    return result;
  }

  /**
   * Load records and index them by a column value (last wins on collision).
   *
   * Mirrors: Enumerable#index_by (used on ActiveRecord::Relation)
   */
  async indexBy(keyOrFn: string | ((record: T) => unknown)): Promise<Record<string, T>> {
    const records = await this.toArray();
    const result: Record<string, T> = {};
    for (const record of records) {
      const key =
        typeof keyOrFn === "string"
          ? String(record.readAttribute(keyOrFn))
          : String(keyOrFn(record));
      result[key] = record;
    }
    return result;
  }

  /** @internal */
  protected _scopeAttributes(): Record<string, unknown> {
    return this._whereClause.toH(this._modelClass.tableName, { equalityOnly: true });
  }

  // -- Batches --

  /**
   * Yields arrays of records in batches.
   *
   * Mirrors: ActiveRecord::Relation#find_in_batches
   */
  async *findInBatches({
    batchSize = Batches.DEFAULT_BATCH_SIZE,
    start,
    finish,
    order,
    cursor,
    errorOnIgnore,
  }: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc" | ("asc" | "desc")[];
    cursor?: string | string[];
    errorOnIgnore?: boolean;
  } = {}): AsyncGenerator<T[]> {
    for await (const batchRel of this.inBatches({
      batchSize,
      start,
      finish,
      order,
      cursor,
      errorOnIgnore,
      load: true,
    })) {
      yield ((batchRel as any)._records ?? []) as T[];
    }
  }

  /**
   * Yields individual records in batches for memory efficiency.
   *
   * Mirrors: ActiveRecord::Relation#find_each
   */
  async *findEach({
    batchSize = Batches.DEFAULT_BATCH_SIZE,
    start,
    finish,
    order,
    cursor,
    errorOnIgnore,
  }: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc" | ("asc" | "desc")[];
    cursor?: string | string[];
    errorOnIgnore?: boolean;
  } = {}): AsyncGenerator<T> {
    for await (const batch of this.findInBatches({
      batchSize,
      start,
      finish,
      order,
      cursor,
      errorOnIgnore,
    })) {
      for (const record of batch) {
        yield record;
      }
    }
  }

  /**
   * Returns a BatchEnumerator that yields Relations scoped to each batch.
   * Unlike findInBatches which yields arrays of records, this yields
   * Relation objects that can be further refined, and supports batch-level
   * operations like deleteAll/updateAll.
   *
   * Mirrors: ActiveRecord::Batches#in_batches
   */
  inBatches({
    batchSize = Batches.DEFAULT_BATCH_SIZE,
    start,
    finish,
    order,
    cursor,
    errorOnIgnore,
    load = false,
    useRanges,
  }: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc" | ("asc" | "desc")[];
    cursor?: string | string[];
    errorOnIgnore?: boolean;
    load?: boolean;
    useRanges?: boolean | null;
  } = {}): BatchEnumerator<LoadedRelation<Relation<T>>> {
    const self = this;
    const pk = this._modelClass.primaryKey;
    const effectiveCursor = cursor ?? pk;
    const cursorArr = Array.isArray(effectiveCursor) ? effectiveCursor : [effectiveCursor];
    _ensureValidOptionsForBatchingBang(cursorArr, start, finish, (order ?? "asc") as any);

    if (this._orderClauses.length > 0) {
      this.actOnIgnoredOrder(errorOnIgnore);
    }

    const batchOrders = _buildBatchOrders(cursorArr, order as any);

    let remaining: number | null = null;
    let effectiveBatchSize = batchSize;
    if (this._limitValue !== null) {
      remaining = this._limitValue;
      if (remaining === 0) {
        return new BatchEnumerator(async function* () {}, batchSize);
      }
      if (remaining < effectiveBatchSize) effectiveBatchSize = remaining;
    }

    if (this._loaded) {
      const loadedBatches = _batchOnLoadedRelation({
        relation: this,
        start,
        finish,
        cursor: cursorArr,
        order: (order ?? "asc") as any,
        batchLimit: effectiveBatchSize,
      });
      return new BatchEnumerator(async function* () {
        for (const batchRows of loadedBatches) {
          const batchRel = self._clone();
          batchRel._orderClauses = batchOrders.map(
            ([col, dir]) => [col, dir] as [string, "asc" | "desc"],
          );
          (batchRel as any)._records = batchRows;
          (batchRel as any)._loaded = true;
          yield stripThenable(batchRel) as LoadedRelation<Relation<T>>;
        }
      }, effectiveBatchSize);
    }

    return new BatchEnumerator(
      async function* () {
        const rel = self._clone();
        rel._orderClauses = batchOrders.map(([col, dir]) => [col, dir] as [string, "asc" | "desc"]);

        for await (const batchRows of _batchOnUnloadedRelation({
          relation: rel,
          start,
          finish,
          cursor: cursorArr,
          order: (order ?? "asc") as any,
          batchLimit: effectiveBatchSize,
          load,
          remaining,
        })) {
          const batchRel = self._clone();
          batchRel._orderClauses = batchOrders.map(
            ([col, dir]) => [col, dir] as [string, "asc" | "desc"],
          );
          const tuples = (batchRows as any[]).map((r) =>
            cursorArr.map((c) => (r as any).readAttribute(c)),
          );
          if (useRanges && !load && cursorArr.length === 1 && tuples.length > 0) {
            // Range-mode: emit `col >= first AND col <= last` (reversed for desc)
            // instead of `col IN (...)`. Mirrors Rails apply_finish_limit path.
            const col = cursorArr[0];
            const dir = batchOrders[0][1];
            const first = tuples[0][0];
            const last = tuples[tuples.length - 1][0];
            const attr = self._modelClass.arelTable.get(col) as any;
            const lo = dir === "desc" ? last : first;
            const hi = dir === "desc" ? first : last;
            batchRel._whereClause.predicates.push(attr.gteq(lo).and(attr.lteq(hi)));
          } else if (cursorArr.length === 1) {
            const ids = tuples.map((t) => t[0]);
            batchRel._whereClause.predicates.push(
              ...self.predicateBuilder.buildFromHash({ [cursorArr[0]]: ids }),
            );
          } else {
            const node = self.predicateBuilder.buildComposite(cursorArr, tuples);
            if (node) batchRel._whereClause.predicates.push(node);
          }
          if (load) {
            (batchRel as any)._records = batchRows;
            (batchRel as any)._loaded = true;
          }
          yield stripThenable(batchRel);
        }
      } as () => AsyncGenerator<LoadedRelation<Relation<T>>>,
      effectiveBatchSize,
    );
  }

  // -- SQL generation --

  /**
   * Return the Arel SelectManager for this relation.
   *
   * Mirrors: ActiveRecord::Relation#arel
   */
  private _buildProjections(table: Table): any[] {
    if (this._selectColumns) {
      // Route through arelColumns (mirrors Rails build_select -> arel_columns):
      // bare-string literals like "1"/"foo()" and symbols resolve via columns_hash
      // then fall back to a SqlLiteral, instead of being table-qualified.
      return this.arelColumns(this._selectColumns) as any[];
    }
    if (this._modelClass.ignoredColumns.length > 0) {
      let cols = this._modelClass.columnNames();
      const pk = this._modelClass.primaryKey;
      if (typeof pk === "string" && !cols.includes(pk)) {
        cols = [pk, ...cols];
      }
      return cols.length > 0 ? cols.map((c) => table.get(c)) : [this._defaultProjection(table)];
    }
    return [this._defaultProjection(table)];
  }

  /**
   * Default projection node when no explicit `select` and no
   * `ignoredColumns`. Always the target table's qualified star —
   * mirrors Rails' `Relation#build_select` which projects
   * `table[Arel.star]` unconditionally
   * (activerecord/lib/active_record/relation/query_methods.rb:1909).
   *
   * Plain `*` collapses same-named columns from joined tables in
   * the row hash (drivers return one key per name, last write
   * wins): e.g. `users.id` gets overwritten by a JOIN's
   * `friendships.id`. Qualifying the projection avoids the trap.
   *
   * `from()` note: Rails DOES emit `SELECT "users".* FROM (subq)`
   * when the user supplies a custom `from()` source — it's the
   * caller's responsibility to ensure the target table is in
   * scope, or to override with `.select("*")`. We match.
   */
  private _defaultProjection(table: Table): Nodes.Attribute {
    return table.star;
  }

  toArel(): SelectManager {
    const table = this._modelClass.arelTable;
    const projections = this._buildProjections(table);
    const manager = table.project(...(projections as any));
    this._applyWheresToManager(manager, table);
    this._applyOrderToManager(manager, table);
    if (this._isDistinct) manager.distinct();
    if (this._limitValue !== null) manager.take(this._limitValue);
    if (this._offsetValue !== null) manager.skip(this._offsetValue);
    for (const col of this._groupColumns) {
      manager.group(groupColumnToArel(col, table));
    }
    return manager;
  }

  /**
   * Generate the SQL for this relation.
   */
  toSql(): string {
    return this._toSql();
  }

  private _instrumentInstantiation(rows: Record<string, unknown>[]): T[] {
    if (rows.length === 0) return [];
    const payload = { record_count: rows.length, class_name: this._modelClass.name };
    return Notifications.instrument("instantiation.active_record", payload, () =>
      rows.map((row) => this._modelClass._instantiate(row) as T),
    );
  }

  private _toSql(): string {
    // Set operations: SQLite rejects parens around compound-SELECT operands
    // (Rails sqlite.rb#infix_value_with_paren strips them); PG/MySQL require
    // parens when either operand carries its own ORDER BY/LIMIT/OFFSET so
    // those clauses bind to the per-side SELECT instead of the compound.
    if (this._setOperation) {
      const leftSql = this._toSqlWithoutSetOp();
      const rightSql = this._setOperation.other._toSqlWithoutSetOp();
      const op = {
        union: "UNION",
        unionAll: "UNION ALL",
        intersect: "INTERSECT",
        except: "EXCEPT",
      }[this._setOperation.type];
      const isSqlite = this._modelClass.connection?.adapterName === "sqlite";
      return isSqlite ? `${leftSql} ${op} ${rightSql}` : `(${leftSql}) ${op} (${rightSql})`;
    }
    return this._toSqlWithoutSetOp();
  }

  // Mirrors: ActiveRecord::Relation#eager_loading?
  private _eagerLoadingForSql(): boolean {
    if (this._eagerLoadAssociations.length > 0) return true;
    return this._includesToPromoteFromReferences().length > 0;
  }

  /**
   * Shared helper used by both _buildEagerSql (toSql path) and _executeEagerLoad
   * (execution path). Builds a SelectManager with JoinDependency column aliases,
   * LEFT OUTER JOINs, WHERE/ORDER/DISTINCT/GROUP/HAVING/LOCK/HINTS applied, and
   * LIMIT/OFFSET handling via the limitable-reflections check.
   *
   * Mirrors: ActiveRecord::Relation#apply_join_dependency +
   *          ActiveRecord::Associations::JoinDependency#apply_column_aliases
   */
  private _buildEagerJoinManager(jd: JoinDependency, basePk: string): SelectManager {
    const table = this._modelClass.arelTable;

    const manager = table.project(...jd.buildSelectArel());

    for (const node of jd.nodes) {
      manager.appendJoinNode(node.arelJoin!);
    }

    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    this._applyOrderToManager(manager, table);
    if (this._isDistinct) manager.distinct();
    for (const col of this._groupColumns) manager.group(groupColumnToArel(col, table));
    if (!this._havingClause.isEmpty()) manager.having(this._havingClause.ast);
    if (this._lockValue) manager.lock(this._lockValue);
    if (this._optimizerHints.length > 0) manager.optimizerHints(...this._optimizerHints);

    // LIMIT/OFFSET: use a subquery for collection associations to avoid fan-out
    // (mirrors Rails' using_limitable_reflections? check in finder_methods.rb).
    // Non-collection associations (belongsTo, hasOne) are limitable — apply directly.
    const hasLimit = this._limitValue !== null || this._offsetValue !== null;
    if (hasLimit) {
      const isLimitable = jd.nodes.every((n) => n.assocType !== "hasMany");
      if (isLimitable) {
        if (this._limitValue !== null) manager.take(this._limitValue);
        if (this._offsetValue !== null) manager.skip(this._offsetValue);
      } else {
        // Build a parent-ID subquery using Arel nodes so quoting is consistent.
        const pkAttr = table.get(basePk);
        const idSubquery = table.project(pkAttr);
        idSubquery.distinct();
        for (const node of jd.nodes) {
          idSubquery.appendJoinNode(node.arelJoin!);
        }
        this._applyJoinsToManager(idSubquery);
        this._applyWheresToManager(idSubquery, table);
        this._applyOrderToManager(idSubquery, table);
        if (this._limitValue !== null) idSubquery.take(this._limitValue);
        if (this._offsetValue !== null) idSubquery.skip(this._offsetValue);
        // pkAttr.in(subquery) produces "table"."pk" IN (SELECT ...) via Arel
        manager.where(pkAttr.in(idSubquery));
      }
    }

    return manager;
  }

  // Mirrors: ActiveRecord::Relation#to_sql when eager_loading? — builds the
  // JoinDependency SQL synchronously for toSql()/parity runner use.
  // Returns null if no eager associations could be joined (fall back to plain SQL).
  private _buildEagerSql(): string | null {
    if (this._setOperation || !this._fromClause.isEmpty() || this._ctes.length > 0) return null;

    const allEager = [
      ...new Set([...this._eagerLoadAssociations, ...this._includesToPromoteFromReferences()]),
    ];
    if (allEager.length === 0) return null;

    const basePk = (this._modelClass as any).primaryKey ?? "id";
    if (Array.isArray(basePk)) return null;

    const jd = new JoinDependency(this._modelClass);
    this._addEagerSpecsToJoinDependency(jd, allEager);
    if (jd.nodes.length === 0) return null;

    const manager = this._buildEagerJoinManager(jd, basePk);

    let sql = this._compileSelectSql(manager);
    if (this._annotations.length > 0) {
      const comments = this._annotations.map((c) => `/* ${c} */`).join(" ");
      sql = `${sql} ${comments}`;
    }
    return sql;
  }

  private _toSqlWithoutSetOp(): string {
    // Eager loading: emit JoinDependency SQL (mirrors Rails to_sql + eager_loading?)
    if (this._eagerLoadingForSql()) {
      const eagerSql = this._buildEagerSql();
      if (eagerSql !== null) return eagerSql;
      // If _buildEagerSql returns null (e.g. unresolvable association),
      // fall through to plain SQL so toSql() always returns something useful.
    }

    const table = this._modelClass.arelTable;
    const projections = this._buildProjections(table);
    const manager = table.project(...(projections as any));

    // Apply joins
    this._applyJoinsToManager(manager);

    this._applyWheresToManager(manager, table);
    this._applyOrderToManager(manager, table);

    if (this._isDistinct) manager.distinct();
    if (this._limitValue !== null) manager.take(this._limitValue);
    if (this._offsetValue !== null) manager.skip(this._offsetValue);

    for (const col of this._groupColumns) {
      manager.group(groupColumnToArel(col, table));
    }

    if (!this._havingClause.isEmpty()) manager.having(this._havingClause.ast);

    if (this._lockValue) {
      manager.lock(this._lockValue);
    }

    if (this._optimizerHints.length > 0) {
      manager.optimizerHints(...this._optimizerHints);
    }

    let sql = this._compileSelectSql(manager);

    // Replace FROM clause if from() was used
    if (!this._fromClause.isEmpty()) {
      const raw = this._fromClause.value;
      const alias = this._fromClause.name;
      let fromExpr: string;
      if (raw instanceof Relation) {
        const subSql = raw.toSql();
        const name = alias ?? "subquery";
        // Rails wraps the alias in SqlLiteral so quote_table_name leaves it bare.
        // Only emit bare when the alias is a safe identifier; fall back to quoted
        // for names that would produce invalid SQL or risk injection.
        fromExpr = `(${subSql}) ${_safeAlias(name)}`;
        // The subquery compiles through its own collector (raw.toSql above),
        // capturing its retryability in raw._lastSelectRetryable. Rails folds
        // the whole arel through one collector, so AND it into ours: a raw SQL
        // fragment inside the subquery must lower the outer classification.
        // A set-operation subquery compiles each side separately, so
        // raw._lastSelectRetryable only reflects the last side — treat it as
        // non-retryable, matching how toArray() classifies set operations.
        this._lastSelectRetryable &&= raw._setOperation ? false : raw._lastSelectRetryable;
      } else if (raw instanceof Nodes.Node) {
        // Compile via the same visitor _compileSelectSql uses so identifier
        // quoting stays dialect-consistent across the whole SELECT.
        const sv = this._selectVisitor();
        fromExpr = sv ? sv.compile(raw) : raw.toSql();
        // Rails compiles the whole arel (including the FROM clause) through a
        // single collector, so a non-retryable FROM node lowers the overall
        // classification. We compile it separately, so AND its retryability
        // into the captured SELECT flag rather than letting it clobber.
        if (sv) {
          this._lastSelectRetryable &&= (sv as any).collector?.retryable ?? false;
        }
      } else if (alias) {
        fromExpr = `${raw} ${_safeAlias(alias)}`;
      } else {
        fromExpr = raw;
      }
      // Match ANSI double-quoted or MySQL backtick-quoted identifiers, including
      // schema-qualified chains ("schema"."table" or `schema`.`table`). The
      // function-form replacement avoids $ mangling from special replacement sequences.
      sql = sql.replace(
        /FROM\s+(?:"[^"]+"|[`][^`]+[`])(?:\.(?:"[^"]+"|[`][^`]+[`]))*/,
        () => `FROM ${fromExpr}`,
      );
    }

    // Append SQL comments from annotate()
    if (this._annotations.length > 0) {
      const comments = this._annotations.map((c) => `/* ${c} */`).join(" ");
      sql = `${sql} ${comments}`;
    }

    // Prepend CTE clauses
    if (this._ctes.length > 0) {
      const hasRecursive = this._ctes.some((c) => c.recursive);
      const keyword = hasRecursive ? "WITH RECURSIVE" : "WITH";
      const cteDefs = this._ctes.map((c) => `"${c.name}" AS (${c.sql})`).join(", ");
      sql = `${keyword} ${cteDefs} ${sql}`;
    }

    return sql;
  }

  private _combineNodes(nodes: Nodes.Node[]): Nodes.Node | null {
    if (nodes.length === 0) return null;
    if (nodes.length === 1) return nodes[0];
    return new Nodes.And(nodes);
  }

  private _collectAllWhereNodes(_table: Table, rel: Relation<T>): Nodes.Node[] {
    return predicatesWithWrappedSqlLiterals(rel._whereClause.predicates);
  }

  private _applyWheresToManager(manager: SelectManager, table: Table): void {
    const allNodes = this._collectAllWhereNodes(table, this);
    for (const node of allNodes) {
      manager.where(node);
    }
  }

  /** Resolve the connection through the public getter, returning null for HABTM join models with no established connection. */
  private _resolveAdapter(): DatabaseAdapter | null {
    try {
      return this._modelClass.connection;
    } catch (e) {
      if (e instanceof ConnectionNotEstablished) return null;
      throw e;
    }
  }

  private _arelVisitor(): Visitors.ToSql {
    const adapter = this._resolveAdapter();
    return adapter?.visitor ?? new Visitors.ToSql(adapter ?? undefined);
  }

  /**
   * Returns the adapter's SELECT visitor when one is defined, or null.
   *
   * Real adapters (PG, SQLite, MySQL) expose `visitor` — use it to
   * get dialect-correct quoting. Returns null when no
   * adapter is established (e.g. HABTM join models where adapter resolution throws) or
   * when the adapter is a mock/partial that doesn't define `visitor`;
   * callers then fall back to `manager.toSql()` / `node.toSql()` (global
   * registry visitor = ANSI double-quotes).
   */
  private _selectVisitor(): Visitors.ToSql | null {
    return this._resolveAdapter()?.visitor ?? null;
  }

  /**
   * Compile a SelectManager's AST using the adapter-specific visitor when one
   * is defined (real PG/SQLite/MySQL adapter), or manager.toSql() otherwise.
   */
  private _compileSelectSql(manager: { ast: Nodes.Node; toSql(): string }): string {
    const v = this._selectVisitor();
    const sql = v ? v.compile(manager.ast) : manager.toSql();
    // Capture the SELECT's retryability immediately after compilation. The
    // shared adapter visitor's collector is reset on every compile() call, and
    // _toSqlWithoutSetOp may compile again for from(ArelNode) FROM clauses —
    // which would clobber the flag before toArray() reads it.
    this._lastSelectRetryable = v ? ((v as any).collector?.retryable ?? false) : false;
    return sql;
  }

  private _compileArelNode(node: Nodes.Node): string {
    return this._arelVisitor().compile(node);
  }

  /**
   * Rails `Relation#assert_modifiable!`. Raises `UnmodifiableRelation`
   * when the relation has already been loaded.
   * @internal
   */
  assertModifiableBang(): void {
    return _assertModifiableBang.call(this as any);
  }

  /**
   * Rails `Relation#check_if_method_has_arguments!`. Delegates to the
   * canonical implementation in `relation/query-methods.ts` so all call
   * sites share one definition of "blank" / flatten semantics.
   * @internal
   */
  checkIfMethodHasArgumentsBang(
    methodName: string | symbol,
    args: unknown[],
    message?: string,
  ): void {
    // Rails passes a Symbol via __callee__; we collapse it to its
    // description so the error message reads `.select()` rather than
    // the verbose `.Symbol(select)()`. Anonymous symbols (no
    // description) fall through to "<anonymous>".
    const name =
      typeof methodName === "symbol" ? (methodName.description ?? "<anonymous>") : methodName;
    return _checkIfMethodHasArgumentsBang.call(this as any, name, args, message);
  }

  /**
   * Rails `Relation#table_name_matches?`. Delegates to the canonical
   * helper in `relation/query-methods.ts` (handles arel/relation toSql
   * conversion + adapter-quoted forms).
   * @internal
   */
  isTableNameMatches(from: unknown): boolean {
    return _isTableNameMatches.call(this as any, from);
  }

  /**
   * Rails `Relation#arel_column_with_table`. Delegates to the canonical
   * helper, which handles schema-qualified names and predicateBuilder
   * resolution.
   * @internal
   */
  arelColumnWithTable(tableName: string, columnName: string | symbol): unknown {
    return _arelColumnWithTable.call(this as any, tableName, columnName);
  }

  /**
   * Rails `Relation#arel_column`. Delegates to the canonical helper.
   * @internal
   */
  arelColumn(field: string | symbol | Nodes.Node, fallback?: (attr: string) => unknown): unknown {
    if (field instanceof Nodes.Node) return field;
    return _arelColumn.call(this as any, field as string | symbol, fallback);
  }

  /**
   * Rails `Relation#arel_columns_from_hash`. Delegates to the canonical
   * helper.
   * @internal
   */
  arelColumnsFromHash(fields: Record<PropertyKey, unknown>): unknown[] {
    return _arelColumnsFromHash.call(this as any, fields);
  }

  /**
   * Rails `Relation#arel_columns`. Delegates to the canonical helper.
   * Returns `unknown[]` because Rails' `else` branch passes non-Arel
   * values through unchanged (numerics, raw SQL fragments, etc.).
   * @internal
   */
  arelColumns(columns: ReadonlyArray<unknown>): unknown[] {
    return _arelColumns.call(this as any, columns as unknown[]);
  }

  // Returns true when `col` is a known schema attribute OR is (part of) the
  // model's primary key. The PK check is needed because `_attributeDefinitions`
  // may not yet contain `id` (before schema reflection), but it must still be
  // table-qualified to avoid ambiguous-column errors on joined relations.
  private _isKnownColumn(col: string): boolean {
    if (this._modelClass._attributeDefinitions.has(col)) return true;
    const pk = this._modelClass.primaryKey;
    return Array.isArray(pk) ? pk.includes(col) : pk === col;
  }

  /**
   * Quote a bare column identifier so an unknown column under a `from(subquery)`
   * context emits as bare `"col"` / `` `col` `` rather than `table.col`.
   * Mirrors Rails' `order_column` fallback (query_methods.rb): `Arel.sql(
   * model.adapter_class.quote_table_name(attr_name), retryable: true)`.
   * (Rails uses `quote_table_name` for a bare identifier; we use the
   * adapter's `quoteColumnName` — same emission for a single identifier
   * on all three dialects.)
   *
   * We can't use `Nodes.UnqualifiedColumn(table.get(col))` here: the MySQL
   * visitor — matching Rails' `arel/visitors/mysql.rb` — overrides that node
   * to delegate to the inner Attribute (Rails needs the table prefix for
   * `UPDATE t SET t.x = t.x + 1`), so MySQL would re-qualify.
   *
   * Quote against the visitor that will actually emit the SELECT so the
   * bare identifier matches the rest of the SQL's identifier quoting.
   * `_compileSelectSql` uses `_selectVisitor()` when defined, else
   * `manager.toSql()` (which is the global ANSI ToSql).
   * @internal
   */
  private _quoteBareColumn(name: string): string {
    if (this._selectVisitor() !== null) {
      return this._modelClass.connection.quoteColumnName(name);
    }
    return `"${name.replace(/"/g, '""')}"`;
  }

  private _applyOrderToManager(manager: SelectManager, table: Table): void {
    // Raw order clauses (from inOrderOf)
    for (const rawClause of this._rawOrderClauses) {
      manager.order(new Nodes.SqlLiteral(rawClause));
    }
    for (const clause of this._orderClauses) {
      if (clause instanceof Nodes.Node) {
        // Arel order nodes (Ascending/Descending/Attribute/...) preserved by
        // orderBang — emit directly so identity survives to the SQL manager.
        manager.order(clause);
        continue;
      }
      if (typeof clause === "object" && !Array.isArray(clause) && "raw" in clause) {
        manager.order(new Nodes.SqlLiteral((clause as { raw: string }).raw));
        continue;
      }
      if (typeof clause === "string") {
        const trimmed = clause.trim();
        // Detect SQL expressions (functions, parens, operators) and pass as raw SQL
        if (trimmed.includes("(") || /\bcase\b/i.test(trimmed) || trimmed.includes("||")) {
          manager.order(new Nodes.SqlLiteral(trimmed));
        } else {
          // Parse "column ASC/DESC" or "table.column ASC/DESC" strings
          const match = trimmed.match(/^([A-Za-z_$][\w$.]*)\s+(ASC|DESC)$/i);
          if (match) {
            const rawCol = match[1];
            const dir = match[2].toUpperCase();
            // Any dotted identifier (one or more dots) passes through as raw SQL.
            if (rawCol.includes(".")) {
              manager.order(new Nodes.SqlLiteral(trimmed));
            } else if (!this._fromClause.isEmpty() && !this._isKnownColumn(rawCol)) {
              const lit = this.orderColumn(rawCol) as Nodes.Node;
              manager.order(dir === "DESC" ? new Nodes.Descending(lit) : new Nodes.Ascending(lit));
            } else {
              const node = table.get(rawCol);
              manager.order(
                dir === "DESC" ? new Nodes.Descending(node) : new Nodes.Ascending(node),
              );
            }
          } else {
            // Not "col DIR" form. Only wrap plain letter-start identifiers;
            // everything else (positional "1", NULLS FIRST, commas, etc.) is raw SQL.
            if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
              if (!this._fromClause.isEmpty() && !this._isKnownColumn(trimmed)) {
                manager.order(new Nodes.Ascending(this.orderColumn(trimmed) as Nodes.Node));
              } else {
                manager.order(new Nodes.Ascending(table.get(trimmed)));
              }
            } else {
              manager.order(new Nodes.SqlLiteral(trimmed));
            }
          }
        }
      } else if (Array.isArray(clause)) {
        const [col, dir] = clause;
        // Function expressions, quoted identifiers, and dotted names must be
        // emitted as raw SQL — table.get() would double-quote them incorrectly.
        if (/[()"`]|::/.test(col) || /^[\w$]+(\.[\w$]+)+$/.test(col)) {
          const lit = new Nodes.SqlLiteral(col);
          manager.order(dir === "desc" ? new Nodes.Descending(lit) : new Nodes.Ascending(lit));
        } else if (!this._fromClause.isEmpty() && !this._isKnownColumn(col)) {
          const lit = this.orderColumn(col) as Nodes.Node;
          manager.order(dir === "desc" ? new Nodes.Descending(lit) : new Nodes.Ascending(lit));
        } else {
          manager.order(dir === "desc" ? table.get(col).desc() : table.get(col).asc());
        }
      }
    }
  }

  private _castWhereValue(key: string, value: unknown): unknown {
    if (value === null || value === undefined || value instanceof Range) return value;
    let attrKey = key;
    const firstDot = key.indexOf(".");
    if (firstDot !== -1 && key.indexOf(".", firstDot + 1) === -1 && !key.includes('"')) {
      const tablePrefix = key.slice(0, firstDot);
      if (tablePrefix === this._modelClass.arelTable.name) {
        attrKey = key.slice(firstDot + 1);
      }
    }
    return this._modelClass._castAttributeValue(attrKey, value);
  }

  private _qualifiedCol(table: Table, key: string): { tbl: string; col: string } {
    if (key.includes('"')) return { tbl: table.name, col: key };
    const firstDot = key.indexOf(".");
    if (firstDot === -1) return { tbl: table.name, col: key };
    if (key.indexOf(".", firstDot + 1) !== -1) return { tbl: table.name, col: key };
    return { tbl: key.slice(0, firstDot), col: key.slice(firstDot + 1) };
  }

  private async _preloadAssociationsForRecords(
    records: T[],
    assocNames: AssociationSpec[],
  ): Promise<void> {
    if (assocNames.length === 0) return;
    const { Preloader } = await import("./associations/preloader.js");
    const preloader = new Preloader({
      records: records as unknown as import("./base.js").Base[],
      associations: assocNames,
      scope: this._isStrictLoading ? StrictLoadingScope : undefined,
    });
    await preloader.call();
  }

  // find, findBy, findByBang, findSoleBy, findOrCreateByBang, createOrFindByBang,
  // and all bang ordinal methods are mixed in from finder-methods.ts

  // -- CTE support --

  /**
   * Add a Common Table Expression (WITH clause).
   *
   * Mirrors: ActiveRecord::Relation#with
   */
  with(
    ...ctes: Array<Record<string, Relation<any> | string | Array<Relation<any> | string>>>
  ): Relation<T> {
    return this._clone().withBang(...ctes);
  }

  /**
   * Add a recursive Common Table Expression (WITH RECURSIVE clause).
   *
   * Mirrors: ActiveRecord::Relation#with_recursive
   */
  withRecursive(...ctes: Array<Record<string, Relation<any> | string>>): Relation<T> {
    return this._clone().withRecursiveBang(...ctes);
  }

  // -- Other query methods --

  /**
   * Add table references for eager loading.
   *
   * Mirrors: ActiveRecord::Relation#references
   */
  references(...tables: string[]): Relation<T> {
    return this._clone().referencesBang(...tables);
  }

  /**
   * Extract an associated collection into a new relation.
   *
   * Mirrors: ActiveRecord::Relation#extract_associated
   */
  async extractAssociated(name: string): Promise<Base[]> {
    const records = await this.toArray();
    const results: Base[] = [];
    for (const record of records) {
      const associated = await (record as any)[name]();
      if (Array.isArray(associated)) {
        results.push(...associated);
      } else if (associated) {
        results.push(associated);
      }
    }
    return results;
  }

  /**
   * Alias for build.
   *
   * Mirrors: ActiveRecord::Relation#new
   */
  new(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  new(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  new(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attrs)) return this.build(attrs, block);
    return this.build(attrs, block);
  }

  // -- Mutation methods --

  /**
   * Update a record by primary key.
   *
   * Mirrors: ActiveRecord::Relation#update
   */
  async update(id?: unknown, attrs?: Record<string, unknown>): Promise<T | T[]> {
    if (id === undefined || (typeof id === "object" && id !== null && attrs === undefined)) {
      // update(attrs) form — update all matching records
      const updates = (id ?? {}) as Record<string, unknown>;
      const records = await this.toArray();
      for (const record of records) {
        await record.update(updates);
      }
      return records;
    }
    const record = (await this.find(id)) as T;
    await record.update(attrs ?? {});
    return record;
  }

  /**
   * Update a record by primary key, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#update!
   */
  async updateBang(id?: unknown, attrs?: Record<string, unknown>): Promise<T | T[]> {
    if (id === undefined || (typeof id === "object" && id !== null && attrs === undefined)) {
      const updates = (id ?? {}) as Record<string, unknown>;
      const records = await this.toArray();
      for (const record of records) {
        await record.updateBang(updates);
      }
      return records;
    }
    const record = (await this.find(id)) as T;
    await record.updateBang(attrs ?? {});
    return record;
  }

  /**
   * Insert a new record (skips callbacks/validations).
   *
   * Mirrors: ActiveRecord::Base.insert
   */
  async insert(
    attrs: Record<string, unknown>,
    options?: { uniqueBy?: string | string[] },
  ): Promise<number> {
    return this.insertAll([attrs], options);
  }

  /**
   * Insert a new record, raising on failure.
   *
   * Mirrors: ActiveRecord::Base.insert!
   */
  async insertBang(
    attrs: Record<string, unknown>,
    options?: Pick<InsertAllOptions, "returning" | "recordTimestamps">,
  ): Promise<number> {
    return this.insertAllBang([attrs], options);
  }

  /**
   * Insert multiple records, raising on failure.
   *
   * Mirrors: ActiveRecord::Base.insert_all! (Rails relation.rb:790 —
   * `def insert_all!(attributes, returning: nil, record_timestamps: nil)`).
   */
  async insertAllBang(
    records: Record<string, unknown>[],
    options?: Pick<InsertAllOptions, "returning" | "recordTimestamps">,
  ): Promise<number> {
    return InsertAll.execute(this, records, {
      returning: options?.returning,
      recordTimestamps: options?.recordTimestamps,
    });
  }

  /**
   * Upsert a single record.
   *
   * Mirrors: ActiveRecord::Base.upsert
   */
  async upsert(
    attrs: Record<string, unknown>,
    options?: { uniqueBy?: string | string[] },
  ): Promise<number> {
    return this.upsertAll([attrs], options);
  }

  /**
   * Increment/decrement counter columns for all records matching this
   * relation. Values can be positive (increment) or negative (decrement).
   *
   * If `options.touch` is given, updates the named timestamp columns
   * (and `updated_at`/`updated_on` by default) at the same time — matching
   * Rails' `Relation#update_counters(counters, touch:)` behavior.
   *
   * Mirrors: ActiveRecord::Relation#update_counters. For each counter
   * column, builds an Arel `COALESCE("col", 0) + N` expression via
   * `NamedFunction` + `UnqualifiedColumn` + `Addition`. The COALESCE
   * wrapper keeps NULL counters from propagating through the arithmetic.
   */
  async updateCounters(
    counters: Record<string, number>,
    options?: { touch?: boolean | string | string[] },
  ): Promise<number> {
    if (this._isNone) return 0;

    const updates: Record<string, unknown> = {};

    for (const [counterName, value] of Object.entries(counters)) {
      updates[counterName] = this._incrementAttribute(
        this._modelClass.arelTable.get(counterName),
        value,
      );
    }

    if (options?.touch) {
      // `touch: []` is an explicit "skip timestamp updates" signal. Rails'
      // counter_cache test `update counters doesn't touch timestamps with
      // touch: []` asserts this behavior (its Rails implementation is
      // incidentally a no-op because the test never reloads the record).
      const isEmptyArray = Array.isArray(options.touch) && options.touch.length === 0;
      if (!isEmptyArray) {
        const names = options.touch === true ? [] : ([] as string[]).concat(options.touch);
        const touchUpdates = touchAttributesWithTime.call(this._modelClass, ...names);
        for (const [col, time] of Object.entries(touchUpdates)) {
          updates[col] = new Nodes.Quoted(time);
        }
      }
    }

    // Nothing to update (e.g. `updateCounters({})` or
    // `updateCounters({}, { touch: [] })`) — skip updateAll, which would
    // otherwise build an UPDATE with no SET clause and produce invalid SQL.
    if (Object.keys(updates).length === 0) return 0;

    return this.updateAll(updates);
  }

  /**
   * Delete a record by primary key (no callbacks).
   *
   * Mirrors: ActiveRecord::Relation#delete
   */
  async delete(id: unknown): Promise<number> {
    if (id == null) return 0;
    if (Array.isArray(id) && id.length === 0) return 0;

    const primaryKey = this._modelClass.primaryKey;
    if (Array.isArray(primaryKey)) {
      const idArr = Array.isArray(id) ? id : [id];
      if (idArr.length !== primaryKey.length) return 0;
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < primaryKey.length; i++) {
        conditions[primaryKey[i]] = idArr[i];
      }
      return this.where(conditions).deleteAll();
    }

    return this.where({ [primaryKey]: id }).deleteAll();
  }

  /**
   * Destroy a record by primary key (runs callbacks).
   *
   * Mirrors: ActiveRecord::Relation#destroy
   */
  async destroy(id: unknown): Promise<T> {
    const record = (await this.find(id)) as T;
    await record.destroy();
    return record;
  }

  /**
   * Destroy records matching conditions.
   *
   * Mirrors: ActiveRecord::Relation#destroy_by
   */
  async destroyBy(conditions: Record<string, unknown> = {}): Promise<T[]> {
    return this.where(conditions).destroyAll();
  }

  /**
   * Delete records matching conditions (no callbacks).
   *
   * Mirrors: ActiveRecord::Relation#delete_by
   */
  async deleteBy(conditions: Record<string, unknown> = {}): Promise<number> {
    return this.where(conditions).deleteAll();
  }

  // -- Other --

  /**
   * Async variant of pick.
   *
   * Mirrors: ActiveRecord::Relation#async_pick
   */
  asyncPick(...columns: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>) {
    return this.pick(...columns);
  }

  /**
   * Return the Arel SelectManager.
   *
   * Mirrors: ActiveRecord::Relation#arel (alias for toArel)
   */
  arel(): SelectManager {
    return this.toArel();
  }

  /**
   * Check equality with another relation.
   *
   * Mirrors: ActiveRecord::Relation#==
   */
  async equals(other: Relation<T>): Promise<boolean> {
    const a = await this.toArray();
    const b = await other.toArray();
    if (a.length !== b.length) return false;
    return a.every((rec, i) => rec.isEqual(b[i]));
  }

  /**
   * Return the Arel table for this relation's model.
   *
   * Mirrors: ActiveRecord::Relation#table
   */
  get table(): Table {
    return this._table ?? this._modelClass.arelTable;
  }

  /**
   * Return the model class for this relation.
   *
   * Mirrors: ActiveRecord::Relation#model
   */
  get model(): typeof Base {
    return this._modelClass;
  }

  /**
   * Alias for isLoaded.
   *
   * Mirrors: ActiveRecord::Relation#loaded?
   */
  get loaded(): boolean {
    return this._loaded;
  }

  /**
   * Check if this relation is a none relation (will always return empty).
   *
   * Mirrors: ActiveRecord::Relation#none?
   */
  isNone(): boolean {
    return this._isNone;
  }

  /**
   * Return self — a no-op on a Relation.
   *
   * Mirrors: ActiveRecord::Relation#all
   */
  all(): Relation<T> {
    return this;
  }

  /**
   * Check if the given record is present in the loaded records.
   *
   * Mirrors: ActiveRecord::Relation#include?
   */
  async include(record: T): Promise<boolean> {
    const records = await this.toArray();
    return records.some((r) => r.isEqual(record));
  }

  // ---------------------------------------------------------------------------
  // Missing relation.rb methods — accessors, cache keys, scoping
  // ---------------------------------------------------------------------------

  private _predicateBuilder: PredicateBuilder | null = null;

  get predicateBuilder(): PredicateBuilder {
    if (this._predicateBuilder) {
      return this._predicateBuilder;
    }
    let pb: PredicateBuilder;
    const modelPbAccessor = (this._modelClass as any).predicateBuilder;
    const modelPb =
      typeof modelPbAccessor === "function"
        ? modelPbAccessor.call(this._modelClass)
        : modelPbAccessor;
    const metadata = new TableMetadata(this._modelClass, this.table);
    if (modelPb && typeof modelPb.with === "function") {
      pb = modelPb.with(metadata);
    } else {
      pb = new PredicateBuilder(this.table);
      pb.setTableContext(metadata);
    }
    this._predicateBuilder = pb;
    return pb;
  }

  get skipPreloadingValue(): boolean {
    return this._skipPreloading;
  }

  get isScheduled(): boolean {
    return false;
  }

  get isEagerLoading(): boolean {
    return (
      this._eagerLoadAssociations.length > 0 ||
      (this._includesAssociations.length > 0 && this._joinClauses.length > 0)
    );
  }

  get joinedIncludesValues(): string[] {
    if (this._joinClauses.length === 0) return [];
    return this._includesAssociations.filter(
      (assoc): assoc is string =>
        typeof assoc === "string" && this._joinClauses.some((j) => j.table === assoc),
    );
  }

  values(): Record<string, unknown> {
    return {
      includes: [...this._includesAssociations],
      eagerLoad: [...this._eagerLoadAssociations],
      preload: [...this._preloadAssociations],
      select: this._selectColumns ? [...this._selectColumns] : null,
      group: [...this._groupColumns],
      order: [...this._orderClauses],
      joins: [...this._joinClauses],
      where: this._whereClause.clone(),
      having: this._havingClause.clone(),
      limit: this._limitValue,
      offset: this._offsetValue,
      lock: this._lockValue,
      readonly: this._isReadonly,
      distinct: this._isDistinct,
      strictLoading: this._isStrictLoading,
      from: this._fromClause,
      annotations: [...this._annotations],
      optimizerHints: [...this._optimizerHints],
      references: [...this._referencesValues],
      extending: [...this._extending],
      with: [...this._ctes],
      createWith: { ...this._createWithAttrs },
    };
  }

  valuesForQueries(): Record<string, unknown> {
    return this.values();
  }

  get isEmptyScope(): boolean {
    return (
      this._whereClause.isEmpty() &&
      this._orderClauses.length === 0 &&
      this._limitValue === null &&
      this._offsetValue === null &&
      this._selectColumns === null &&
      !this._isDistinct &&
      this._groupColumns.length === 0 &&
      this._havingClause.isEmpty() &&
      this._joinClauses.length === 0 &&
      this._joinValues.length === 0 &&
      this._leftOuterJoinsValues.length === 0 &&
      this._includesAssociations.length === 0 &&
      this._eagerLoadAssociations.length === 0 &&
      this._preloadAssociations.length === 0 &&
      this._lockValue === null &&
      this._fromClause.isEmpty() &&
      this._ctes.length === 0 &&
      this._annotations.length === 0 &&
      this._optimizerHints.length === 0
    );
  }

  get hasLimitOrOffset(): boolean {
    return this._limitValue !== null || this._offsetValue !== null;
  }

  aliasTracker(): Record<string, number> {
    const tracker: Record<string, number> = {};
    for (const join of this._joinClauses) {
      tracker[join.table] = (tracker[join.table] ?? 0) + 1;
    }
    return tracker;
  }

  preloadAssociations(): AssociationSpec[] {
    return [...this._preloadAssociations, ...this._includesAssociations];
  }

  bindAttribute(column: string, value: unknown): unknown {
    return this.predicateBuilder.build(this._modelClass.arelTable.get(column), value);
  }

  async scoping<R>(callback: () => R | Promise<R>): Promise<R> {
    const modelClass = this._modelClass as any;
    const prev = ScopeRegistry.currentScope(modelClass);
    ScopeRegistry.setCurrentScope(modelClass, this as any);
    try {
      return await callback();
    } finally {
      ScopeRegistry.setCurrentScope(modelClass, prev);
    }
  }

  /**
   * Mirrors: ActiveRecord::SignedId::RelationMethods#find_signed
   */
  async findSigned(token: string, options?: { purpose?: string }): Promise<T | null> {
    return this.scoping(() =>
      (this._modelClass as any).findSigned(token, options),
    ) as Promise<T | null>;
  }

  /**
   * Mirrors: ActiveRecord::SignedId::RelationMethods#find_signed!
   */
  async findSignedBang(token: string, options?: { purpose?: string }): Promise<T> {
    return this.scoping(() =>
      (this._modelClass as any).findSignedBang(token, options),
    ) as Promise<T>;
  }

  // Memoized per timestamp column, matching Rails' @cache_keys / @cache_versions.
  private _cacheKeys: Map<string, Promise<string>> | undefined;
  private _cacheVersions: Map<string, Promise<string | null>> | undefined;

  /**
   * Returns a cache key for this relation, including count and timestamp when
   * collection_cache_versioning is off (the default), or just the query digest
   * when versioning is on (stable key, use cache_version for the changing part).
   *
   * Mirrors: ActiveRecord::Relation#cache_key
   */
  async cacheKey(timestampColumn = "updated_at"): Promise<string> {
    this._cacheKeys ??= new Map();
    if (!this._cacheKeys.has(timestampColumn)) {
      this._cacheKeys.set(timestampColumn, this.computeCacheKey(timestampColumn));
    }
    return this._cacheKeys.get(timestampColumn)!;
  }

  /** @internal */
  async computeCacheKey(timestampColumn = "updated_at"): Promise<string> {
    const key = `${this._modelClass.tableName}/query-${hexdigest(this.toSql())}`;
    if (this._modelClass.collectionCacheVersioning) {
      return key;
    }
    const version = await this.computeCacheVersion(timestampColumn);
    return `${key}-${version}`;
  }

  /**
   * Returns cache version when collection_cache_versioning is on, null otherwise.
   *
   * Mirrors: ActiveRecord::Relation#cache_version
   */
  async cacheVersion(timestampColumn = "updated_at"): Promise<string | null> {
    if (!this._modelClass.collectionCacheVersioning) return null;
    this._cacheVersions ??= new Map();
    if (!this._cacheVersions.has(timestampColumn)) {
      this._cacheVersions.set(
        timestampColumn,
        this.computeCacheVersion(timestampColumn) as Promise<string | null>,
      );
    }
    return this._cacheVersions.get(timestampColumn)!;
  }

  /** @internal */
  async computeCacheVersion(timestampColumn = "updated_at"): Promise<string> {
    let size = 0;
    let timestamp: unknown = null;

    if (this._loaded) {
      size = this._records.length;
      if (size > 0) {
        const toInstant = (v: unknown): Temporal.Instant | null => {
          if (v instanceof Temporal.Instant) return v;
          // boundary: cache-key timestamp may be JS Date or epoch number
          // from custom-typed columns; bridge into a Temporal.Instant.
          if (v instanceof Date && !Number.isNaN(v.getTime()))
            return Temporal.Instant.fromEpochMilliseconds(v.getTime());
          if (typeof v === "number" && Number.isFinite(v))
            return Temporal.Instant.fromEpochMilliseconds(v);
          return null;
        };
        timestamp = this._records
          .map((r) => (r as any).readAttribute(timestampColumn))
          .reduce((max: unknown, val: unknown) => {
            if (max == null) return val;
            if (val == null) return max;
            // Coerce Date/number to Instant for the dual-typed window (pre-PR 5a).
            const valI = toInstant(val);
            const maxI = toInstant(max);
            if (valI && maxI) return Temporal.Instant.compare(valI, maxI) > 0 ? valI : maxI;
            return max;
          }, null);
      }
    } else {
      const collection: Relation<T> = this;
      const tsColumn = this.table.get(timestampColumn);
      // Build COUNT(*) and MAX(col) projections via Arel nodes.
      const countStar = new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]);
      const maxNode = tsColumn.maximum();

      if (this._limitValue !== null || (this._offsetValue ?? 0) > 0) {
        // Has LIMIT/OFFSET — wrap in a subquery (mirrors Rails' build_subquery).
        const subqueryAlias = "subquery_for_cache_key";
        const inner = collection._clone();
        inner._selectColumns = [
          this._compileArelNode(tsColumn.as("collection_cache_key_timestamp")),
        ];
        if (this._isDistinct && (!this._selectColumns || this._selectColumns.length === 0)) {
          inner._selectColumns = [this._compileArelNode(this.table.star), ...inner._selectColumns!];
        }
        // Build a proper Arel SelectManager for the outer COUNT/MAX query so
        // quoting and adapter differences are handled by the AST visitor.
        // Grouping(SqlLiteral) renders as "(inner sql)" and TableAlias appends
        // the bare alias name (same pattern SelectManager#as uses in Rails).
        const subAlias = new Nodes.TableAlias(
          new Nodes.Grouping(new Nodes.SqlLiteral(inner.toSql())),
          subqueryAlias,
        );
        const subTable = new Table(subqueryAlias);
        const subColumn = subTable.get("collection_cache_key_timestamp");
        const outerManager = new SelectManager();
        outerManager.from(subAlias);
        outerManager.project(
          new Nodes.NamedFunction("COUNT", [new Nodes.SqlLiteral("*")]).as("size"),
          subColumn.maximum().as("timestamp"),
        );
        const rows = await this._modelClass.connection.execute(outerManager.toSql());
        size = Number(rows[0]?.size ?? 0);
        timestamp = rows[0]?.timestamp;
      } else {
        const query = collection._clone();
        query._orderClauses = [];
        query._rawOrderClauses = [];
        query._selectColumns = [
          this._compileArelNode(countStar.as("size")),
          this._compileArelNode(maxNode.as("timestamp")),
        ];
        const rows = await this._modelClass.connection.execute(query.toSql());
        size = Number(rows[0]?.size ?? 0);
        timestamp = rows[0]?.timestamp;
      }
    }

    if (timestamp != null) {
      let ts: Temporal.Instant | null = null;
      if (timestamp instanceof Temporal.Instant) {
        ts = timestamp;
      } else if (
        // boundary: aggregate cache-key timestamp from a custom-typed column.
        timestamp instanceof Date &&
        !Number.isNaN(timestamp.getTime())
      ) {
        ts = Temporal.Instant.fromEpochMilliseconds(timestamp.getTime());
      } else if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
        ts = Temporal.Instant.fromEpochMilliseconds(timestamp);
      } else if (typeof timestamp === "string") {
        try {
          // Normalize: space → T, short offset ±HH → ±HH:MM (Postgres wire quirk).
          // Naive strings interpreted in defaultSqlTimezone() — UTC by default,
          // host-system local when ActiveRecord.default_timezone === "local".
          const normalized = timestamp
            .trim()
            .replace(" ", "T")
            .replace(/(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([-+]\d{2})$/, "$1$2:00");
          const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(normalized);
          ts = hasOffset
            ? Temporal.Instant.from(normalized)
            : Temporal.PlainDateTime.from(normalized)
                .toZonedDateTime(defaultSqlTimezone())
                .toInstant();
        } catch {
          ts = null;
        }
      }
      if (ts != null) {
        const fmt = this._modelClass.cacheTimestampFormat;
        const formatted = formatCacheTimestamp(ts, fmt);
        return `${size}-${formatted}`;
      }
      return `${size}-${String(timestamp)}`;
    }
    return `${size}`;
  }

  async cacheKeyWithVersion(timestampColumn = "updated_at"): Promise<string> {
    const key = await this.cacheKey(timestampColumn);
    const version = await this.cacheVersion(timestampColumn);
    return version ? `${key}-${version}` : key;
  }

  /**
   * @internal Subclasses (e.g. AssociationRelation) override this to return
   * an instance of themselves so `_clone()` preserves the subclass through
   * chains like `blog.posts.where(...).order(...)`.
   */
  protected _newRelation(): Relation<T> {
    return new Relation<T>(this._modelClass);
  }

  /**
   * @internal Copy query state from `source` onto `this`. Extracted from
   * `_clone()` so subclasses (and helpers like AssociationRelation) can
   * reuse it without duplicating the field list.
   */
  _copyStateFrom(source: Relation<T>): void {
    this._table = source._table;
    this._whereClause = source._whereClause.clone();
    this._orderClauses = [...source._orderClauses];
    this._rawOrderClauses = [...source._rawOrderClauses];
    this._reordering = source._reordering;
    this._limitValue = source._limitValue;
    this._offsetValue = source._offsetValue;
    this._selectColumns = source._selectColumns ? [...source._selectColumns] : null;
    this._isDistinct = source._isDistinct;
    this._distinctOnColumns = [...source._distinctOnColumns];
    this._groupColumns = [...source._groupColumns];
    this._havingClause = source._havingClause.clone();
    this._isNone = source._isNone;
    this._lockValue = source._lockValue;
    this._setOperation = source._setOperation;
    this._joinClauses = [...source._joinClauses];
    this._joinValues = [...source._joinValues];
    this._leftOuterJoinsValues = [...source._leftOuterJoinsValues];
    this._includesAssociations = [...source._includesAssociations];
    this._preloadAssociations = [...source._preloadAssociations];
    this._eagerLoadAssociations = [...source._eagerLoadAssociations];
    this._isReadonly = source._isReadonly;
    this._isStrictLoading = source._isStrictLoading;
    this._annotations = [...source._annotations];
    this._optimizerHints = [...source._optimizerHints];
    this._referencesValues = [...source._referencesValues];
    this._fromClause = source._fromClause;
    this._createWithAttrs = { ...source._createWithAttrs };
    this._extending = [...source._extending];
    this._ctes = [...source._ctes];
    this._skipPreloading = source._skipPreloading;
    this._skipQueryCache = source._skipQueryCache;
  }

  /** @internal */
  _clone(): Relation<T> {
    const rel = this._newRelation();
    rel._copyStateFrom(this);
    return wrapWithScopeProxy(rel);
  }

  _execScope(fn: (...args: unknown[]) => unknown, ...args: unknown[]): Relation<T> {
    return (fn.call(this, ...args) || this) as Relation<T>;
  }

  protected loadRecords(records: T[]): void {
    this._records = [...records];
    this._loaded = true;
  }

  private isAlreadyInScope(registry: any): boolean {
    return !!registry?.currentScope?.(this._modelClass, true);
  }

  private isGlobalScope(registry: any): boolean {
    return !!registry?.globalCurrentScope?.(this._modelClass, true);
  }

  private currentScopeRestoringBlock(block?: (record: T) => void): (record: T) => void {
    const modelClass = this._modelClass;
    const currentScope = ScopeRegistry.currentScope(modelClass as any);
    return (record: T) => {
      ScopeRegistry.setCurrentScope(modelClass as any, currentScope ?? null);
      block?.(record);
    };
  }

  private _new(attributes: Record<string, unknown>): T {
    return new (this._modelClass as any)(attributes) as T;
  }

  private _create(attributes: Record<string, unknown>): Promise<T> {
    return (this._modelClass as any).create(attributes);
  }

  private _createBang(attributes: Record<string, unknown>): Promise<T> {
    return (this._modelClass as any).createBang(attributes);
  }

  private _scoping<R>(scope: any, registry: any, fn: () => R): R {
    const previous = registry?.currentScope?.(this._modelClass, true);
    registry?.setCurrentScope?.(this._modelClass, scope);
    try {
      return fn();
    } finally {
      registry?.setCurrentScope?.(this._modelClass, previous);
    }
  }

  private _substituteValues(values: [string, unknown][]): [any, any][] {
    return values.map(([name, value]) => {
      const attr = this._modelClass.arelTable.get(name);
      const bind = this.predicateBuilder.buildBindAttribute(name, value);
      return [attr, bind];
    });
  }

  private _incrementAttribute(attribute: any, value = 1): any {
    const unqual = new Nodes.UnqualifiedColumn(
      typeof attribute === "string" ? this._modelClass.arelTable.get(attribute) : attribute,
    );
    const coalesced = new Nodes.NamedFunction("COALESCE", [unqual, new Nodes.Quoted(0)]);
    const bind = new Nodes.Quoted(Math.abs(value));
    return value < 0 ? new Nodes.Subtraction(coalesced, bind) : new Nodes.Addition(coalesced, bind);
  }

  private async execQueries(): Promise<T[]> {
    const rows = await this.execMainQuery();
    return this.instantiateRecords(rows);
  }

  private async execMainQuery(): Promise<Record<string, unknown>[]> {
    if (this._isNone) return [];
    const sql = this.toSql();
    const result = await this._modelClass.connection.execute(sql);
    return result;
  }

  private instantiateRecords(rows: Record<string, unknown>[]): T[] {
    if (rows.length === 0) return [];
    return rows.map((row) => this._modelClass._instantiate(row) as T);
  }

  private skipQueryCacheIfNecessary<R>(block: () => R): R {
    return block();
  }

  // ---------------------------------------------------------------------------
  // PR 37c — build-helper privates (delegates to relation/query-methods.ts)
  // Mirrors: ActiveRecord::QueryMethods private build helpers
  // ---------------------------------------------------------------------------

  /** @internal */
  private buildWhereClause(opts: unknown, rest: unknown[] = []): unknown {
    return _qm.buildWhereClause.call(this as any, opts, rest);
  }

  /** @internal */
  private buildNamedBoundSqlLiteral(statement: string, values: Record<string, unknown>): unknown {
    return _qm.buildNamedBoundSqlLiteral.call(this as any, statement, values);
  }

  /** @internal */
  private buildBoundSqlLiteral(statement: string, values: unknown[]): unknown {
    return _qm.buildBoundSqlLiteral.call(this as any, statement, values);
  }

  /** @internal */
  private buildSubquery(subqueryAlias: string, selectValue: unknown): unknown {
    return _qm.buildSubquery.call(this as any, subqueryAlias, selectValue);
  }

  /** @internal */
  private buildCastValue(name: string, value: unknown): unknown {
    return _qm.buildCastValue(name, value);
  }

  /** @internal */
  private flattenedArgs(args: unknown[]): unknown[] {
    return _qm.flattenedArgs(args);
  }

  /** @internal */
  private validateOrderArgs(args: unknown[]): void {
    _qm.validateOrderArgs.call(this as any, args);
  }

  /** @internal */
  private processWithArgs(args: unknown[]): Record<string, unknown>[] {
    return _qm.processWithArgs.call(this as any, args);
  }

  /** @internal */
  private isDoesNotSupportReverse(order: string): boolean {
    return _qm.isDoesNotSupportReverse(order);
  }

  /** @internal */
  private reverseSqlOrder(orderQuery: unknown[]): unknown[] {
    return _qm.reverseSqlOrder.call(this as any, orderQuery);
  }

  /** @internal */
  private extractTableNameFrom(orderTerm: string): string | null {
    return _qm.extractTableNameFrom(orderTerm);
  }

  /** @internal */
  private columnReferences(orderArgs: unknown[]): string[] {
    return _qm.columnReferences(orderArgs);
  }

  /** @internal */
  private sanitizeOrderArguments(orderArgs: unknown[]): unknown[] {
    return _qm.sanitizeOrderArguments.call(this as any, orderArgs);
  }

  /** @internal */
  private preprocessOrderArgs(orderArgs: unknown[]): void {
    _qm.preprocessOrderArgs.call(this as any, orderArgs);
  }

  /** @internal */
  private buildOrder(arel: unknown): void {
    _qm.buildOrder.call(this as any, arel);
  }

  /** @internal */
  private buildCaseForValuePosition(
    column: unknown,
    values: unknown[],
    options?: { filter?: boolean },
  ): unknown {
    return _qm.buildCaseForValuePosition.call(this as any, column, values, options);
  }

  /** @internal */
  private resolveArelAttributes(attrs: unknown[]): unknown[] {
    return _qm.resolveArelAttributes.call(this as any, attrs);
  }

  /** @internal */
  private orderColumn(field: string): unknown {
    return _qm.orderColumn.call(this as any, field);
  }

  /** @internal */
  private processSelectArgs(fields: unknown[]): unknown[] {
    return _qm.processSelectArgs.call(this as any, fields);
  }

  /** @internal */
  private arelColumnAliasesFromHash(fields: Record<string | symbol, unknown>): unknown[] {
    return _qm.arelColumnAliasesFromHash.call(this as any, fields);
  }

  /** @internal */
  private buildFrom(): unknown {
    return _qm.buildFrom.call(this as any);
  }

  /** @internal */
  private buildSelect(arel: unknown): void {
    _qm.buildSelect.call(this as any, arel);
  }

  /** @internal */
  private buildWithExpressionFromValue(value: unknown): unknown {
    return _qm.buildWithExpressionFromValue.call(this as any, value);
  }

  /** @internal */
  private buildWithValueFromHash(hash: Record<string, unknown>): unknown[] {
    return _qm.buildWithValueFromHash.call(this as any, hash);
  }

  /** @internal */
  private lookupTableKlassFromJoinDependencies(tableName: string): unknown {
    return _qm.lookupTableKlassFromJoinDependencies.call(this as any, tableName);
  }

  /** @internal */
  private eachJoinDependencies(
    joinDependencies: unknown[] | undefined,
    block: (join: unknown) => void,
  ): void {
    _qm.eachJoinDependencies.call(this as any, joinDependencies as any, block);
  }

  /** @internal */
  private buildJoinDependencies(): unknown[] {
    return _qm.buildJoinDependencies.call(this as any);
  }

  /** @internal */
  private buildArel(connection?: unknown, aliases?: AliasTracker): unknown {
    return _qm.buildArel.call(this as any, connection, aliases);
  }

  /** @internal */
  private selectNamedJoins(
    joinNames: unknown[],
    stashedJoins?: unknown[] | null,
    block?: (join: unknown) => void,
  ): unknown[] {
    return _qm.selectNamedJoins.call(this as any, joinNames, stashedJoins ?? null, block);
  }

  /** @internal */
  private selectAssociationList(
    associations: unknown[],
    stashedJoins?: unknown[] | null,
    block?: (join: unknown) => void,
  ): unknown[] {
    return _qm.selectAssociationList.call(this as any, associations, stashedJoins ?? null, block);
  }

  /** @internal */
  private buildJoinBuckets(): Record<string, unknown[]> {
    return _qm.buildJoinBuckets.call(this as any);
  }

  /** @internal */
  private buildJoins(arel: unknown): void {
    _qm.buildJoins.call(this as any, arel);
  }

  /** @internal */
  private buildWith(arel: unknown): void {
    _qm.buildWith.call(this as any, arel);
  }

  /** @internal */
  private buildWithJoinNode(name: string, kind?: unknown): unknown {
    return _qm.buildWithJoinNode.call(this as any, name, kind as any);
  }

  /** @internal */
  private structurallyIncompatibleValuesFor(other: unknown): string[] {
    return _qm.structurallyIncompatibleValuesFor(this as any, other as any);
  }

  // ---------------------------------------------------------------------------
  // PR 37b — calculation privates (delegates to relation/calculations.ts)
  // Mirrors: ActiveRecord::Calculations private helpers
  // ---------------------------------------------------------------------------

  /** @internal */
  private aggregateColumn(columnName: string): unknown {
    return _aggregateColumn(this as any, columnName);
  }

  /** @internal */
  private isAllAttributes(columnNames: string[]): boolean {
    return _isAllAttributes(this as any, columnNames);
  }

  /** @internal */
  private hasInclude(columnName: string | null): boolean {
    return _hasInclude(this as any, columnName);
  }

  /** @internal */
  private performCalculation(operation: string, columnName: string): Promise<unknown> {
    return _performCalculation(this as any, operation, columnName);
  }

  /** @internal */
  private isDistinctSelect(columnName: string): boolean {
    return _isDistinctSelect(this as any, columnName);
  }

  /** @internal */
  private operationOverAggregateColumn(
    column: unknown,
    operation: string,
    distinct: boolean,
  ): unknown {
    return _operationOverAggregateColumn(column, operation, distinct);
  }

  /** @internal */
  private async executeSimpleCalculation(
    operation: string,
    columnName: string,
    distinct: boolean,
  ): Promise<unknown> {
    return _executeSimpleCalculation(this as any, operation, columnName, distinct);
  }

  /** @internal */
  private async executeGroupedCalculation(
    operation: string,
    columnName: string,
    distinct: boolean,
  ): Promise<Record<string, unknown>> {
    return _executeGroupedCalculation(this as any, operation, columnName, distinct);
  }

  /** @internal */
  private typeFor(field: string): unknown {
    return _typeFor(this as any, field);
  }

  /** @internal */
  private lookupCastTypeFromJoinDependencies(name: string): unknown {
    return _lookupCastTypeFromJoinDependencies(this as any, name);
  }

  /** @internal */
  private typeCastPluckValues(result: unknown[][], columns: string[]): unknown[][] {
    return _typeCastPluckValues(result, columns, this as any);
  }

  /** @internal */
  private typeCastCalculatedValue(value: unknown, operation: string, type: unknown): unknown {
    return _typeCastCalculatedValue(value, operation, type);
  }

  /** @internal */
  private selectForCount(): string {
    return _selectForCount(this as any);
  }

  /** @internal */
  private isBuildCountSubquery(operation: string, columnName: string, distinct: boolean): boolean {
    return _isBuildCountSubquery(operation, columnName, distinct);
  }

  /** @internal */
  private buildCountSubquery(columnName: string, distinct: boolean): string {
    return _buildCountSubquery(this as any, columnName, distinct);
  }

  // ---------------------------------------------------------------------------
  // PR 37b — batch privates (delegates to relation/batches.ts)
  // Mirrors: ActiveRecord::Batches private helpers
  // ---------------------------------------------------------------------------

  /** @internal */
  private ensureValidOptionsForBatchingBang(
    cursor: string | string[],
    start: unknown,
    finish: unknown,
    order: "asc" | "desc" | ("asc" | "desc")[],
  ): void {
    _ensureValidOptionsForBatchingBang(cursor, start, finish, order);
  }

  /** @internal */
  private applyLimits(
    cursor: string | string[],
    start: unknown,
    finish: unknown,
    batchOrders: [string, "asc" | "desc"][],
  ): this {
    return _applyLimits(this, cursor, start, finish, batchOrders) as this;
  }

  /** @internal */
  private applyStartLimit(
    cursor: string | string[],
    start: unknown,
    batchOrders: [string, "asc" | "desc"][],
  ): this {
    return _applyStartLimit(this, cursor, start, batchOrders) as this;
  }

  /** @internal */
  private applyFinishLimit(
    cursor: string | string[],
    finish: unknown,
    batchOrders: [string, "asc" | "desc"][],
  ): this {
    return _applyFinishLimit(this, cursor, finish, batchOrders) as this;
  }

  /** @internal */
  private batchCondition(cursor: string | string[], values: unknown, operators: string[]): this {
    return _batchCondition(this, cursor, values, operators) as this;
  }

  /** @internal */
  private buildBatchOrders(
    cursor: string | string[],
    order: "asc" | "desc" | ("asc" | "desc")[] | undefined,
  ): [string, "asc" | "desc"][] {
    return _buildBatchOrders(cursor, order);
  }

  /** @internal */
  private actOnIgnoredOrder(errorOnIgnore: boolean | undefined): void {
    _actOnIgnoredOrder(errorOnIgnore);
  }

  /** @internal */
  private batchOnLoadedRelation(opts: {
    start: unknown;
    finish: unknown;
    cursor: string | string[];
    order: "asc" | "desc" | ("asc" | "desc")[];
    batchLimit: number;
  }): T[][] {
    return _batchOnLoadedRelation({ relation: this, ...opts });
  }

  /** @internal */
  private recordCursorValues(record: T, cursor: string | string[]): unknown[] {
    return _recordCursorValues(record, cursor);
  }

  /** @internal */
  private compareValuesForOrder(
    values1: unknown[],
    values2: unknown[],
    order: ("asc" | "desc")[],
  ): number {
    return _compareValuesForOrder(values1, values2, order);
  }

  /** @internal */
  private batchOnUnloadedRelation(opts: {
    start: unknown;
    finish: unknown;
    cursor: string | string[];
    order: "asc" | "desc" | ("asc" | "desc")[];
    batchLimit: number;
    load?: boolean;
  }): AsyncGenerator<T[]> {
    return _batchOnUnloadedRelation({ relation: this, ...opts });
  }

  // ---------------------------------------------------------------------------
  // PR 37b — explain / async privates
  // Mirrors: ActiveRecord::Explain + ActiveRecord::QueryMethods#async
  // ---------------------------------------------------------------------------

  /** @internal */
  private async collectingQueriesForExplain<R>(
    fn: () => Promise<R>,
  ): Promise<{ value: R; queries: [string, unknown[]][] }> {
    return _collectingQueriesForExplain(fn);
  }

  /** @internal */
  private renderBind(connection: unknown, attr: unknown): [string | null, unknown] {
    return _renderBind(connection, attr);
  }

  /** @internal */
  private async(): Relation<T> {
    return (this.spawn() as any).asyncBang();
  }

  // ---------------------------------------------------------------------------
  // PR 37d — finder privates (delegates to relation/finder-methods.ts + spawn-methods.ts)
  // ---------------------------------------------------------------------------

  /** @internal */
  private constructRelationForExists(conditions: unknown): any {
    return _fm.constructRelationForExists(this as any, conditions);
  }

  /** @internal */
  private applyJoinDependency(eagerLoading: boolean): any {
    return _fm.applyJoinDependency(this as any, eagerLoading);
  }

  /** @internal */
  private isUsingLimitableReflections(reflections: unknown[]): boolean {
    return _fm.isUsingLimitableReflections(reflections);
  }

  /** @internal */
  private async findWithIds(ids: unknown[]): Promise<any> {
    return _fm.findWithIds(this as any, ids);
  }

  /** @internal */
  private async findOne(id: unknown): Promise<any> {
    return _fm.findOne(this as any, id);
  }

  /** @internal */
  private async findSome(ids: unknown[]): Promise<any[]> {
    return _fm.findSome(this as any, ids);
  }

  /** @internal */
  private async findSomeOrdered(ids: unknown[]): Promise<any[]> {
    return _fm.findSomeOrdered(this as any, ids);
  }

  /** @internal */
  private async findTake(): Promise<any | null> {
    return _fm.findTake(this as any);
  }

  /** @internal */
  private async findTakeWithLimit(limit: number): Promise<any[]> {
    return _fm.findTakeWithLimit(this as any, limit);
  }

  /** @internal */
  private findNth(index: number): Promise<any | null> {
    return _fm.findNth(this as any, index);
  }

  /** @internal */
  private findNthWithLimit(index: number, limit: number): Promise<any[]> {
    return _fm.findNthWithLimit.call(this as any, index, limit);
  }

  /** @internal */
  private findNthFromLast(index: number): Promise<any | null> {
    return _fm.findNthFromLast.call(this as any, index);
  }

  /** @internal */
  private async findLast(limit?: number): Promise<any> {
    return _fm.findLast(this as any, limit);
  }

  /** @internal */
  private orderedRelation(): any {
    return _fm.orderedRelation(this as any);
  }

  /** @internal */
  private _orderColumns(): string[] {
    return _fm._orderColumns(this as any);
  }

  /** @internal */
  private relationWith(values: Partial<Relation<T>>): Relation<T> {
    return _sm.relationWith(this as any, values as any);
  }
}

// ---------------------------------------------------------------------------
// Mixin: mirrors Rails' include QueryMethods, FinderMethods, Calculations, SpawnMethods
// ---------------------------------------------------------------------------

export interface Relation<T extends Base> {
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

// QueryMethodBangs doesn't involve T — Included<> works fine.
// Calculations uses the explicit CalculationMethods interface (method-syntax)
// so subclasses (CollectionProxy, AssociationRelation, DJAR) can override
// count/sum/etc. with narrower signatures.
// FinderMethods and SpawnMethods return T-typed values — explicit signatures needed.

export interface Relation<T extends Base>
  extends Included<typeof QueryMethodBangs>, CalculationMethods {
  find(ids: unknown[]): Promise<T[]>;
  find(id: unknown): Promise<T>;
  find(...ids: unknown[]): Promise<T | T[]>;
  findBy(conditions: Record<string, unknown>): Promise<T | null>;
  findByBang(conditions: Record<string, unknown>): Promise<T>;
  findSoleBy(conditions: Record<string, unknown>): Promise<T>;
  first(): Promise<T | null>;
  first(n: number): Promise<T[]>;
  firstBang(): Promise<T>;
  last(): Promise<T | null>;
  last(n: number): Promise<T[]>;
  lastBang(): Promise<T>;
  sole(): Promise<T>;
  take(): Promise<T | null>;
  take(limit: number): Promise<T[]>;
  takeBang(): Promise<T>;
  second(): Promise<T | null>;
  third(): Promise<T | null>;
  fourth(): Promise<T | null>;
  fifth(): Promise<T | null>;
  fortyTwo(): Promise<T | null>;
  secondToLast(): Promise<T | null>;
  thirdToLast(): Promise<T | null>;
  secondBang(): Promise<T>;
  thirdBang(): Promise<T>;
  fourthBang(): Promise<T>;
  fifthBang(): Promise<T>;
  fortyTwoBang(): Promise<T>;
  secondToLastBang(): Promise<T>;
  thirdToLastBang(): Promise<T>;
  findOrCreateByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T>;
  createOrFindByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T>;
  raiseRecordNotFoundExceptionBang(
    message?: string,
    modelName?: string,
    primaryKey?: string,
    id?: unknown,
  ): never;
  spawn(): Relation<T>;
  merge<U extends Base>(other: Relation<U>): Relation<T>;
  mergeBang(other: any): Relation<T>;
}

include(Relation, QueryMethodBangs);
include(Relation, FinderMethods);
include(Relation, Calculations);
include(Relation, SpawnMethods);

// Thenable: make Relation directly awaitable (delegates to toArray).
applyThenable(Relation.prototype);

// Register Relation with Base to break the circular dependency.
_setRelationCtor(Relation as any);
_setScopeProxyWrapper(wrapWithScopeProxy);

/** @internal */
async function computeCacheKey(
  rel: Relation<Base>,
  timestampColumn = "updated_at",
): Promise<string> {
  return rel.computeCacheKey(timestampColumn);
}

/** @internal */
async function computeCacheVersion(
  rel: Relation<Base>,
  timestampColumn = "updated_at",
): Promise<string> {
  return rel.computeCacheVersion(timestampColumn);
}
