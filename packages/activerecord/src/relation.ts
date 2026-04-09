import { getCrypto } from "@blazetrails/activesupport";
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
import { WhereChain, QueryMethodBangs } from "./relation/query-methods.js";
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
  private _orRelations: Relation<T>[] = [];
  private _havingClauses: string[] = [];
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
  private _fromClause: FromClause = FromClause.empty();
  private _createWithAttrs: Record<string, unknown> = {};
  private _extending: Array<Record<string, Function>> = [];
  private _ctes: Array<{ name: string; sql: string; recursive: boolean }> = [];
  private _skipPreloading = false;
  private _skipQueryCache = false;
  private _loaded = false;
  private _records: T[] = [];

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
    if (conditionsOrSql === null) return this._clone();

    // Arel node: store directly, bypass string/hash processing
    if (conditionsOrSql instanceof Nodes.Node) {
      const rel = this._clone();
      rel._whereClause.predicates.push(conditionsOrSql);
      return rel;
    }

    if (
      typeof conditionsOrSql !== "string" &&
      (typeof conditionsOrSql !== "object" || Array.isArray(conditionsOrSql))
    ) {
      const err = new Error(
        `Unsupported argument type: ${typeof conditionsOrSql} (${String(conditionsOrSql)})`,
      );
      err.name = "ArgumentError";
      throw err;
    }
    const rel = this._clone();
    if (typeof conditionsOrSql === "string") {
      let sql = conditionsOrSql;

      // Check for named binds: where("age > :min AND age < :max", { min: 18, max: 65 })
      if (
        binds.length === 1 &&
        typeof binds[0] === "object" &&
        binds[0] !== null &&
        !Array.isArray(binds[0])
      ) {
        const namedBinds = binds[0] as Record<string, unknown>;
        for (const [name, value] of Object.entries(namedBinds)) {
          const replacement =
            value === null
              ? "NULL"
              : typeof value === "number"
                ? String(value)
                : typeof value === "boolean"
                  ? value
                    ? "TRUE"
                    : "FALSE"
                  : `'${String(value).replace(/'/g, "''")}'`;
          sql = sql.replace(new RegExp(`:${name}\\b`, "g"), replacement);
        }
      } else {
        // Positional ? placeholders
        for (const bind of binds) {
          const replacement =
            bind === null
              ? "NULL"
              : typeof bind === "number"
                ? String(bind)
                : typeof bind === "boolean"
                  ? bind
                    ? "TRUE"
                    : "FALSE"
                  : `'${String(bind).replace(/'/g, "''")}'`;
          sql = sql.replace("?", replacement);
        }
      }
      if (sql.trim()) rel._whereClause.predicates.push(new Nodes.SqlLiteral(sql));
    } else {
      const castConditions: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(conditionsOrSql)) {
        // Relation subquery values pass through to PredicateBuilder's RelationHandler
        if (value instanceof Relation) {
          castConditions[key] = value;
        } else {
          castConditions[key] = Array.isArray(value)
            ? value.map((v) => this._castWhereValue(key, v))
            : this._castWhereValue(key, value);
        }
      }
      rel._whereClause.predicates.push(...this.predicateBuilder.buildFromHash(castConditions));
    }
    return rel;
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
    // Build a chain: where(cond1).or(where(cond2)).or(where(cond3))...
    const makeRel = (cond: Record<string, unknown>) => {
      const r = this._clone();
      const cast: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(cond)) {
        cast[key] =
          value instanceof Relation
            ? value
            : Array.isArray(value)
              ? value.map((v) => this._castWhereValue(key, v))
              : this._castWhereValue(key, value);
      }
      r._whereClause = new WhereClause(this.predicateBuilder.buildFromHash(cast));
      r._orRelations = [];
      return r;
    };
    let combined = makeRel(conditions[0]);
    for (let i = 1; i < conditions.length; i++) {
      combined = combined.or(makeRel(conditions[i]));
    }
    const rel = this._clone();
    rel._whereClause = combined._whereClause;
    rel._orRelations = [...rel._orRelations, ...combined._orRelations];
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
    return this._clone().reselectBang(...columns);
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
   * Add HAVING clause. Accepts raw SQL string or hash form.
   *
   * Mirrors: ActiveRecord::Relation#having
   */
  having(condition: string | Record<string, unknown>): Relation<T> {
    return this._clone().havingBang(condition);
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
  unscope(
    ...types: Array<
      | "where"
      | "order"
      | "limit"
      | "offset"
      | "group"
      | "having"
      | "select"
      | "distinct"
      | "lock"
      | "readonly"
      | "from"
    >
  ): Relation<T> {
    return this._clone().unscopeBang(...types);
  }

  /**
   * Keep only the specified query parts and remove everything else.
   *
   * Mirrors: ActiveRecord::SpawnMethods#only
   */
  only(
    ...types: Array<
      | "where"
      | "order"
      | "limit"
      | "offset"
      | "group"
      | "having"
      | "select"
      | "distinct"
      | "lock"
      | "readonly"
      | "from"
    >
  ): Relation<T> {
    const allTypes: Array<
      | "where"
      | "order"
      | "limit"
      | "offset"
      | "group"
      | "having"
      | "select"
      | "distinct"
      | "lock"
      | "readonly"
      | "from"
    > = [
      "where",
      "order",
      "limit",
      "offset",
      "group",
      "having",
      "select",
      "distinct",
      "lock",
      "readonly",
      "from",
    ];
    const toRemove = allTypes.filter((t) => !types.includes(t));
    return this.unscope(...toRemove);
  }

  /**
   * Add custom methods to this relation instance.
   * Accepts an object with methods, or a function that receives the relation.
   *
   * Mirrors: ActiveRecord::Relation#extending
   */
  extending(mod?: Record<string, Function> | ((rel: Relation<T>) => void)): Relation<T> {
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
    return this;
  }

  /**
   * Reset and reload the relation.
   *
   * Mirrors: ActiveRecord::Relation#reload
   */
  async reload(): Promise<this> {
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
    // Start loading in background; result is cached when accessed
    this.toArray().then((records) => {
      this._loaded = true;
      this._records = records;
    });
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
  async presence(): Promise<Relation<T> | null> {
    return (await this.isAny()) ? stripThenable(this as Relation<T>) : null;
  }

  /**
   * Check if another relation is structurally compatible for use with or().
   *
   * Mirrors: ActiveRecord::Relation#structurally_compatible?
   */
  structurallyCompatible(other: Relation<T>): boolean {
    return this._modelClass === other._modelClass;
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
  async load(): Promise<this> {
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

    // Eager load via single JOIN query when eager_load associations are specified
    if (this._eagerLoadAssociations.length > 0) {
      await this._executeEagerLoad();
    } else {
      const sql = this._toSql();
      const rows = await this._modelClass.adapter.selectAll(sql, "Load");
      this._records = rows.map((row) => this._modelClass._instantiate(row) as T);
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

    // Preload associations via separate queries (includes + preload)
    const preloadAssocs = [...this._includesAssociations, ...this._preloadAssociations];
    if (preloadAssocs.length > 0 && this._records.length > 0) {
      await this._preloadAssociationsForRecords(this._records, preloadAssocs);
    }

    return [...this._records];
  }

  private async _executeEagerLoad(): Promise<void> {
    const basePk = (this._modelClass as any).primaryKey ?? "id";
    if (
      Array.isArray(basePk) ||
      this._ctes.length > 0 ||
      this._setOperation ||
      !this._fromClause.isEmpty()
    ) {
      const sql = this._toSql();
      const rows = await this._modelClass.adapter.selectAll(sql, "Eager Load");
      this._records = rows.map((row) => this._modelClass._instantiate(row) as T);
      await this._preloadAssociationsForRecords(this._records, this._eagerLoadAssociations);
      return;
    }

    const { JoinDependency } = await import("./associations/join-dependency.js");
    const jd = new JoinDependency(this._modelClass);

    const fallbackAssocs: string[] = [];
    for (const assocName of this._eagerLoadAssociations) {
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
      this._records = rows.map((row) => this._modelClass._instantiate(row) as T);
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
    for (const clause of this._havingClauses) manager.having(new Nodes.SqlLiteral(clause));
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
   * Return the query execution plan.
   *
   * Mirrors: ActiveRecord::Relation#explain
   */
  async explain(): Promise<string> {
    const sql = this._toSql();
    const adapter = this._modelClass.adapter as any;
    if (typeof adapter.explain === "function") {
      return adapter.explain(sql);
    }
    return `EXPLAIN not supported by this adapter`;
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
  async calculate(
    operation: "count" | "sum" | "average" | "minimum" | "maximum",
    column: string,
  ): Promise<number | null | Record<string, number>> {
    switch (operation) {
      case "count":
        return this.count(column);
      case "sum":
        return this.sum(column!);
      case "average":
        return this.average(column!);
      case "minimum":
        return this.minimum(column!) as Promise<number | null | Record<string, number>>;
      case "maximum":
        return this.maximum(column!) as Promise<number | null | Record<string, number>>;
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

  private _scopeAttributes(): Record<string, unknown> {
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
  }: { batchSize?: number } = {}): BatchEnumerator<Relation<T>> {
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
      } as () => AsyncGenerator<Relation<T>>,
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

    for (const clause of this._havingClauses) {
      manager.having(new Nodes.SqlLiteral(clause));
    }

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
    if (this._orRelations.length > 0) {
      // Collect all branches: this relation's wheres + each OR relation's wheres
      const allBranches: (Nodes.Node | null)[] = [
        this._combineNodes(this._collectAllWhereNodes(table, this)),
      ];
      for (const orRel of this._orRelations) {
        allBranches.push(this._combineNodes(this._collectAllWhereNodes(table, orRel)));
      }
      const nonNull = allBranches.filter((n): n is Nodes.Node => n !== null);
      if (nonNull.length > 0) {
        const combined = nonNull.reduce((left, right) => new Nodes.Or(left, right));
        manager.where(new Nodes.Grouping(combined));
      }
    } else {
      const allNodes = this._collectAllWhereNodes(table, this);
      for (const node of allNodes) {
        manager.where(node);
      }
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
    const { Preloader } = await import("./associations/preloader.js");
    const preloader = new Preloader(
      records as unknown as import("./base.js").Base[],
      assocNames,
      (recs, assocs) => this._doPreloadAssociations(recs as unknown as T[], assocs),
    );
    await preloader.call();
  }

  private async _doPreloadAssociations(records: T[], assocNames: string[]): Promise<void> {
    const modelClass = this._modelClass as any;
    const associations: any[] = modelClass._associations ?? [];

    for (const assocName of assocNames) {
      const assocDef = associations.find((a: any) => a.name === assocName);
      if (!assocDef) continue;

      const {
        loadBelongsTo: _lb,
        loadHasMany: _lm,
        loadHasOne: _lo,
        modelRegistry: _mr,
      } = await import("./associations.js");

      if (assocDef.type === "belongsTo") {
        const _underscore = (n: string) =>
          n
            .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
            .replace(/([a-z\d])([A-Z])/g, "$1_$2")
            .toLowerCase();
        const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
        const primaryKey = assocDef.options.primaryKey ?? "id";

        if (assocDef.options.polymorphic) {
          // Polymorphic belongsTo: group records by type column, query each model
          const typeCol = `${_toUnderscore(assocName)}_type`;
          const byType = new Map<string, any[]>();
          for (const record of records) {
            const typeName = record.readAttribute(typeCol) as string | null;
            if (!typeName) continue;
            if (!byType.has(typeName)) byType.set(typeName, []);
            byType.get(typeName)!.push(record);
          }
          // For each type, batch-load the parents
          const allParents = new Map<string, Map<unknown, any>>(); // type -> (pk -> record)
          for (const [typeName, typeRecords] of byType) {
            const targetModel = _mr.get(typeName);
            if (!targetModel) continue;
            const fkValues = [
              ...new Set(
                typeRecords.map((r) => r.readAttribute(foreignKey)).filter((v) => v != null),
              ),
            ];
            if (fkValues.length === 0) continue;
            const related = await (targetModel as any)
              ._allForPreload()
              .where({ [primaryKey]: fkValues })
              .toArray();
            const relatedMap = new Map<unknown, any>();
            for (const r of related) relatedMap.set(r.readAttribute(primaryKey), r);
            allParents.set(typeName, relatedMap);
          }
          for (const record of records) {
            if (!(record as any)._preloadedAssociations)
              (record as any)._preloadedAssociations = new Map();
            const typeName = record.readAttribute(typeCol) as string | null;
            const parent = typeName
              ? (allParents.get(typeName)?.get(record.readAttribute(foreignKey)) ?? null)
              : null;
            (record as any)._preloadedAssociations.set(assocName, parent);
            if (parent && assocDef.options.inverseOf) {
              if (!(parent as any)._cachedAssociations)
                (parent as any)._cachedAssociations = new Map();
              (parent as any)._cachedAssociations.set(assocDef.options.inverseOf, record);
            }
          }
        } else {
          const className =
            assocDef.options.className ?? assocName.charAt(0).toUpperCase() + assocName.slice(1);

          const fkValues = [
            ...new Set(records.map((r) => r.readAttribute(foreignKey)).filter((v) => v != null)),
          ];
          if (fkValues.length === 0) continue;

          const targetModel = _mr.get(className);
          if (!targetModel) continue;

          const related = await (targetModel as any)
            ._allForPreload()
            .where({ [primaryKey]: fkValues })
            .toArray();
          const relatedMap = new Map<unknown, any>();
          for (const r of related) relatedMap.set(r.readAttribute(primaryKey), r);

          for (const record of records) {
            if (!(record as any)._preloadedAssociations)
              (record as any)._preloadedAssociations = new Map();
            const parent = relatedMap.get(record.readAttribute(foreignKey)) ?? null;
            (record as any)._preloadedAssociations.set(assocName, parent);

            // Set inverse association on parent
            if (parent && assocDef.options.inverseOf) {
              if (!(parent as any)._cachedAssociations)
                (parent as any)._cachedAssociations = new Map();
              (parent as any)._cachedAssociations.set(assocDef.options.inverseOf, record);
            }
          }
        }
      } else if (assocDef.type === "hasMany") {
        const className = assocDef.options.className ?? _camelize(_singularize(assocName));
        const asName = assocDef.options.as;
        const foreignKey = asName
          ? (assocDef.options.foreignKey ?? `${_toUnderscore(asName)}_id`)
          : (assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
        const typeCol = asName ? `${_toUnderscore(asName)}_type` : null;
        const primaryKey = assocDef.options.primaryKey ?? modelClass.primaryKey;

        // Handle through associations
        if (assocDef.options.through) {
          const throughAssocDef = associations.find(
            (a: any) => a.name === assocDef.options.through,
          );
          if (!throughAssocDef) continue;

          const throughClassName =
            throughAssocDef.options.className ?? _camelize(_singularize(throughAssocDef.name));
          const throughModel = _mr.get(throughClassName);
          if (!throughModel) continue;

          // Determine FK for loading through records
          const throughAsName = throughAssocDef.options.as;
          const throughFk = throughAsName
            ? (throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughAsName)}_id`)
            : (throughAssocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
          const pkValues = [
            ...new Set(records.map((r) => r.readAttribute(primaryKey)).filter((v) => v != null)),
          ];
          if (pkValues.length === 0) continue;

          const sourceName = assocDef.options.source ?? _singularize(assocName);

          // Look up the source association on the through model (try singular and plural)
          const throughModelAssociations: any[] = (throughModel as any)._associations ?? [];
          const sourceAssocDef =
            throughModelAssociations.find((a: any) => a.name === sourceName) ??
            throughModelAssociations.find((a: any) => a.name === _pluralize(sourceName));
          const sourceAssocKind = sourceAssocDef?.type ?? "belongsTo";

          const throughWhereConditions: Record<string, unknown> = { [throughFk]: pkValues };
          if (throughAsName)
            throughWhereConditions[`${_toUnderscore(throughAsName)}_type`] = modelClass.name;

          // Push sourceType filter into the DB query instead of filtering in-memory
          if (
            assocDef.options.sourceType &&
            sourceAssocDef?.options?.polymorphic &&
            sourceAssocKind === "belongsTo"
          ) {
            const resolvedSourceName = sourceAssocDef?.name ?? sourceName;
            const sourceTypeCol = `${_toUnderscore(resolvedSourceName)}_type`;
            throughWhereConditions[sourceTypeCol] = assocDef.options.sourceType;
          }

          const throughRecords = await (throughModel as any)
            ._allForPreload()
            .where(throughWhereConditions)
            .toArray();

          const targetModel = _mr.get(className);
          if (!targetModel) continue;

          // If the source association on the through model is itself a through
          // association, recursively preload it on the through records first,
          // then collect results from _preloadedAssociations.
          if (sourceAssocDef?.options?.through) {
            const resolvedSourceName = sourceAssocDef.name;
            // Build a temporary Relation for the through model to trigger recursive preload
            const throughRel = (throughModel as any)._allForPreload();
            await (throughRel as any)._preloadAssociationsForRecords(throughRecords, [
              resolvedSourceName,
            ]);

            const throughByFk = new Map<unknown, any[]>();
            for (const tr of throughRecords) {
              const key = (tr as any).readAttribute(throughFk);
              const arr = throughByFk.get(key);
              if (arr) arr.push(tr);
              else throughByFk.set(key, [tr]);
            }

            // Apply outer association scope if present
            let allowedIds: Set<unknown> | null = null;
            if (assocDef.options.scope) {
              const targetPk = (targetModel as any).primaryKey ?? "id";
              const allTargets: any[] = [];
              for (const trs of throughByFk.values()) {
                for (const tr of trs) {
                  const p = (tr as any)._preloadedAssociations?.get(resolvedSourceName);
                  if (!p) continue;
                  if (Array.isArray(p)) allTargets.push(...p);
                  else allTargets.push(p);
                }
              }
              if (allTargets.length > 0) {
                const ids = [
                  ...new Set(
                    allTargets
                      .map((t: any) => t.readAttribute(targetPk))
                      .filter((v: any) => v != null),
                  ),
                ];
                let scopedRel = (targetModel as any)._allForPreload().where({ [targetPk]: ids });
                scopedRel = assocDef.options.scope(scopedRel);
                const scopedRecords = await scopedRel.toArray();
                allowedIds = new Set(scopedRecords.map((r: any) => r.readAttribute(targetPk)));
              }
            }

            for (const record of records) {
              if (!(record as any)._preloadedAssociations)
                (record as any)._preloadedAssociations = new Map();
              const pkVal = record.readAttribute(primaryKey);
              const myThroughRecords = throughByFk.get(pkVal) ?? [];
              let myTargets = myThroughRecords.flatMap((tr: any) => {
                const preloaded = (tr as any)._preloadedAssociations?.get(resolvedSourceName);
                if (!preloaded) return [];
                return Array.isArray(preloaded) ? preloaded : [preloaded];
              });
              if (allowedIds) {
                const targetPk = (targetModel as any).primaryKey ?? "id";
                myTargets = myTargets.filter((t: any) =>
                  allowedIds!.has(t.readAttribute(targetPk)),
                );
              }
              (record as any)._preloadedAssociations.set(assocName, myTargets);
            }
            continue;
          }

          let targetRecords: any[];
          let targetMap: Map<unknown, any>;
          let getTargetsForThrough: (throughRec: any) => any[];

          if (sourceAssocKind === "belongsTo") {
            // Through record has FK pointing to target (e.g., tagging.tag_id -> tag.id)
            const targetFk =
              sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
            const targetPk =
              sourceAssocDef?.options?.primaryKey ?? (targetModel as any).primaryKey ?? "id";

            const targetIds = [
              ...new Set(
                throughRecords
                  .map((r: any) => r.readAttribute(targetFk))
                  .filter((v: any) => v != null),
              ),
            ];
            let targetRel = (targetModel as any)._allForPreload().where({ [targetPk]: targetIds });
            if (assocDef.options.scope) targetRel = assocDef.options.scope(targetRel);
            targetRecords = targetIds.length > 0 ? await targetRel.toArray() : [];
            targetMap = new Map<unknown, any>();
            for (const r of targetRecords) targetMap.set(r.readAttribute(targetPk), r);
            getTargetsForThrough = (tr: any) => {
              const target = targetMap.get(tr.readAttribute(targetFk));
              return target ? [target] : [];
            };
          } else {
            // Source is has_many/has_one: target has FK pointing to through record
            const sourceAsName = sourceAssocDef?.options?.as;
            const sourceFk = sourceAsName
              ? (sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceAsName)}_id`)
              : (sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`);
            const throughIds = [
              ...new Set(
                throughRecords.map((r: any) => r.readAttribute("id")).filter((v: any) => v != null),
              ),
            ];
            const sourceWhereConditions: Record<string, unknown> = { [sourceFk]: throughIds };
            if (sourceAsName)
              sourceWhereConditions[`${_toUnderscore(sourceAsName)}_type`] = throughClassName;
            let sourceRel = (targetModel as any)._allForPreload().where(sourceWhereConditions);
            if (assocDef.options.scope) sourceRel = assocDef.options.scope(sourceRel);
            targetRecords = throughIds.length > 0 ? await sourceRel.toArray() : [];
            getTargetsForThrough = (tr: any) => {
              const trId = tr.readAttribute("id");
              return targetRecords.filter((r: any) => r.readAttribute(sourceFk) == trId);
            };
          }

          for (const record of records) {
            if (!(record as any)._preloadedAssociations)
              (record as any)._preloadedAssociations = new Map();
            const pkVal = record.readAttribute(primaryKey);
            const myThroughRecords = throughRecords.filter(
              (tr: any) => tr.readAttribute(throughFk) == pkVal,
            );
            const myTargets = myThroughRecords.flatMap(getTargetsForThrough);
            (record as any)._preloadedAssociations.set(assocName, myTargets);
          }
          continue;
        }

        const pkValues = [
          ...new Set(records.map((r) => r.readAttribute(primaryKey)).filter((v) => v != null)),
        ];
        if (pkValues.length === 0) continue;

        const targetModel = _mr.get(className);
        if (!targetModel) continue;

        const whereConditions: Record<string, unknown> = { [foreignKey]: pkValues };
        if (typeCol) whereConditions[typeCol] = modelClass.name;
        let hasManyRel = (targetModel as any)._allForPreload().where(whereConditions);
        if (assocDef.options.scope) hasManyRel = assocDef.options.scope(hasManyRel);
        const related = await hasManyRel.toArray();
        const relatedMap = new Map<unknown, any[]>();
        for (const r of related) {
          const fk = r.readAttribute(foreignKey);
          if (!relatedMap.has(fk)) relatedMap.set(fk, []);
          relatedMap.get(fk)!.push(r);
        }

        for (const record of records) {
          if (!(record as any)._preloadedAssociations)
            (record as any)._preloadedAssociations = new Map();
          const children = relatedMap.get(record.readAttribute(primaryKey)) ?? [];
          (record as any)._preloadedAssociations.set(assocName, children);

          // Set inverse association on children
          if (assocDef.options.inverseOf) {
            for (const child of children) {
              if (!(child as any)._cachedAssociations)
                (child as any)._cachedAssociations = new Map();
              (child as any)._cachedAssociations.set(assocDef.options.inverseOf, record);
            }
          }
        }
      } else if (assocDef.type === "hasOne") {
        const className = assocDef.options.className ?? _camelize(assocName);
        const primaryKey = assocDef.options.primaryKey ?? modelClass.primaryKey;
        const hasOneAsName = assocDef.options.as;

        // Handle has_one :through
        if (assocDef.options.through) {
          const throughAssocDef = associations.find(
            (a: any) => a.name === assocDef.options.through,
          );
          if (!throughAssocDef) continue;

          const throughClassName =
            throughAssocDef.options.className ??
            (throughAssocDef.type === "hasMany"
              ? _camelize(_singularize(throughAssocDef.name))
              : _camelize(throughAssocDef.name));
          const throughModel = _mr.get(throughClassName);
          if (!throughModel) continue;

          const throughAsName = throughAssocDef.options.as;
          const throughFk = throughAsName
            ? (throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughAsName)}_id`)
            : (throughAssocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
          const pkValues = [
            ...new Set(records.map((r) => r.readAttribute(primaryKey)).filter((v) => v != null)),
          ];
          if (pkValues.length === 0) continue;

          const throughWhereConditions: Record<string, unknown> = { [throughFk]: pkValues };
          if (throughAsName)
            throughWhereConditions[`${_toUnderscore(throughAsName)}_type`] = modelClass.name;
          const throughRecords = await (throughModel as any)
            ._allForPreload()
            .where(throughWhereConditions)
            .toArray();

          const sourceName = assocDef.options.source ?? assocName;
          const targetModel = _mr.get(className);
          if (!targetModel) continue;

          // Look up source association on through model
          const throughModelAssociations: any[] = (throughModel as any)._associations ?? [];
          const sourceAssocDef =
            throughModelAssociations.find((a: any) => a.name === sourceName) ??
            throughModelAssociations.find((a: any) => a.name === _pluralize(sourceName));

          // Recursive through: if source association is itself a through, preload recursively
          if (sourceAssocDef?.options?.through) {
            const resolvedSourceName = sourceAssocDef.name;
            const throughRel = (throughModel as any)._allForPreload();
            await (throughRel as any)._preloadAssociationsForRecords(throughRecords, [
              resolvedSourceName,
            ]);

            const throughByFkHasOne = new Map<unknown, any>();
            for (const tr of throughRecords) {
              const fkVal = (tr as any).readAttribute(throughFk);
              if (fkVal != null && !throughByFkHasOne.has(fkVal)) {
                throughByFkHasOne.set(fkVal, tr);
              }
            }

            // Apply outer association scope if present
            let hasOneAllowedIds: Set<unknown> | null = null;
            if (assocDef.options.scope) {
              const targetPk = (targetModel as any).primaryKey ?? "id";
              const allTargets: any[] = [];
              for (const tr of throughRecords) {
                const p = (tr as any)._preloadedAssociations?.get(resolvedSourceName);
                if (!p) continue;
                if (Array.isArray(p)) allTargets.push(...p);
                else allTargets.push(p);
              }
              if (allTargets.length > 0) {
                const ids = [
                  ...new Set(
                    allTargets
                      .map((t: any) => t.readAttribute(targetPk))
                      .filter((v: any) => v != null),
                  ),
                ];
                let scopedRel = (targetModel as any)._allForPreload().where({ [targetPk]: ids });
                scopedRel = assocDef.options.scope(scopedRel);
                const scopedRecords = await scopedRel.toArray();
                hasOneAllowedIds = new Set(
                  scopedRecords.map((r: any) => r.readAttribute(targetPk)),
                );
              }
            }

            for (const record of records) {
              if (!(record as any)._preloadedAssociations)
                (record as any)._preloadedAssociations = new Map();
              const pkVal = record.readAttribute(primaryKey);
              const myThroughRecord = throughByFkHasOne.get(pkVal) ?? null;
              const preloaded = myThroughRecord
                ? ((myThroughRecord as any)._preloadedAssociations?.get(resolvedSourceName) ?? null)
                : null;
              // hasOne through: unwrap array to single value
              let target = Array.isArray(preloaded) ? (preloaded[0] ?? null) : preloaded;
              if (target && hasOneAllowedIds) {
                const targetPk = (targetModel as any).primaryKey ?? "id";
                if (!hasOneAllowedIds.has(target.readAttribute(targetPk))) target = null;
              }
              (record as any)._preloadedAssociations.set(assocName, target);
            }
            continue;
          }

          const targetFk = sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
          const targetIds = [
            ...new Set(
              throughRecords
                .map((r: any) => r.readAttribute(targetFk))
                .filter((v: any) => v != null),
            ),
          ];
          let hotTargetRel = (targetModel as any)._allForPreload().where({ id: targetIds });
          if (assocDef.options.scope) hotTargetRel = assocDef.options.scope(hotTargetRel);
          const targetRecords = targetIds.length > 0 ? await hotTargetRel.toArray() : [];
          const targetMap = new Map<unknown, any>();
          for (const r of targetRecords) targetMap.set(r.readAttribute("id"), r);

          for (const record of records) {
            if (!(record as any)._preloadedAssociations)
              (record as any)._preloadedAssociations = new Map();
            const pkVal = record.readAttribute(primaryKey);
            const myThroughRecord = throughRecords.find(
              (tr: any) => tr.readAttribute(throughFk) == pkVal,
            );
            const myTarget = myThroughRecord
              ? (targetMap.get(myThroughRecord.readAttribute(targetFk)) ?? null)
              : null;
            (record as any)._preloadedAssociations.set(assocName, myTarget);
          }
          continue;
        }

        const foreignKey = hasOneAsName
          ? (assocDef.options.foreignKey ?? `${_toUnderscore(hasOneAsName)}_id`)
          : (assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
        const hasOneTypeCol = hasOneAsName ? `${_toUnderscore(hasOneAsName)}_type` : null;

        const pkValues = [
          ...new Set(records.map((r) => r.readAttribute(primaryKey)).filter((v) => v != null)),
        ];
        if (pkValues.length === 0) continue;

        const targetModel = _mr.get(className);
        if (!targetModel) continue;

        const hasOneWhere: Record<string, unknown> = { [foreignKey]: pkValues };
        if (hasOneTypeCol) hasOneWhere[hasOneTypeCol] = modelClass.name;
        let hasOneRel = (targetModel as any)._allForPreload().where(hasOneWhere);
        if (assocDef.options.scope) hasOneRel = assocDef.options.scope(hasOneRel);
        const related = await hasOneRel.toArray();
        const relatedMap = new Map<unknown, any>();
        for (const r of related) relatedMap.set(r.readAttribute(foreignKey), r);

        for (const record of records) {
          if (!(record as any)._preloadedAssociations)
            (record as any)._preloadedAssociations = new Map();
          const child = relatedMap.get(record.readAttribute(primaryKey)) ?? null;
          (record as any)._preloadedAssociations.set(assocName, child);

          // Set inverse association on child
          if (child && assocDef.options.inverseOf) {
            if (!(child as any)._cachedAssociations) (child as any)._cachedAssociations = new Map();
            (child as any)._cachedAssociations.set(assocDef.options.inverseOf, record);
          }
        }
      } else if (assocDef.type === "hasAndBelongsToMany") {
        const targetClassName = assocDef.options.className ?? _camelize(_singularize(assocName));
        const targetModel = _mr.get(targetClassName);
        if (!targetModel) continue;
        const targetTable = (targetModel as any).tableName;
        const targetPk = (targetModel as any).primaryKey ?? "id";
        if (Array.isArray(targetPk)) continue;

        const ownerPk = modelClass.primaryKey ?? "id";
        if (Array.isArray(ownerPk)) continue;

        const pkValues = [
          ...new Set(records.map((r) => r.readAttribute(ownerPk)).filter((v) => v != null)),
        ];
        if (pkValues.length === 0) continue;

        // Compute join table name (same convention as defaultJoinTableName in associations.ts)
        const ownerKey = _pluralize(_toUnderscore(modelClass.name));
        const assocKey = _toUnderscore(assocName);
        const defaultJoinTable = [ownerKey, assocKey].sort().join("_");
        const joinTable = assocDef.options.joinTable ?? defaultJoinTable;
        const ownerFk =
          typeof assocDef.options.foreignKey === "string"
            ? assocDef.options.foreignKey
            : `${_toUnderscore(modelClass.name)}_id`;
        const targetFk = `${_toUnderscore(_singularize(assocName))}_id`;

        // Query join table for all owner PKs
        const jt = new Table(joinTable);
        const joinQuery = jt
          .project(jt.get(ownerFk), jt.get(targetFk))
          .where(jt.get(ownerFk).in(pkValues));
        const joinRows = await modelClass.adapter.execute(joinQuery.toSql());

        // Collect target IDs and build owner->targetIds map
        const ownerToTargetIds = new Map<unknown, unknown[]>();
        const allTargetIds = new Set<unknown>();
        for (const row of joinRows) {
          const ownerId = row[ownerFk];
          const targetId = row[targetFk];
          allTargetIds.add(targetId);
          if (!ownerToTargetIds.has(ownerId)) ownerToTargetIds.set(ownerId, []);
          ownerToTargetIds.get(ownerId)!.push(targetId);
        }

        // Batch-load target records
        const targetIds = [...allTargetIds];
        let targetRecords: any[] = [];
        if (targetIds.length > 0) {
          let targetRel = (targetModel as any)._allForPreload().where({ [targetPk]: targetIds });
          if (assocDef.options.scope) targetRel = assocDef.options.scope(targetRel);
          targetRecords = await targetRel.toArray();
        }
        const targetMap = new Map<unknown, any>();
        for (const r of targetRecords) targetMap.set(r.readAttribute(targetPk), r);

        // Assign preloaded associations
        for (const record of records) {
          if (!(record as any)._preloadedAssociations)
            (record as any)._preloadedAssociations = new Map();
          const myTargetIds = ownerToTargetIds.get(record.readAttribute(ownerPk)) ?? [];
          const myTargets = myTargetIds.map((id) => targetMap.get(id)).filter((r) => r != null);
          (record as any)._preloadedAssociations.set(assocName, myTargets);
        }
      }
    }
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
   * Update counters on matching records.
   *
   * Mirrors: ActiveRecord::Relation#update_counters
   */
  async updateCounters(counters: Record<string, number>): Promise<number> {
    if (this._isNone) return 0;
    const table = this._modelClass.arelTable;
    const updateValues: [InstanceType<typeof Nodes.Node>, unknown][] = Object.entries(counters).map(
      ([key, val]) => {
        const col = table.get(key);
        const coalesced = new Nodes.NamedFunction("COALESCE", [col, new Nodes.Quoted(0)]);
        return [col, new Nodes.Addition(coalesced, new Nodes.Quoted(val))];
      },
    );
    const um = new UpdateManager().table(table).set(updateValues);
    for (const cond of this._buildWhereStrings(table)) {
      um.where(arelSql(cond));
    }
    return this._modelClass.adapter.executeMutation(um.toSql());
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
      having: [...this._havingClauses],
      limit: this._limitValue,
      offset: this._offsetValue,
      lock: this._lockValue,
      readonly: this._isReadonly,
      distinct: this._isDistinct,
      strictLoading: this._isStrictLoading,
      from: this._fromClause,
      annotations: [...this._annotations],
      optimizerHints: [...this._optimizerHints],
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
      this._havingClauses.length === 0 &&
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

  /** @internal */
  _clone(): Relation<T> {
    const rel = new Relation<T>(this._modelClass);
    rel._table = this._table;
    rel._whereClause = this._whereClause.clone();
    rel._orderClauses = [...this._orderClauses];
    rel._rawOrderClauses = [...this._rawOrderClauses];
    rel._limitValue = this._limitValue;
    rel._offsetValue = this._offsetValue;
    rel._selectColumns = this._selectColumns ? [...this._selectColumns] : null;
    rel._isDistinct = this._isDistinct;
    rel._distinctOnColumns = [...this._distinctOnColumns];
    rel._groupColumns = [...this._groupColumns];
    rel._havingClauses = [...this._havingClauses];
    rel._orRelations = [...this._orRelations];
    rel._isNone = this._isNone;
    rel._lockValue = this._lockValue;
    rel._setOperation = this._setOperation;
    rel._joinClauses = [...this._joinClauses];
    rel._rawJoins = [...this._rawJoins];
    rel._includesAssociations = [...this._includesAssociations];
    rel._preloadAssociations = [...this._preloadAssociations];
    rel._eagerLoadAssociations = [...this._eagerLoadAssociations];
    rel._isReadonly = this._isReadonly;
    rel._isStrictLoading = this._isStrictLoading;
    rel._annotations = [...this._annotations];
    rel._optimizerHints = [...this._optimizerHints];
    rel._fromClause = this._fromClause;
    rel._createWithAttrs = { ...this._createWithAttrs };
    rel._extending = [...this._extending];
    rel._ctes = [...this._ctes];
    rel._skipPreloading = this._skipPreloading;
    rel._skipQueryCache = this._skipQueryCache;
    return wrapWithScopeProxy(rel);
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
