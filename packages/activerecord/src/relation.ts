import { getCrypto, Notifications } from "@blazetrails/activesupport";
import {
  Table,
  SelectManager,
  Nodes,
  Visitors,
  UpdateManager,
  DeleteManager,
  sql as arelSql,
} from "@blazetrails/arel";
import type { Base } from "./base.js";
import { _setRelationCtor, _setScopeProxyWrapper, quoteSqlValue } from "./base.js";
import { RecordNotFound } from "./errors.js";
import { modelRegistry } from "./associations.js";
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
  type UnscopeType,
} from "./relation/query-methods.js";
import { Batches } from "./relation/batches.js";
import { wrapWithScopeProxy } from "./relation/delegation.js";
import { InsertAll } from "./insert-all.js";
import { ScopeRegistry } from "./scoping.js";
import { PredicateBuilder } from "./relation/predicate-builder.js";
import { include, type Included } from "@blazetrails/activesupport";
import { Calculations } from "./relation/calculations.js";
import { FinderMethods } from "./relation/finder-methods.js";
import { SpawnMethods } from "./relation/spawn-methods.js";
import { FromClause } from "./relation/from-clause.js";
import { TableMetadata } from "./table-metadata.js";
import { WhereClause, predicatesWithWrappedSqlLiterals } from "./relation/where-clause.js";
import { BatchEnumerator } from "./relation/batches/batch-enumerator.js";
import { touchAttributesWithTime } from "./timestamp.js";
import { ExplainRegistry } from "./explain-registry.js";
import type { DatabaseAdapter } from "./adapter.js";
import { rubyInspectArray } from "./relation/ruby-inspect.js";

/**
 * A Relation returned from `load()` / `reload()` — a normal Relation with
 * `then` stripped so `await rel.load()` resolves to the relation itself
 * rather than being recursively unwrapped through the thenable contract to
 * `T[]`. (Matches `stripThenable` which only shadows `.then`; `.catch` and
 * `.finally` aren't part of `Awaited<>`'s unwrap rules, so they stay.)
 */
export type LoadedRelation<R> = Omit<R, "then">;

/**
 * Relation — the lazy, chainable query interface.
 *
 * Mirrors: ActiveRecord::Relation
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Relation<T extends Base> {
  private _modelClass: typeof Base;
  /** @internal */
  _whereClause: WhereClause = WhereClause.empty();
  private _orderClauses: Array<string | [string, "asc" | "desc"]> = [];
  private _rawOrderClauses: string[] = [];
  private _limitValue: number | null = null;
  private _offsetValue: number | null = null;
  private _selectColumns: (string | Nodes.SqlLiteral)[] | null = null;
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
  private _joinClauses: Array<{ type: "inner" | "left"; table: string; on: string }> = [];
  private _rawJoins: string[] = [];
  private _includesAssociations: string[] = [];
  private _preloadAssociations: string[] = [];
  private _eagerLoadAssociations: string[] = [];
  private _isReadonly = false;
  private _isStrictLoading = false;
  private _annotations: string[] = [];
  private _optimizerHints: string[] = [];
  private _referencesValues: string[] = [];
  private _fromClause: FromClause = FromClause.empty();
  private _createWithAttrs: Record<string, unknown> = {};
  private _extending: Array<Record<string, Function>> = [];
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
   * Add WHERE conditions. Accepts a hash of column/value pairs,
   * or a raw SQL string with optional bind values.
   *
   * Mirrors: ActiveRecord::Relation#where
   *
   * Examples:
   *   where({ name: "dean" })
   *   where("age > ?", 18)
   *   where("name LIKE ?", "%dean%")
   */
  where(): WhereChain<Relation<T>>;
  where(conditions: undefined): WhereChain<Relation<T>>;
  where(conditions: Record<string, unknown> | null): Relation<T>;
  where(sql: string, ...binds: unknown[]): Relation<T>;
  where(node: Nodes.Node): Relation<T>;
  where(
    conditionsOrSql?: Record<string, unknown> | string | Nodes.Node | null,
    ...binds: unknown[]
  ): Relation<T> | WhereChain<Relation<T>> {
    if (conditionsOrSql === undefined) return new WhereChain<Relation<T>>(this._clone());
    return this._clone().whereBang(conditionsOrSql, ...binds);
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
   * Filter for records WHERE the association IS present (non-null FK).
   *
   * Mirrors: ActiveRecord::Relation#where.associated
   */
  whereAssociated(...assocNames: string[]): Relation<T> {
    let rel: Relation<T> = this;
    for (const assocName of assocNames) {
      const modelClass = rel._modelClass as any;
      const associations: any[] = modelClass._associations ?? [];
      const assocDef = associations.find((a: any) => a.name === assocName);

      if (!assocDef) {
        throw new Error(
          `Association named '${assocName}' was not found on ${modelClass.name}; perhaps you misspelled it?`,
        );
      }

      if (assocDef.type === "belongsTo") {
        const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
        rel = rel.whereNot({ [foreignKey]: null });
      } else if (assocDef.type === "hasMany" || assocDef.type === "hasOne") {
        const { targetTable, foreignKey, typeNodes } = this._resolveHasManySubquery(
          modelClass,
          assocDef,
          assocName,
        );
        const sourceTable = modelClass.tableName;
        const pk = (assocDef.options.primaryKey ?? modelClass.primaryKey) as string;
        const srcTable = new Table(sourceTable);
        const tgtTable = new Table(targetTable);
        const subquery = tgtTable.project(tgtTable.get(foreignKey));
        for (const node of typeNodes) subquery.where(node);
        const cloned = rel._clone();
        cloned._whereClause.predicates.push(srcTable.get(pk).in(subquery));
        rel = cloned;
      }
    }
    return rel;
  }

  /**
   * Filter for records WHERE the association IS missing (null FK).
   *
   * Mirrors: ActiveRecord::Relation#where.missing
   */
  whereMissing(...assocNames: string[]): Relation<T> {
    let rel: Relation<T> = this;
    for (const assocName of assocNames) {
      const modelClass = rel._modelClass as any;
      const associations: any[] = modelClass._associations ?? [];
      const assocDef = associations.find((a: any) => a.name === assocName);

      if (!assocDef) {
        throw new Error(
          `Association named '${assocName}' was not found on ${modelClass.name}; perhaps you misspelled it?`,
        );
      }

      if (assocDef.type === "belongsTo") {
        const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
        rel = rel.where({ [foreignKey]: null });
      } else if (assocDef.type === "hasMany" || assocDef.type === "hasOne") {
        const { targetTable, foreignKey, typeNodes } = this._resolveHasManySubquery(
          modelClass,
          assocDef,
          assocName,
        );
        const sourceTable = modelClass.tableName;
        const pk = (assocDef.options.primaryKey ?? modelClass.primaryKey) as string;
        const srcTable = new Table(sourceTable);
        const tgtTable = new Table(targetTable);
        const subquery = tgtTable.project(tgtTable.get(foreignKey));
        for (const node of typeNodes) subquery.where(node);
        const cloned = rel._clone();
        cloned._whereClause.predicates.push(srcTable.get(pk).notIn(subquery));
        rel = cloned;
      }
    }
    return rel;
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
   * Add NOT WHERE conditions. Accepts a hash of column/value pairs.
   *
   * Mirrors: ActiveRecord::Relation#where.not
   */
  whereNot(conditions: Record<string, unknown>): Relation<T> {
    const rel = this._clone();
    const castConditions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(conditions)) {
      castConditions[key] = Array.isArray(value)
        ? value.map((v) => this._castWhereValue(key, v))
        : this._castWhereValue(key, value);
    }
    rel._whereClause.predicates.push(...this.predicateBuilder.buildNegatedFromHash(castConditions));
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
  order(...args: Array<string | Record<string, "asc" | "desc">>): Relation<T> {
    return this._clone().orderBang(...args);
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
  offset(value: number): Relation<T> {
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
  select(...columns: (string | Nodes.SqlLiteral)[]): Relation<T>;
  select(...args: any[]): Relation<T> | Promise<T[]> {
    if (args.length === 1 && typeof args[0] === "function") {
      return this.toArray().then((records) => records.filter(args[0]));
    }
    const columns = args.map((a: any) => (a instanceof Nodes.SqlLiteral ? a : String(a)));
    return this._clone()._selectBang(...columns);
  }

  /**
   * Replace existing select columns.
   *
   * Mirrors: ActiveRecord::Relation#reselect
   */
  reselect(...columns: (string | Nodes.SqlLiteral)[]): Relation<T> {
    return this._clone().reselectBang(...columns);
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
  reorder(...args: Array<string | Record<string, "asc" | "desc">>): Relation<T> {
    return this._clone().reorderBang(...args);
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
  inOrderOf(column: string, values: unknown[]): Relation<T> {
    const rel = this._clone();
    // Generate a CASE WHEN ... expression for ordering
    const cases = values
      .map((v, i) => {
        const quoted =
          v === null
            ? "NULL"
            : typeof v === "number"
              ? String(v)
              : `'${String(v).replace(/'/g, "''")}'`;
        return `WHEN "${column}" = ${quoted} THEN ${i}`;
      })
      .join(" ");
    const caseExpr = `CASE ${cases} ELSE ${values.length} END`;
    // Use raw SQL order — push as a string that the order manager treats as raw
    rel._orderClauses = [];
    rel._rawOrderClauses = rel._rawOrderClauses ?? [];
    rel._rawOrderClauses.push(caseExpr);
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
        c instanceof Nodes.SqlLiteral ? `sql(${JSON.stringify(c.value)})` : JSON.stringify(c),
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

  // merge and spawn are mixed in from spawn-methods.ts

  /**
   * Change the FROM clause (for subqueries or alternate table names).
   *
   * Mirrors: ActiveRecord::Relation#from
   */
  from(source: string | Relation<any>, subqueryName?: string): Relation<T> {
    return this._clone().fromBang(source, subqueryName);
  }

  /**
   * Set default attributes for create operations on this relation.
   *
   * Mirrors: ActiveRecord::Relation#create_with
   */
  createWith(attrs: Record<string, unknown>): Relation<T> {
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
  extending<M extends Record<string, Function>>(mod: M): Relation<T> & M;
  extending<M extends Record<string, Function>>(mod: M | undefined): Relation<T> & Partial<M>;
  extending(fn: (rel: Relation<T>) => void): Relation<T>;
  extending(): Relation<T>;
  extending(
    mod?: Record<string, Function> | ((rel: Relation<T>) => void),
  ): Relation<T> | (Relation<T> & Record<string, Function>) {
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
   * Add an INNER JOIN. Accepts an association name, a raw SQL string, or
   * a table name with an ON condition.
   *
   * Mirrors: ActiveRecord::Relation#joins
   */
  joins(tableOrSql?: string, on?: string): Relation<T> {
    if (!tableOrSql) return this._clone();
    const rel = this._clone();
    if (on) {
      rel._joinClauses.push({ type: "inner", table: tableOrSql, on });
    } else {
      const resolved = rel._resolveAssociationJoin(tableOrSql);
      if (resolved) {
        if (Array.isArray(resolved)) {
          for (const join of resolved) {
            rel._joinClauses.push({ type: "inner", table: join.table, on: join.on });
          }
        } else {
          rel._joinClauses.push({ type: "inner", table: resolved.table, on: resolved.on });
        }
      } else {
        rel._rawJoins.push(tableOrSql);
      }
    }
    return rel;
  }

  /**
   * Add a LEFT OUTER JOIN. Accepts an association name or a table name
   * with an ON condition.
   *
   * Mirrors: ActiveRecord::Relation#left_joins
   */
  leftJoins(table: string, on?: string): Relation<T> {
    const rel = this._clone();
    if (on) {
      rel._joinClauses.push({ type: "left", table, on });
    } else {
      const resolved = rel._resolveAssociationJoin(table);
      if (resolved) {
        if (Array.isArray(resolved)) {
          for (const join of resolved) {
            rel._joinClauses.push({ type: "left", table: join.table, on: join.on });
          }
        } else {
          rel._joinClauses.push({ type: "left", table: resolved.table, on: resolved.on });
        }
      } else {
        rel._joinClauses.push({ type: "left", table, on: "1=1" });
      }
    }
    return rel;
  }

  /**
   * Alias for leftJoins.
   *
   * Mirrors: ActiveRecord::Relation#left_outer_joins
   */
  leftOuterJoins(table?: string, on?: string): Relation<T> {
    if (!table) return this._clone();
    return this.leftJoins(table, on);
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
      const targetPk = assocDef.options.primaryKey ?? targetModel.primaryKey ?? "id";
      let onClause = `"${targetTable}"."${targetPk}" = "${sourceTable}"."${foreignKey}"`;

      // STI type condition on target
      const inheritanceCol = getInheritanceColumn(targetModel);
      if (inheritanceCol && isStiSubclass(targetModel)) {
        const stiNames = [
          targetModel.name,
          ...(targetModel.descendants ?? []).map((d: any) => d.name),
        ];
        const inList = stiNames.map((n: string) => `'${n}'`).join(", ");
        onClause += ` AND "${targetTable}"."${inheritanceCol}" IN (${inList})`;
      }

      return { table: targetTable, on: onClause };
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
      const primaryKey = assocDef.options.primaryKey ?? sourcePk;
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`;
      let onClause = `"${targetTable}"."${foreignKey}" = "${sourceTable}"."${primaryKey}"`;

      // Polymorphic type condition
      if (assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        onClause += ` AND "${targetTable}"."${typeCol}" = '${modelClass.name}'`;
      }

      // STI type condition on target
      const inheritanceCol = getInheritanceColumn(targetModel);
      if (inheritanceCol && isStiSubclass(targetModel)) {
        const stiNames = [
          targetModel.name,
          ...(targetModel.descendants ?? []).map((d: any) => d.name),
        ];
        const inList = stiNames.map((n: string) => `'${n}'`).join(", ");
        onClause += ` AND "${targetTable}"."${inheritanceCol}" IN (${inList})`;
      }

      return { table: targetTable, on: onClause };
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
    let throughOn: string;

    if (throughAssocDef.type === "belongsTo") {
      const throughFk = throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughName)}_id`;
      const throughTargetPk = throughAssocDef.options.primaryKey ?? throughModel.primaryKey ?? "id";
      throughOn = `"${throughTable}"."${throughTargetPk}" = "${sourceTable}"."${throughFk}"`;
    } else {
      // hasMany or hasOne
      const throughPk = throughAssocDef.options.primaryKey ?? sourcePk;
      const throughAsName = throughAssocDef.options.as;
      const throughFk = throughAsName
        ? (throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughAsName)}_id`)
        : (throughAssocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
      throughOn = `"${throughTable}"."${throughFk}" = "${sourceTable}"."${throughPk}"`;
      if (throughAsName) {
        const typeCol = `${_toUnderscore(throughAsName)}_type`;
        throughOn += ` AND "${throughTable}"."${typeCol}" = '${modelClass.name}'`;
      }
    }

    // Resolve the source association on the through model to build the second JOIN
    const sourceName = assocDef.options.source ?? _singularize(assocDef.name);
    const throughModelAssocs: any[] = (throughModel as any)._associations ?? [];
    const sourceAssocDef =
      throughModelAssocs.find((a: any) => a.name === sourceName) ??
      throughModelAssocs.find((a: any) => a.name === _pluralize(sourceName));

    const targetClassName = assocDef.options.className ?? _camelize(_singularize(assocDef.name));
    const targetModel = modelRegistry.get(targetClassName);
    if (!targetModel) return null;
    const targetTable = (targetModel as any).tableName;

    const sourceType = sourceAssocDef?.type ?? "belongsTo";
    let targetOn: string;

    if (sourceType === "belongsTo") {
      const targetFk = sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
      const targetPk = sourceAssocDef?.options?.primaryKey ?? targetModel.primaryKey ?? "id";
      targetOn = `"${targetTable}"."${targetPk}" = "${throughTable}"."${targetFk}"`;
    } else {
      // hasMany or hasOne: target has FK pointing to through
      const sourceAsName = sourceAssocDef?.options?.as;
      const sourceFk = sourceAsName
        ? (sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceAsName)}_id`)
        : (sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`);
      const throughPkCol = throughModel.primaryKey ?? "id";
      targetOn = `"${targetTable}"."${sourceFk}" = "${throughTable}"."${throughPkCol}"`;
      if (sourceAsName) {
        const typeCol = `${_toUnderscore(sourceAsName)}_type`;
        targetOn += ` AND "${targetTable}"."${typeCol}" = '${throughClassName}'`;
      }
    }

    return [
      { table: throughTable, on: throughOn },
      { table: targetTable, on: targetOn },
    ];
  }

  /**
   * Resolve a HABTM association into JOIN clauses through the join table.
   */
  private _resolveHabtmJoin(
    modelClass: any,
    assocDef: any,
  ): Array<{ table: string; on: string }> | null {
    const sourcePkOption = assocDef.options.primaryKey ?? modelClass.primaryKey ?? "id";
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

    // Match defaultJoinTableName from associations.ts:
    // alphabetical sort of pluralize(underscore(ownerName)) and underscore(assocName)
    const ownerKey = _pluralize(_toUnderscore(modelClass.name));
    const assocKey = _toUnderscore(assocDef.name);
    const defaultJoinTable = [ownerKey, assocKey].sort().join("_");
    const joinTable = assocDef.options.joinTable ?? defaultJoinTable;

    const ownerFk: string = fkOption ?? `${_toUnderscore(modelClass.name)}_id`;
    const targetFk = `${_toUnderscore(_singularize(assocDef.name))}_id`;

    return [
      {
        table: joinTable,
        on: `"${joinTable}"."${ownerFk}" = "${sourceTable}"."${sourcePk}"`,
      },
      {
        table: targetTable,
        on: `"${targetTable}"."${targetPk}" = "${joinTable}"."${targetFk}"`,
      },
    ];
  }

  /**
   * Specify associations to be eager loaded (preload strategy).
   *
   * Mirrors: ActiveRecord::Relation#includes
   */
  includes(...associations: string[]): Relation<T> {
    return this._clone().includesBang(...associations);
  }

  /**
   * Specify associations to be preloaded with separate queries.
   *
   * Mirrors: ActiveRecord::Relation#preload
   */
  preload(...associations: string[]): Relation<T> {
    return this._clone().preloadBang(...associations);
  }

  /**
   * Specify associations to be eager loaded.
   *
   * Mirrors: ActiveRecord::Relation#eager_load
   */
  eagerLoad(...associations: string[]): Relation<T> {
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
  build(attrs: Record<string, unknown> = {}): T {
    const scopeAttrs = this._scopeAttributes();
    return new this._modelClass({ ...scopeAttrs, ...attrs }) as T;
  }

  /**
   * Create and persist a new record with the relation's scoped conditions.
   *
   * Mirrors: ActiveRecord::Relation#create
   */
  async create(attrs: Record<string, unknown> = {}): Promise<T> {
    const scopeAttrs = this._scopeAttributes();
    return this._modelClass.create({ ...scopeAttrs, ...attrs }) as Promise<T>;
  }

  /**
   * Create and persist a new record, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#create!
   */
  async createBang(attrs: Record<string, unknown> = {}): Promise<T> {
    const scopeAttrs = this._scopeAttributes();
    return this._modelClass.createBang({ ...scopeAttrs, ...attrs }) as Promise<T>;
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
    const c = await this.count();
    return (c as number) > 1;
  }

  /**
   * Check if there is exactly one matching record.
   *
   * Mirrors: ActiveRecord::Relation#one?
   */
  async isOne(): Promise<boolean> {
    if (this._loaded) return this._records.length === 1;
    const c = await this.count();
    return (c as number) === 1;
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
    } else {
      const sql = this._toSql();
      const result = await this._modelClass.adapter.selectAll(sql, "Load");
      if (token !== this._loadToken) return [];
      const rows = result.toArray();
      loadedRecords = this._instrumentInstantiation(rows);
      this._records = loadedRecords;
    }
    this._loaded = true;

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
   * promoted to eager_load. See `references_eager_loaded_tables?`
   * in Rails relation.rb — the check is boolean, not per-association.
   */
  private _includesToPromoteFromReferences(): string[] {
    if (this._referencesValues.length === 0) return [];
    if (this._includesAssociations.length === 0) return [];

    const joinedTables = new Set(
      this._joinClauses
        .map((j) => j.table.toLowerCase())
        .concat([
          String(
            (this._modelClass as unknown as { tableName?: string }).tableName ?? "",
          ).toLowerCase(),
        ]),
    );
    const refs = this._referencesValues.map((t) => t.toLowerCase());
    const hasUnjoined = refs.some((ref) => !joinedTables.has(ref));
    if (!hasUnjoined) return [];

    const alreadyEagerLoaded = new Set(this._eagerLoadAssociations);
    return this._includesAssociations.filter((name) => !alreadyEagerLoaded.has(name));
  }

  private async _executeEagerLoad(eagerAssocs?: string[]): Promise<void> {
    const eagerAssociations = eagerAssocs ?? this._eagerLoadAssociations;
    const basePk = (this._modelClass as any).primaryKey ?? "id";
    if (
      Array.isArray(basePk) ||
      this._ctes.length > 0 ||
      this._setOperation ||
      !this._fromClause.isEmpty()
    ) {
      const sql = this._toSql();
      const result = await this._modelClass.adapter.selectAll(sql, "Eager Load");
      this._records = this._instrumentInstantiation(result.toArray());
      await this._preloadAssociationsForRecords(this._records, eagerAssociations);
      return;
    }

    const { JoinDependency } = await import("./associations/join-dependency.js");
    const jd = new JoinDependency(this._modelClass);

    const fallbackAssocs: string[] = [];
    for (const assocName of eagerAssociations) {
      if (assocName.includes(".")) {
        // Nested paths fall back to preload until per-level grouping is implemented
        fallbackAssocs.push(assocName);
        continue;
      }
      const node = jd.addAssociation(assocName);
      if (!node) fallbackAssocs.push(assocName);
    }

    // If no associations could be JOINed, fall back entirely to preload
    if (jd.nodes.length === 0) {
      const sql = this._toSql();
      const rows = await this._modelClass.adapter.execute(sql);
      this._records = this._instrumentInstantiation(rows);
      if (fallbackAssocs.length > 0) {
        await this._preloadAssociationsForRecords(this._records, fallbackAssocs);
      }
      return;
    }

    const table = this._modelClass.arelTable;
    const manager = table.project(new Nodes.SqlLiteral(jd.buildSelectSql()));

    // Apply JoinDependency's LEFT OUTER JOINs
    for (const node of jd.nodes) {
      (manager as any).core.source.right.push(
        new Nodes.StringJoin(new Nodes.SqlLiteral(node.joinSql)),
      );
    }

    // Apply relation's existing joins, WHERE, ORDER, LIMIT, OFFSET, etc.
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    this._applyOrderToManager(manager, table);

    if (this._isDistinct) manager.distinct();
    for (const col of this._groupColumns) manager.group(col);
    if (!this._havingClause.isEmpty()) manager.having(this._havingClause.ast);
    if (this._lockValue) manager.lock(this._lockValue);

    // When LIMIT/OFFSET is present, use a subquery for parent IDs to avoid
    // JOIN fan-out changing the number of parent records returned.
    if (this._limitValue !== null || this._offsetValue !== null) {
      const tableName = (this._modelClass as any).tableName;
      const idSubquery = table.project(`"${tableName}"."${basePk}"`);
      (idSubquery as any).distinct();
      for (const node of jd.nodes) {
        (idSubquery as any).core.source.right.push(
          new Nodes.StringJoin(new Nodes.SqlLiteral(node.joinSql)),
        );
      }
      this._applyJoinsToManager(idSubquery as any);
      this._applyWheresToManager(idSubquery as any, table);
      this._applyOrderToManager(idSubquery as any, table);
      if (this._limitValue !== null) (idSubquery as any).take(this._limitValue);
      if (this._offsetValue !== null) (idSubquery as any).skip(this._offsetValue);
      manager.where(
        new Nodes.SqlLiteral(`"${tableName}"."${basePk}" IN (${(idSubquery as any).toSql()})`),
      );
    } else {
      if (this._limitValue !== null) manager.take(this._limitValue);
      if (this._offsetValue !== null) manager.skip(this._offsetValue);
    }

    if (this._optimizerHints.length > 0) {
      manager.optimizerHints(...this._optimizerHints);
    }
    let sql = manager.toSql();
    if (this._annotations.length > 0) {
      const comments = this._annotations.map((c) => `/* ${c} */`).join(" ");
      sql = `${sql} ${comments}`;
    }

    const rows = await this._modelClass.adapter.execute(sql);

    const { parents, associations } = jd.instantiateFromRows(rows);

    const inverseMap = new Map<string, string | undefined>();
    const modelAssocs: any[] = (this._modelClass as any)._associations ?? [];
    for (const assoc of modelAssocs) {
      inverseMap.set(assoc.name, assoc.options?.inverseOf);
    }

    for (const parent of parents) {
      if (!(parent as any)._preloadedAssociations) {
        (parent as any)._preloadedAssociations = new Map();
      }
      const pk = parent.readAttribute(basePk);
      const assocs = associations.get(pk);
      for (const node of jd.nodes) {
        // Skip intermediate through nodes (used only for JOIN chain)
        if (node.immediateAssocName.startsWith("_through_")) continue;
        const children = assocs?.get(node.assocName) ?? [];
        const isSingular = node.assocType === "hasOne" || node.assocType === "belongsTo";
        if (isSingular) {
          (parent as any)._preloadedAssociations.set(node.immediateAssocName, children[0] ?? null);
        } else {
          (parent as any)._preloadedAssociations.set(node.immediateAssocName, children);
        }

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
   * `options` mirrors Rails' variadic symbols (e.g. `explain("analyze",
   * "verbose")` → `EXPLAIN (ANALYZE, VERBOSE) ...`) and is forwarded to
   * the adapter's `buildExplainClause` / `explain` implementations.
   *
   * Mirrors: ActiveRecord::Relation#explain
   */
  async explain(...options: string[]): Promise<string> {
    const { queries } = await ExplainRegistry.collectingQueries(() => this.toArray());
    return this._execExplain(queries, options);
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
  async _execExplain(queries: [string, unknown[]][], options: string[] = []): Promise<string> {
    const adapter = this._modelClass.adapter;
    if (typeof adapter?.explain !== "function") {
      return "EXPLAIN not supported by this adapter";
    }
    // If no queries were collected (e.g. the relation was already
    // loaded, or `.none()` short-circuited), fall back to explaining
    // `toSql()` directly so `Relation#explain` never returns a blank
    // string. Matches Rails' behavior of always producing output even
    // for degenerate cases.
    const effective: [string, unknown[]][] = queries.length > 0 ? queries : [[this._toSql(), []]];
    const clause = this._buildExplainClause(adapter, options);
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
        // Match the "throw loudly" contract the SchemaAdapter /
        // QueryCacheAdapter wrappers use — a silent fallback would
        // make EXPLAIN output depend on whether the adapter
        // happens to implement `typeCast`, and nothing we ship does
        // without it.
        throw new Error(
          `Relation#explain: adapter ${this._modelClass.adapter.adapterName} does not implement typeCast()`,
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
    // Dates CAN slip past typeCast if an adapter returns them
    // unchanged (e.g. a future adapter that skips Date formatting).
    // Coerce to ISO-ish string so rubyInspect renders
    // `"2026-01-02T12:34:56.000Z"` rather than `"[object Date]"`
    // via JSON.stringify (which would double-quote the date).
    if (value instanceof Date) return value.toISOString();
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
  private _buildExplainClause(adapter: DatabaseAdapter, options: string[]): string {
    if (typeof adapter.buildExplainClause === "function") {
      return adapter.buildExplainClause(options);
    }
    if (options.length === 0) return "EXPLAIN for:";
    const parts = options.map((o) => o.toUpperCase()).join(", ");
    return `EXPLAIN (${parts}) for:`;
  }

  // count, sum, average, minimum, maximum are mixed in via
  // interface merge + prototype assignment (see bottom of file)

  private _applyJoinsToManager(manager: SelectManager): void {
    for (const join of this._joinClauses) {
      const onNode = new Nodes.SqlLiteral(join.on);
      if (join.type === "inner") {
        manager.join(join.table, onNode);
      } else {
        manager.outerJoin(join.table, onNode);
      }
    }
    for (const rawJoin of this._rawJoins) {
      (manager as any).core.source.right.push(new Nodes.StringJoin(new Nodes.SqlLiteral(rawJoin)));
    }
  }

  /**
   * Check if any records exist, optionally with conditions.
   *
   * Mirrors: ActiveRecord::Relation#exists?
   */
  async exists(conditions?: Record<string, unknown> | unknown): Promise<boolean> {
    if (this._isNone) return false;
    let rel: Relation<T> = this;
    if (conditions !== undefined) {
      if (typeof conditions === "object" && conditions !== null && !Array.isArray(conditions)) {
        rel = this.where(conditions as Record<string, unknown>);
      } else {
        // Primary key lookup
        rel = this.where({ [this._modelClass.primaryKey as string]: conditions });
      }
    }
    const c = await rel.count();
    return (c as number) > 0;
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
  async calculate(operation: "sum", column: string): Promise<number | Record<string, number>>;
  async calculate(
    operation: "average",
    column: string,
  ): Promise<number | null | Record<string, number>>;
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

    const table = this._modelClass.arelTable;
    const projections = columns.map((c) => (typeof c === "string" ? table.get(c) : c));
    // Extract column names for result mapping
    const columnNames = columns.map((c) => {
      if (typeof c === "string") return c;
      if (c instanceof Nodes.Attribute) return c.name;
      // For functions/literals, use the SQL representation
      return null;
    });
    const manager = table.project(...projections);
    this._applyWheresToManager(manager, table);
    this._applyOrderToManager(manager, table);

    if (this._isDistinct) manager.distinct();
    if (this._limitValue !== null) manager.take(this._limitValue);
    if (this._offsetValue !== null) manager.skip(this._offsetValue);

    const sql = manager.toSql();
    const rows = await this._modelClass.adapter.execute(sql);

    if (columns.length === 1) {
      const name = columnNames[0];
      if (name) {
        return rows.map((row) => row[name]);
      }
      // For expressions, return the first column value from each row
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
        return [table.get(key), isArray ? arelSql(quoteSqlValue(val, true)) : val];
      },
    );
    const um = new UpdateManager().table(table).set(updateValues);
    for (const cond of this._buildWhereStrings(table)) {
      um.where(arelSql(cond));
    }

    return this._modelClass.adapter.execUpdate(um.toSql(), "Update All");
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
    for (const cond of this._buildWhereStrings(table)) {
      dm.where(arelSql(cond));
    }

    return this._modelClass.adapter.execDelete(dm.toSql(), "Delete All");
  }

  /**
   * Touch all matching records (update timestamps without callbacks).
   *
   * Mirrors: ActiveRecord::Relation#touch_all
   */
  async touchAll(...names: string[]): Promise<number> {
    if (this._isNone) return 0;

    const now = new Date();
    const updates: Record<string, unknown> = {};

    // Always touch updated_at if defined on the model
    if (this._modelClass._attributeDefinitions.has("updated_at")) {
      updates.updated_at = `'${now.toISOString()}'`;
    }
    for (const name of names) {
      updates[name] = `'${now.toISOString()}'`;
    }

    if (Object.keys(updates).length === 0) return 0;

    const table = this._modelClass.arelTable;
    const updateValues: [InstanceType<typeof Nodes.Node>, unknown][] = Object.entries(updates).map(
      ([key, val]) => [table.get(key), arelSql(val as string)],
    );
    const um = new UpdateManager().table(table).set(updateValues);
    for (const cond of this._buildWhereStrings(table)) {
      um.where(arelSql(cond));
    }

    return this._modelClass.adapter.executeMutation(um.toSql());
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
    return this._modelClass.create({
      ...this._createWithAttrs,
      ...this._scopeAttributes(),
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
    return new (this._modelClass as any)({
      ...this._scopeAttributes(),
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
    try {
      return (await this._modelClass.create({
        ...this._createWithAttrs,
        ...this._scopeAttributes(),
        ...conditions,
        ...extra,
      })) as T;
    } catch {
      const records = await this.where(conditions).limit(1).toArray();
      if (records.length > 0) return records[0];
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
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
    return new (this._modelClass as any)({ ...this._scopeAttributes(), ...extra }) as T;
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
    return this._scopeAttributes();
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
  get selectValues(): (string | Nodes.SqlLiteral)[] {
    return this._selectColumns ?? [];
  }

  /**
   * Return the ORDER clauses.
   *
   * Mirrors: ActiveRecord::Relation#order_values
   */
  get orderValues(): Array<string | [string, "asc" | "desc"]> {
    return [...this._orderClauses];
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
    const h = this._whereClause.toH(this._modelClass.tableName);
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(h)) {
      if (value !== null && !Array.isArray(value) && !(value instanceof Range)) {
        attrs[key] = value;
      }
    }
    return attrs;
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
  }: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc";
  } = {}): AsyncGenerator<T[]> {
    let currentOffset = this._offsetValue ?? 0;
    const pk = this._modelClass.primaryKey;
    if (Array.isArray(pk)) {
      throw new Error("findInBatches does not support composite primary keys");
    }

    while (true) {
      const rel = this._clone();
      rel._limitValue = batchSize;
      rel._offsetValue = currentOffset;
      rel._loaded = false;

      // Ensure deterministic ordering; support custom order direction (Rails 7.1)
      if (rel._orderClauses.length === 0) {
        rel._orderClauses.push(order ? [pk, order] : pk);
      }

      // Apply start/finish range constraints
      const pkAttr = this._modelClass.arelTable.get(pk);
      if (start !== undefined) {
        rel._whereClause.predicates.push(pkAttr.gteq(start));
      }
      if (finish !== undefined) {
        rel._whereClause.predicates.push(pkAttr.lteq(finish));
      }

      const batch = await rel.toArray();
      if (batch.length === 0) break;

      yield batch;

      if (batch.length < batchSize) break;
      currentOffset += batchSize;
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
  }: {
    batchSize?: number;
    start?: unknown;
    finish?: unknown;
    order?: "asc" | "desc";
  } = {}): AsyncGenerator<T> {
    for await (const batch of this.findInBatches({ batchSize, start, finish, order })) {
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
  }: { batchSize?: number } = {}): BatchEnumerator<LoadedRelation<Relation<T>>> {
    const self = this;
    const pk = this._modelClass.primaryKey;
    if (Array.isArray(pk)) {
      throw new Error("inBatches does not support composite primary keys");
    }
    return new BatchEnumerator(
      async function* () {
        let lastId: unknown = null;

        while (true) {
          const rel = self._clone();
          if (lastId !== null) {
            rel._whereClause.predicates.push(self._modelClass.arelTable.get(pk).gt(lastId));
          }
          rel._orderClauses = [pk];
          rel._limitValue = batchSize;
          rel._selectColumns = [pk];

          const records = await rel.toArray();
          if (records.length === 0) break;

          const ids = records.map((r) => (r as any).readAttribute(pk));
          const batchRel = self._clone();
          batchRel._whereClause.predicates.push(
            ...self.predicateBuilder.buildFromHash({ [pk]: ids }),
          );
          yield stripThenable(batchRel);

          if (records.length < batchSize) break;
          lastId = (records[records.length - 1] as any).readAttribute(pk);
        }
      } as () => AsyncGenerator<LoadedRelation<Relation<T>>>,
      batchSize,
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
      return this._selectColumns.map((c) => {
        if (c instanceof Nodes.SqlLiteral) return c;
        if (/[(*\s]/.test(c)) return new Nodes.SqlLiteral(c);
        return table.get(c);
      });
    }
    if (this._modelClass.ignoredColumns.length > 0) {
      let cols = this._modelClass.columnNames();
      const pk = this._modelClass.primaryKey;
      if (typeof pk === "string" && !cols.includes(pk)) {
        cols = [pk, ...cols];
      }
      return cols.length > 0 ? cols.map((c) => table.get(c)) : ["*"];
    }
    return ["*"];
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
      manager.group(col);
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
    // Set operations: generate both sides and combine
    if (this._setOperation) {
      const leftSql = this._toSqlWithoutSetOp();
      const rightSql = this._setOperation.other._toSqlWithoutSetOp();
      const op = {
        union: "UNION",
        unionAll: "UNION ALL",
        intersect: "INTERSECT",
        except: "EXCEPT",
      }[this._setOperation.type];
      return `(${leftSql}) ${op} (${rightSql})`;
    }
    return this._toSqlWithoutSetOp();
  }

  private _toSqlWithoutSetOp(): string {
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
      manager.group(col);
    }

    if (!this._havingClause.isEmpty()) manager.having(this._havingClause.ast);

    if (this._lockValue) {
      manager.lock(this._lockValue);
    }

    if (this._optimizerHints.length > 0) {
      manager.optimizerHints(...this._optimizerHints);
    }

    let sql = manager.toSql();

    // Replace FROM clause if from() was used
    if (!this._fromClause.isEmpty()) {
      const raw = this._fromClause.value;
      const alias = this._fromClause.name;
      let fromExpr: string;
      if (raw instanceof Relation) {
        const subSql = raw.toSql();
        const name = alias ?? "subquery";
        fromExpr = `(${subSql}) "${name.replace(/"/g, '""')}"`;
      } else if (alias) {
        fromExpr = `${raw} "${alias.replace(/"/g, '""')}"`;
      } else {
        fromExpr = raw;
      }
      sql = sql.replace(/FROM\s+"[^"]+"/, `FROM ${fromExpr}`);
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

  private _compileArelNode(node: Nodes.Node): string {
    return new Visitors.ToSql().compile(node);
  }

  private _applyOrderToManager(manager: SelectManager, table: Table): void {
    // Raw order clauses (from inOrderOf)
    for (const rawClause of this._rawOrderClauses) {
      manager.order(new Nodes.SqlLiteral(rawClause));
    }
    for (const clause of this._orderClauses) {
      if (typeof clause === "string") {
        // Detect SQL expressions (functions, parens, operators) and pass as raw SQL
        if (clause.includes("(") || /\bcase\b/i.test(clause) || clause.includes("||")) {
          manager.order(new Nodes.SqlLiteral(clause));
        } else {
          // Parse "column ASC/DESC" or "table.column ASC/DESC" strings
          const match = clause.match(/^([\w.]+)\s+(ASC|DESC)$/i);
          if (match) {
            // Strip table prefix if present (e.g. "posts.score" → "score")
            const rawCol = match[1];
            const col = rawCol.includes(".") ? rawCol.split(".").pop()! : rawCol;
            const dir = match[2].toUpperCase();
            manager.order(dir === "DESC" ? table.get(col).desc() : table.get(col).asc());
          } else {
            // Strip table prefix if present
            const col = clause.includes(".") ? clause.split(".").pop()! : clause;
            manager.order(table.get(col).asc());
          }
        }
      } else {
        const [col, dir] = clause;
        manager.order(dir === "desc" ? table.get(col).desc() : table.get(col).asc());
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

  private _buildWhereStrings(_table: Table): string[] {
    const normalized = predicatesWithWrappedSqlLiterals(this._whereClause.predicates);
    return normalized.map((node) => `(${this._compileArelNode(node)})`);
  }

  private async _preloadAssociationsForRecords(records: T[], assocNames: string[]): Promise<void> {
    if (assocNames.length === 0) return;
    const { Preloader } = await import("./associations/preloader.js");
    const preloader = new Preloader({
      records: records as unknown as import("./base.js").Base[],
      associations: assocNames,
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
  with(...ctes: Array<Record<string, Relation<any> | string>>): Relation<T> {
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
  new(attrs: Record<string, unknown> = {}): T {
    return this.build(attrs);
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
  async insertBang(attrs: Record<string, unknown>): Promise<number> {
    return this.insertAll([attrs]);
  }

  /**
   * Insert multiple records, raising on failure.
   *
   * Mirrors: ActiveRecord::Base.insert_all!
   */
  async insertAllBang(records: Record<string, unknown>[]): Promise<number> {
    return this.insertAll(records);
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

    const table = this._modelClass.arelTable;
    const updates: Record<string, unknown> = {};

    // Mirrors Rails' `_increment_attribute` — wrap the column in a COALESCE
    // (treating NULL as 0) and then add/subtract the binding. Rails uses
    // `Subtraction` for negative values and `Addition` for positive ones so
    // the generated SQL reads `col - 3` rather than `col + -3`.
    for (const [counterName, value] of Object.entries(counters)) {
      const unqual = new Nodes.UnqualifiedColumn(table.get(counterName));
      const coalesced = new Nodes.NamedFunction("COALESCE", [unqual, new Nodes.Quoted(0)]);
      const bind = new Nodes.Quoted(Math.abs(value));
      updates[counterName] =
        value < 0 ? new Nodes.Subtraction(coalesced, bind) : new Nodes.Addition(coalesced, bind);
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
    if (modelPb && typeof modelPb.with === "function") {
      const metadata = new TableMetadata(this._modelClass, this.table);
      pb = modelPb.with(metadata);
    } else {
      pb = new PredicateBuilder(this.table);
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
    return this._includesAssociations.filter((assoc) =>
      this._joinClauses.some((j) => j.table === assoc),
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
      this._rawJoins.length === 0 &&
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

  preloadAssociations(): string[] {
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

  cacheKey(): string {
    return this.computeCacheKey();
  }

  computeCacheKey(): string {
    const tableName = this._modelClass.tableName;
    const sql = this.toSql();
    const digest = getCrypto().createHash("md5").update(sql).digest("hex");
    return `${tableName}/query-${digest}`;
  }

  async cacheVersion(): Promise<string> {
    return this.computeCacheVersion();
  }

  async computeCacheVersion(timestampColumn: string = "updated_at"): Promise<string> {
    let size = 0;
    let timestamp: unknown = null;

    if (this._loaded) {
      size = this._records.length;
      if (size > 0) {
        timestamp = this._records
          .map((r) => (r as any).readAttribute(timestampColumn))
          .reduce((max: unknown, val: unknown) => {
            if (max == null) return val;
            if (val == null) return max;
            return val > max ? val : max;
          }, null);
      }
    } else {
      try {
        const collection: Relation<T> = this;
        const column = this.table.get(timestampColumn);
        const columnSql = this._compileArelNode(column);
        const selectTemplate = `COUNT(*) AS "size", MAX(%s) AS "timestamp"`;

        if (this._limitValue !== null || (this._offsetValue ?? 0) > 0) {
          // Has limit/offset — wrap in a subquery like Rails' build_subquery
          const subqueryAlias = "subquery_for_cache_key";
          const inner = collection._clone();
          inner._selectColumns = [`${columnSql} AS collection_cache_key_timestamp`];
          if (this._isDistinct && (!this._selectColumns || this._selectColumns.length === 0)) {
            inner._selectColumns = [
              this._compileArelNode(this.table.star),
              ...inner._selectColumns!,
            ];
          }
          const innerSql = inner.toSql();
          const subqueryColumn = `"${subqueryAlias}"."collection_cache_key_timestamp"`;
          const sql = `SELECT ${selectTemplate.replace("%s", subqueryColumn)} FROM (${innerSql}) AS "${subqueryAlias}"`;
          const rows = await this._modelClass.adapter.execute(sql);
          size = Number(rows[0]?.size ?? 0);
          timestamp = rows[0]?.timestamp;
        } else {
          // No limit/offset — single query with COUNT + MAX
          const query = collection._clone();
          query._orderClauses = [];
          query._rawOrderClauses = [];
          query._selectColumns = [selectTemplate.replace("%s", columnSql)];
          const rows = await this._modelClass.adapter.execute(query.toSql());
          size = Number(rows[0]?.size ?? 0);
          timestamp = rows[0]?.timestamp;
        }
      } catch {
        // Timestamp column doesn't exist — compute count-only
        try {
          const query = this._clone();
          query._orderClauses = [];
          query._rawOrderClauses = [];
          query._selectColumns = [`COUNT(*) AS "size"`];
          const rows = await this._modelClass.adapter.execute(query.toSql());
          size = Number(rows[0]?.size ?? 0);
        } catch {
          // Fall through with size = 0
        }
      }
    }

    if (timestamp != null) {
      let ts: Date | null = null;
      if (timestamp instanceof Date) {
        ts = timestamp;
      } else if (typeof timestamp === "string") {
        // Normalize timezone-less timestamps (e.g., SQLite "YYYY-MM-DD HH:MM:SS") to UTC
        const bare = timestamp.trim();
        const m = bare.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
        ts = m ? new Date(`${m[1]}T${m[2]}Z`) : new Date(bare);
      } else if (typeof timestamp === "number") {
        ts = new Date(timestamp);
      }
      if (ts && !isNaN(ts.getTime())) {
        return `${size}-${ts.toISOString().replace(/\.\d{3}Z$/, "Z")}`;
      }
      return `${size}-${String(timestamp)}`;
    }
    return `${size}`;
  }

  async cacheKeyWithVersion(): Promise<string> {
    const key = this.cacheKey();
    const version = await this.cacheVersion();
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
    this._rawJoins = [...source._rawJoins];
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

// QueryMethodBangs and Calculations don't involve T — Included<> works fine.
// FinderMethods and SpawnMethods return T-typed values — explicit signatures needed.

export interface Relation<T extends Base>
  extends Included<typeof QueryMethodBangs>, Included<typeof Calculations> {}
export interface Relation<T extends Base> {
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
