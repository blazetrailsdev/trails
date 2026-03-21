import { Table, SelectManager, Nodes } from "@rails-ts/arel";
import type { Base } from "./base.js";
import { _setRelationCtor, _setScopeProxyWrapper } from "./base.js";
import { RecordNotFound, SoleRecordExceeded } from "./errors.js";
import { modelRegistry } from "./associations.js";
import { getInheritanceColumn, isStiSubclass } from "./sti.js";
import {
  underscore as _toUnderscore,
  camelize as _camelize,
  singularize as _singularize,
  pluralize as _pluralize,
} from "@rails-ts/activesupport";

/**
 * Range — represents a BETWEEN range for where clauses.
 *
 * Usage: User.where({ age: new Range(18, 30) })
 * Generates: WHERE age BETWEEN 18 AND 30
 */
export class Range {
  readonly begin: unknown;
  readonly end: unknown;
  readonly excludeEnd: boolean;

  constructor(begin: unknown, end: unknown, excludeEnd: boolean = false) {
    this.begin = begin;
    this.end = end;
    this.excludeEnd = excludeEnd;
  }
}

/**
 * Relation — the lazy, chainable query interface.
 *
 * Mirrors: ActiveRecord::Relation
 */
export class Relation<T extends Base> {
  private _modelClass: typeof Base;
  private _whereClauses: Array<Record<string, unknown>> = [];
  private _whereNotClauses: Array<Record<string, unknown>> = [];
  private _whereRawClauses: string[] = [];
  private _orderClauses: Array<string | [string, "asc" | "desc"]> = [];
  private _rawOrderClauses: string[] = [];
  private _limitValue: number | null = null;
  private _offsetValue: number | null = null;
  private _selectColumns: string[] | null = null;
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
  private _fromClause: string | null = null;
  private _createWithAttrs: Record<string, unknown> = {};
  private _extending: Array<Record<string, Function>> = [];
  private _ctes: Array<{ name: string; sql: string; recursive: boolean }> = [];
  private _loaded = false;
  private _records: T[] = [];

  constructor(modelClass: typeof Base) {
    this._modelClass = modelClass;
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
  where(): Relation<T>;
  where(conditions: Record<string, unknown>): Relation<T>;
  where(sql: string, ...binds: unknown[]): Relation<T>;
  where(conditionsOrSql?: Record<string, unknown> | string, ...binds: unknown[]): Relation<T> {
    if (conditionsOrSql === undefined) return this._clone();
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
      rel._whereRawClauses.push(sql);
    } else {
      // Check for subquery values (Relation instances)
      const normalConditions: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(conditionsOrSql)) {
        if (value instanceof Relation) {
          // Subquery: WHERE column IN (SELECT ...)
          const subSql = value.toSql();
          const { tbl, col } = this._qualifiedCol(this._modelClass.arelTable, key);
          rel._whereRawClauses.push(`"${tbl}"."${col}" IN (${subSql})`);
        } else {
          normalConditions[key] = Array.isArray(value)
            ? value.map((v) => this._castWhereValue(key, v))
            : this._castWhereValue(key, value);
        }
      }
      if (Object.keys(normalConditions).length > 0) {
        rel._whereClauses.push(normalConditions);
      }
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
    // Remove existing clauses for the keys being rewritten
    const keysToReplace = new Set(Object.keys(conditions));
    rel._whereClauses = rel._whereClauses
      .map((clause) => {
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(clause)) {
          if (!keysToReplace.has(k)) filtered[k] = v;
        }
        return filtered;
      })
      .filter((c) => Object.keys(c).length > 0);
    // Also remove NOT clauses for the same keys
    rel._whereNotClauses = rel._whereNotClauses
      .map((clause) => {
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(clause)) {
          if (!keysToReplace.has(k)) filtered[k] = v;
        }
        return filtered;
      })
      .filter((c) => Object.keys(c).length > 0);
    rel._whereClauses.push(conditions);
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
        const { targetTable, foreignKey, typeClause } = this._resolveHasManySubquery(
          modelClass,
          assocDef,
          assocName,
        );
        const sourceTable = modelClass.tableName;
        const pk = (assocDef.options.primaryKey ?? modelClass.primaryKey) as string;
        const whereClause = typeClause ? `WHERE ${typeClause}` : "";
        const cloned = rel._clone();
        cloned._whereRawClauses.push(
          `"${sourceTable}"."${pk}" IN (SELECT "${targetTable}"."${foreignKey}" FROM "${targetTable}"${whereClause ? " " + whereClause : ""})`,
        );
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
        const { targetTable, foreignKey, typeClause } = this._resolveHasManySubquery(
          modelClass,
          assocDef,
          assocName,
        );
        const sourceTable = modelClass.tableName;
        const pk = (assocDef.options.primaryKey ?? modelClass.primaryKey) as string;
        const whereClause = typeClause ? `WHERE ${typeClause}` : "";
        const cloned = rel._clone();
        cloned._whereRawClauses.push(
          `"${sourceTable}"."${pk}" NOT IN (SELECT "${targetTable}"."${foreignKey}" FROM "${targetTable}"${whereClause ? " " + whereClause : ""})`,
        );
        rel = cloned;
      }
    }
    return rel;
  }

  private _resolveHasManySubquery(
    modelClass: any,
    assocDef: any,
    assocName: string,
  ): { targetTable: string; foreignKey: string; typeClause: string | null } {
    const targetClassName = assocDef.options.className ?? _camelize(_singularize(assocName));
    const targetModel = modelRegistry.get(targetClassName);
    if (!targetModel) {
      throw new Error(
        `Model '${targetClassName}' not found in registry for association '${assocName}'`,
      );
    }
    const targetTable = targetModel.tableName;
    let foreignKey: string;
    let typeClause: string | null = null;
    if (assocDef.options.as) {
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`;
      const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
      typeClause = `"${targetTable}"."${typeCol}" = '${modelClass.name}'`;
    } else {
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`;
    }
    const inheritanceCol = getInheritanceColumn(targetModel);
    if (inheritanceCol && isStiSubclass(targetModel)) {
      const stiNames = [
        targetModel.name,
        ...(targetModel.descendants ?? []).map((d: any) => d.name),
      ];
      const inList = stiNames.map((n: string) => `'${n}'`).join(", ");
      const stiClause = `"${targetTable}"."${inheritanceCol}" IN (${inList})`;
      typeClause = typeClause ? `${typeClause} AND ${stiClause}` : stiClause;
    }
    return { targetTable, foreignKey, typeClause };
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
    rel._whereNotClauses.push(castConditions);
    return rel;
  }

  /**
   * Combine this relation with another using OR.
   *
   * Mirrors: ActiveRecord::Relation#or
   */
  or(other: Relation<T>): Relation<T> {
    const rel = this._clone();
    rel._orRelations = [...rel._orRelations, other];
    return rel;
  }

  /**
   * Combine this relation with another using AND — merges all WHERE
   * conditions from the other relation into this one.
   *
   * Mirrors: ActiveRecord::Relation#and
   */
  and(other: Relation<T>): Relation<T> {
    const rel = this._clone();
    rel._whereClauses = [...rel._whereClauses, ...other._whereClauses];
    rel._whereNotClauses = [...rel._whereNotClauses, ...other._whereNotClauses];
    rel._whereRawClauses = [...rel._whereRawClauses, ...other._whereRawClauses];
    return rel;
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
      r._whereClauses = [cond];
      r._whereNotClauses = [];
      r._whereRawClauses = [];
      r._orRelations = [];
      return r;
    };
    let combined = makeRel(conditions[0]);
    for (let i = 1; i < conditions.length; i++) {
      combined = combined.or(makeRel(conditions[i]));
    }
    // Merge existing where clauses from `this` with the OR result
    const rel = this._clone();
    // Replace where clauses with the combined OR result
    rel._whereClauses = combined._whereClauses;
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
    return this.whereNot({ [this._modelClass.primaryKey as string]: ids });
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
    const rel = this._clone();
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      if (typeof arg === "string") {
        // Check if the next arg is a bare direction: order("title", "asc")
        const next = args[i + 1];
        if (typeof next === "string" && /^(asc|desc)$/i.test(next)) {
          rel._orderClauses.push([arg, next.toLowerCase() as "asc" | "desc"]);
          i += 2;
          continue;
        }
        rel._orderClauses.push(arg);
      } else {
        for (const [col, dir] of Object.entries(arg)) {
          rel._orderClauses.push([col, dir]);
        }
      }
      i++;
    }
    return rel;
  }

  /**
   * Set LIMIT.
   *
   * Mirrors: ActiveRecord::Relation#limit
   */
  limit(value: number | null): Relation<T> {
    if (value == null) {
      const rel = this._clone();
      rel._limitValue = null;
      return rel;
    }
    const num = Number(value);
    if (!Number.isSafeInteger(num) || num < 0) {
      throw new Error(`Invalid limit value: ${String(value)}`);
    }
    const rel = this._clone();
    rel._limitValue = num;
    return rel;
  }

  /**
   * Set OFFSET.
   *
   * Mirrors: ActiveRecord::Relation#offset
   */
  offset(value: number): Relation<T> {
    const rel = this._clone();
    rel._offsetValue = value;
    return rel;
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
  select(...columns: string[]): Relation<T>;
  select(...args: any[]): Relation<T> | Promise<T[]> {
    if (args.length === 1 && typeof args[0] === "function") {
      return this.toArray().then((records) => records.filter(args[0]));
    }
    const rel = this._clone();
    rel._selectColumns = args as string[];
    return rel;
  }

  /**
   * Replace existing select columns.
   *
   * Mirrors: ActiveRecord::Relation#reselect
   */
  reselect(...columns: string[]): Relation<T> {
    const rel = this._clone();
    rel._selectColumns = columns;
    return rel;
  }

  /**
   * Make the query DISTINCT.
   *
   * Mirrors: ActiveRecord::Relation#distinct
   */
  distinct(): Relation<T> {
    const rel = this._clone();
    rel._isDistinct = true;
    return rel;
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
    const rel = this._clone();
    rel._groupColumns.push(...columns);
    return rel;
  }

  /**
   * Add HAVING clause. Accepts raw SQL string or hash form.
   *
   * Mirrors: ActiveRecord::Relation#having
   *
   * Examples:
   *   having("COUNT(*) > 5")
   *   having({ count: 5 }) // having COUNT(*) = 5
   */
  having(condition: string | Record<string, unknown>): Relation<T> {
    const rel = this._clone();
    if (typeof condition === "string") {
      rel._havingClauses.push(condition);
    } else {
      // Hash form: convert to SQL conditions
      for (const [key, value] of Object.entries(condition)) {
        if (typeof value === "number") {
          rel._havingClauses.push(`${key} = ${value}`);
        } else {
          rel._havingClauses.push(`${key} = '${String(value).replace(/'/g, "''")}'`);
        }
      }
    }
    return rel;
  }

  /**
   * Replace GROUP BY columns.
   *
   * Mirrors: ActiveRecord::Relation#regroup
   */
  regroup(...columns: string[]): Relation<T> {
    const rel = this._clone();
    rel._groupColumns = [...columns];
    return rel;
  }

  /**
   * Replace ordering.
   *
   * Mirrors: ActiveRecord::Relation#reorder
   */
  reorder(...args: Array<string | Record<string, "asc" | "desc">>): Relation<T> {
    const rel = this._clone();
    rel._orderClauses = [];
    for (const arg of args) {
      if (typeof arg === "string") {
        rel._orderClauses.push(arg);
      } else {
        for (const [col, dir] of Object.entries(arg)) {
          rel._orderClauses.push([col, dir]);
        }
      }
    }
    return rel;
  }

  /**
   * Reverse the existing order.
   *
   * Mirrors: ActiveRecord::Relation#reverse_order
   */
  reverseOrder(): Relation<T> {
    const rel = this._clone();
    rel._orderClauses = rel._orderClauses.map((clause) => {
      if (typeof clause === "string") {
        // Parse "column ASC/DESC" before reversing
        const match = clause.match(/^([\w.]+)\s+(ASC|DESC)$/i);
        if (match) {
          const col = match[1];
          const dir = match[2].toUpperCase() === "ASC" ? "desc" : "asc";
          return [col, dir] as [string, "asc" | "desc"];
        }
        return [clause, "desc" as const];
      }
      const [col, dir] = clause;
      return [col, dir === "asc" ? "desc" : "asc"] as [string, "asc" | "desc"];
    });
    return rel;
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
    const rel = this._clone();
    const oldWhere = rel._whereClauses;
    const oldWhereNot = rel._whereNotClauses;
    rel._whereClauses = oldWhereNot;
    rel._whereNotClauses = oldWhere;
    return rel;
  }

  /**
   * Returns a human-readable string representation of the relation.
   *
   * Mirrors: ActiveRecord::Relation#inspect
   */
  inspect(): string {
    const parts: string[] = [];
    parts.push(`${this._modelClass.name}.all`);
    if (this._whereClauses.length > 0) {
      parts.push(
        `.where(${JSON.stringify(this._whereClauses.length === 1 ? this._whereClauses[0] : this._whereClauses)})`,
      );
    }
    if (this._whereNotClauses.length > 0) {
      parts.push(
        `.whereNot(${JSON.stringify(this._whereNotClauses.length === 1 ? this._whereNotClauses[0] : this._whereNotClauses)})`,
      );
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
      parts.push(`.select(${JSON.stringify(this._selectColumns)})`);
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
    const rel = this._clone();
    rel._isNone = true;
    return rel;
  }

  /**
   * Add a lock clause (FOR UPDATE by default).
   *
   * Mirrors: ActiveRecord::Relation#lock
   */
  lock(clause: string | boolean = true): Relation<T> {
    const rel = this._clone();
    rel._lockValue = clause === true ? "FOR UPDATE" : clause === false ? null : clause;
    return rel;
  }

  /**
   * Mark loaded records as readonly.
   *
   * Mirrors: ActiveRecord::Relation#readonly
   */
  readonly(value = true): Relation<T> {
    const rel = this._clone();
    rel._isReadonly = value;
    return rel;
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
    const rel = this._clone();
    rel._isStrictLoading = value;
    return rel;
  }

  /**
   * Add SQL comments to the query.
   *
   * Mirrors: ActiveRecord::Relation#annotate
   */
  annotate(...comments: string[]): Relation<T> {
    const rel = this._clone();
    rel._annotations.push(...comments);
    return rel;
  }

  /**
   * Add optimizer hints to the query.
   *
   * Mirrors: ActiveRecord::Relation#optimizer_hints
   */
  optimizerHints(...hints: string[]): Relation<T> {
    const rel = this._clone();
    rel._optimizerHints.push(...hints);
    return rel;
  }

  /**
   * Merge another relation's conditions into this one.
   *
   * Mirrors: ActiveRecord::Relation#merge
   */
  merge(other: Relation<T>): Relation<T> {
    const rel = this._clone();
    rel._whereClauses.push(...other._whereClauses);
    rel._whereNotClauses.push(...other._whereNotClauses);
    rel._whereRawClauses.push(...other._whereRawClauses);
    if (other._orderClauses.length > 0) {
      rel._orderClauses = [...other._orderClauses];
    }
    if (other._limitValue !== null) {
      rel._limitValue = other._limitValue;
    }
    if (other._offsetValue !== null) {
      rel._offsetValue = other._offsetValue;
    }
    if (other._selectColumns) {
      rel._selectColumns = [...other._selectColumns];
    }
    if (other._isDistinct) rel._isDistinct = true;
    if (other._groupColumns.length > 0) {
      rel._groupColumns.push(...other._groupColumns);
    }
    if (other._havingClauses.length > 0) {
      rel._havingClauses.push(...other._havingClauses);
    }
    if (other._lockValue) rel._lockValue = other._lockValue;
    if (other._isReadonly) rel._isReadonly = true;
    if (other._isStrictLoading) rel._isStrictLoading = true;
    rel._joinClauses.push(...other._joinClauses);
    rel._rawJoins.push(...other._rawJoins);
    rel._annotations.push(...other._annotations);
    return rel;
  }

  /**
   * Change the FROM clause (for subqueries or alternate table names).
   *
   * Mirrors: ActiveRecord::Relation#from
   */
  from(source: string): Relation<T> {
    const rel = this._clone();
    rel._fromClause = source;
    return rel;
  }

  /**
   * Set default attributes for create operations on this relation.
   *
   * Mirrors: ActiveRecord::Relation#create_with
   */
  createWith(attrs: Record<string, unknown>): Relation<T> {
    const rel = this._clone();
    rel._createWithAttrs = { ...rel._createWithAttrs, ...attrs };
    return rel;
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
    const rel = this._clone();
    for (const type of types) {
      switch (type) {
        case "where":
          rel._whereClauses = [];
          rel._whereNotClauses = [];
          rel._whereRawClauses = [];
          break;
        case "order":
          rel._orderClauses = [];
          break;
        case "limit":
          rel._limitValue = null;
          break;
        case "offset":
          rel._offsetValue = null;
          break;
        case "group":
          rel._groupColumns = [];
          break;
        case "having":
          rel._havingClauses = [];
          break;
        case "select":
          rel._selectColumns = null;
          break;
        case "distinct":
          rel._isDistinct = false;
          break;
        case "lock":
          rel._lockValue = null;
          break;
        case "readonly":
          rel._isReadonly = false;
          break;
        case "from":
          rel._fromClause = null;
          break;
      }
    }
    return rel;
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
    const rel = this._clone();
    if (typeof mod === "function") {
      mod(rel);
    } else {
      rel._extending.push(mod);
      for (const [name, fn] of Object.entries(mod)) {
        (rel as any)[name] = fn.bind(rel);
      }
    }
    return rel;
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
    const rel = this._clone();
    rel._includesAssociations.push(...associations);
    return rel;
  }

  /**
   * Specify associations to be preloaded with separate queries.
   *
   * Mirrors: ActiveRecord::Relation#preload
   */
  preload(...associations: string[]): Relation<T> {
    const rel = this._clone();
    rel._preloadAssociations.push(...associations);
    return rel;
  }

  /**
   * Specify associations to be eager loaded.
   *
   * Mirrors: ActiveRecord::Relation#eager_load
   */
  eagerLoad(...associations: string[]): Relation<T> {
    const rel = this._clone();
    rel._eagerLoadAssociations.push(...associations);
    return rel;
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
    await this.toArray();
    return this;
  }

  /**
   * Return the loaded records. Triggers loading if not yet loaded.
   *
   * Mirrors: ActiveRecord::Relation#records
   */
  async records(): Promise<T[]> {
    return this.toArray();
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

  /**
   * Create a fresh copy of this relation.
   *
   * Mirrors: ActiveRecord::Relation#spawn
   */
  spawn(): Relation<T> {
    return this._clone();
  }

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
    return (await this.isAny()) ? this : null;
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
    return this;
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
      const rows = await this._modelClass.adapter.execute(sql);
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
    if (Array.isArray(basePk) || this._ctes.length > 0 || this._setOperation || this._fromClause) {
      const sql = this._toSql();
      const rows = await this._modelClass.adapter.execute(sql);
      this._records = rows.map((row) => this._modelClass._instantiate(row) as T);
      await this._preloadAssociationsForRecords(this._records, this._eagerLoadAssociations);
      return;
    }

    const { JoinDependency } = await import("./join-dependency.js");
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

    let sql = manager.toSql();
    if (this._optimizerHints.length > 0) {
      const hints = `/*+ ${this._optimizerHints.join(" ")} */`;
      sql = sql.replace(/^SELECT/, `SELECT ${hints}`);
    }
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
  async first(n?: number): Promise<T | T[] | null> {
    if (this._isNone) return n !== undefined ? [] : null;
    if (n !== undefined) {
      const rel = this._clone();
      rel._limitValue = n;
      return rel.toArray();
    }
    const rel = this._clone();
    rel._limitValue = 1;
    const records = await rel.toArray();
    return records[0] ?? null;
  }

  /**
   * Return the first record, or throw if none found.
   *
   * Mirrors: ActiveRecord::Relation#first!
   */
  async firstBang(): Promise<T> {
    const record = await this.first();
    if (!record) {
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    }
    return record as T;
  }

  /**
   * Return the last record, or last N records when n is given.
   * When no order is specified, defaults to ordering by primary key
   * descending (matching Rails behavior).
   *
   * Mirrors: ActiveRecord::Relation#last
   */
  async last(n?: number): Promise<T | T[] | null> {
    if (this._isNone) return n !== undefined ? [] : null;
    let rel: Relation<T>;
    if (this._orderClauses.length === 0) {
      rel = this.order({ [this._modelClass.primaryKey as string]: "desc" as const });
    } else {
      rel = this.reverseOrder();
    }
    if (n !== undefined) {
      rel = rel.limit(n);
      const records = await rel.toArray();
      return records.reverse();
    }
    rel = rel.limit(1);
    const records = await rel.toArray();
    return records[0] ?? null;
  }

  /**
   * Return the last record, or throw if none found.
   *
   * Mirrors: ActiveRecord::Relation#last!
   */
  async lastBang(): Promise<T> {
    const record = await this.last();
    if (!record) {
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    }
    return record as T;
  }

  /**
   * Return exactly one record, or raise if zero or more than one.
   *
   * Mirrors: ActiveRecord::Relation#sole
   */
  async sole(): Promise<T> {
    const rel = this._clone();
    rel._limitValue = 2; // Only need 2 to detect "more than one"
    const records = await rel.toArray();
    if (records.length === 0) {
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    }
    if (records.length > 1) {
      throw new SoleRecordExceeded(this._modelClass.name);
    }
    return records[0];
  }

  /**
   * Return the second record.
   *
   * Mirrors: ActiveRecord::Relation#second
   */
  async second(): Promise<T | null> {
    return this._findNthWithLimit(1);
  }

  /**
   * Return the third record.
   *
   * Mirrors: ActiveRecord::Relation#third
   */
  async third(): Promise<T | null> {
    return this._findNthWithLimit(2);
  }

  /**
   * Return the fourth record.
   *
   * Mirrors: ActiveRecord::Relation#fourth
   */
  async fourth(): Promise<T | null> {
    return this._findNthWithLimit(3);
  }

  /**
   * Return the fifth record.
   *
   * Mirrors: ActiveRecord::Relation#fifth
   */
  async fifth(): Promise<T | null> {
    return this._findNthWithLimit(4);
  }

  /**
   * Return the forty-second record.
   *
   * Mirrors: ActiveRecord::Relation#forty_two
   */
  async fortyTwo(): Promise<T | null> {
    return this._findNthWithLimit(41);
  }

  /**
   * Return the second-to-last record.
   *
   * Mirrors: ActiveRecord::Relation#second_to_last
   */
  async secondToLast(): Promise<T | null> {
    return this._findNthFromLast(1);
  }

  /**
   * Return the third-to-last record.
   *
   * Mirrors: ActiveRecord::Relation#third_to_last
   */
  async thirdToLast(): Promise<T | null> {
    return this._findNthFromLast(2);
  }

  private async _findNthWithLimit(index: number): Promise<T | null> {
    const rel = this._clone();
    rel._limitValue = 1;
    rel._offsetValue = (this._offsetValue ?? 0) + index;
    if (rel._orderClauses.length === 0 && rel._rawOrderClauses.length === 0) {
      rel._orderClauses.push(this._modelClass.primaryKey as string);
    }
    const records = await rel.toArray();
    return records[0] ?? null;
  }

  private async _findNthFromLast(index: number): Promise<T | null> {
    let rel: Relation<T>;
    if (this._orderClauses.length === 0 && this._rawOrderClauses.length === 0) {
      rel = this.order({ [this._modelClass.primaryKey as string]: "desc" as const });
    } else {
      rel = this.reverseOrder();
    }
    const result = await (rel as any)._findNthWithLimit(index);
    return result;
  }

  /**
   * Return a record without any implicit ordering.
   *
   * Mirrors: ActiveRecord::Relation#take
   */
  async take(limit?: number): Promise<T | T[] | null> {
    const rel = this._clone();
    if (limit !== undefined) {
      rel._limitValue = limit;
      return rel.toArray();
    }
    rel._limitValue = 1;
    const records = await rel.toArray();
    return records[0] ?? null;
  }

  /**
   * Return a record without ordering, or throw if none found.
   *
   * Mirrors: ActiveRecord::Relation#take!
   */
  async takeBang(): Promise<T> {
    const record = await this.take();
    if (!record) {
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    }
    return record as T;
  }

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

  /**
   * Count records. Optionally count a specific column (ignores NULLs).
   * When used with group(), returns a Record keyed by group value.
   *
   * Mirrors: ActiveRecord::Relation#count
   */
  async count(column?: string): Promise<number | Record<string, number>> {
    if (this._limitValue === 0) return 0;
    if (this._isNone) return this._groupColumns.length > 0 ? {} : 0;

    // Grouped count: SELECT group_col, COUNT(*) FROM ... GROUP BY group_col
    if (this._groupColumns.length > 0) {
      return this._groupedAggregate("COUNT", column ?? "*");
    }

    // When limit is set, fetch all matching rows then count (simulates COUNT(*) of subquery with LIMIT)
    if (this._limitValue !== null) {
      const rows = await this.toArray();
      return rows.length;
    }

    const table = this._modelClass.arelTable;
    let countExpr: string;
    if (column) {
      const isDistinct = this._isDistinct;
      countExpr = isDistinct
        ? `COUNT(DISTINCT "${table.name}"."${column}") AS count`
        : `COUNT("${table.name}"."${column}") AS count`;
    } else {
      countExpr = this._isDistinct
        ? `COUNT(DISTINCT "${table.name}"."${this._modelClass.primaryKey}") AS count`
        : "COUNT(*) AS count";
    }
    const manager = table.project(countExpr);
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);

    const sql = manager.toSql();
    const rows = await this._modelClass.adapter.execute(sql);
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Sum a column.
   * When used with group(), returns a Record keyed by group value.
   *
   * Mirrors: ActiveRecord::Relation#sum
   */
  async sum(column?: string): Promise<number | Record<string, number>> {
    if (this._isNone) return this._groupColumns.length > 0 ? {} : 0;
    if (!column) return 0;
    if (this._groupColumns.length > 0) {
      return this._groupedAggregate("SUM", column);
    }
    const result = await this._aggregate("SUM", column);
    return result ?? 0;
  }

  /**
   * Average a column.
   * When used with group(), returns a Record keyed by group value.
   *
   * Mirrors: ActiveRecord::Relation#average
   */
  async average(column: string): Promise<number | null | Record<string, number>> {
    if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
    if (this._groupColumns.length > 0) {
      return this._groupedAggregate("AVG", column);
    }
    return this._aggregate("AVG", column);
  }

  /**
   * Minimum value of a column.
   * When used with group(), returns a Record keyed by group value.
   *
   * Mirrors: ActiveRecord::Relation#minimum
   */
  async minimum(column: string): Promise<unknown | Record<string, unknown>> {
    if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
    if (this._groupColumns.length > 0) {
      return this._groupedAggregate("MIN", column);
    }
    return this._aggregate("MIN", column);
  }

  /**
   * Maximum value of a column.
   * When used with group(), returns a Record keyed by group value.
   *
   * Mirrors: ActiveRecord::Relation#maximum
   */
  async maximum(column: string): Promise<unknown | Record<string, unknown>> {
    if (this._isNone) return this._groupColumns.length > 0 ? {} : null;
    if (this._groupColumns.length > 0) {
      return this._groupedAggregate("MAX", column);
    }
    return this._aggregate("MAX", column);
  }

  private async _groupedAggregate(fn: string, column: string): Promise<Record<string, number>> {
    const table = this._modelClass.arelTable;
    const groupCol = this._groupColumns[0]; // Support single group column
    const aggExpr =
      column === "*" ? `${fn}(*) AS val` : `${fn}("${table.name}"."${column}") AS val`;
    const manager = table.project(`"${table.name}"."${groupCol}" AS group_key, ${aggExpr}`);
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);
    manager.group(groupCol);

    let sql = manager.toSql();
    if (this._limitValue !== null) sql += ` LIMIT ${this._limitValue}`;
    if (this._offsetValue !== null) sql += ` OFFSET ${this._offsetValue}`;
    const rows = await this._modelClass.adapter.execute(sql);

    const result: Record<string, number> = {};
    for (const row of rows) {
      const key = String(row.group_key ?? "null");
      result[key] = Number(row.val ?? 0);
    }
    return result;
  }

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

  private async _aggregate(fn: string, column: string): Promise<number | null> {
    const table = this._modelClass.arelTable;
    const projection = this._isDistinct
      ? `${fn}(DISTINCT "${table.name}"."${column}") AS val`
      : `${fn}("${table.name}"."${column}") AS val`;
    const manager = table.project(projection);
    this._applyJoinsToManager(manager);
    this._applyWheresToManager(manager, table);

    const sql = manager.toSql();
    const rows = await this._modelClass.adapter.execute(sql);
    const val = rows[0]?.val;
    return val === undefined || val === null ? null : Number(val);
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
    const setClauses = Object.entries(updates)
      .map(([key, val]) => {
        if (val === null) return `"${key}" = NULL`;
        if (typeof val === "number") return `"${key}" = ${val}`;
        if (typeof val === "boolean") return `"${key}" = ${val ? "TRUE" : "FALSE"}`;
        return `"${key}" = '${String(val).replace(/'/g, "''")}'`;
      })
      .join(", ");

    let sql = `UPDATE "${table.name}" SET ${setClauses}`;

    const whereConditions = this._buildWhereStrings(table);
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }

    return this._modelClass.adapter.executeMutation(sql);
  }

  /**
   * Destroy all matching records (runs callbacks on each record).
   *
   * Mirrors: ActiveRecord::Relation#destroy_all
   */
  async destroyAll(): Promise<T[]> {
    const records = await this.toArray();
    for (const record of records) {
      await record.destroy();
    }
    return records;
  }

  /**
   * Delete all matching records.
   *
   * Mirrors: ActiveRecord::Relation#delete_all
   */
  async deleteAll(): Promise<number> {
    if (this._isNone) return 0;

    const table = this._modelClass.arelTable;
    let sql = `DELETE FROM "${table.name}"`;

    const whereConditions = this._buildWhereStrings(table);
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }

    return this._modelClass.adapter.executeMutation(sql);
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
    const setClauses = Object.entries(updates)
      .map(([key, val]) => `"${key}" = ${val}`)
      .join(", ");

    let sql = `UPDATE "${table.name}" SET ${setClauses}`;

    const whereConditions = this._buildWhereStrings(table);
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }

    return this._modelClass.adapter.executeMutation(sql);
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
    const records = await this.where(conditions).limit(1).toArray();
    if (records.length > 0) return records[0];
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
    const records = await this.limit(1).toArray();
    if (records.length > 0) return records[0];
    return this._modelClass.create({ ...this._scopeAttributes(), ...extra }) as Promise<T>;
  }

  /**
   * Find the first record matching the current where chain, or create one (raises on validation failure).
   *
   * Mirrors: ActiveRecord::Relation#first_or_create!
   */
  async firstOrCreateBang(extra?: Record<string, unknown>): Promise<T> {
    const records = await this.limit(1).toArray();
    if (records.length > 0) return records[0];
    return this._modelClass.createBang({ ...this._scopeAttributes(), ...extra }) as Promise<T>;
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
    if (records.length === 0) return 0;

    // Merge scope attributes (from where() and createWith()) into each record
    const scopeAttrs = { ...this._createWithAttrs, ...this._scopeAttributes() };
    const mergedRecords = records.map((r) => ({ ...scopeAttrs, ...r }));

    const table = this._modelClass.arelTable;
    const columns = Object.keys(mergedRecords[0]);
    const colList = columns.map((c) => `"${c}"`).join(", ");

    const valueRows = mergedRecords.map((row) => {
      const vals = columns.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
        if (v instanceof Date) return `'${v.toISOString()}'`;
        if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      return `(${vals.join(", ")})`;
    });

    let sql = `INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")}`;

    if (options?.uniqueBy) {
      const uniqueCols = Array.isArray(options.uniqueBy) ? options.uniqueBy : [options.uniqueBy];
      if (process.env.MYSQL_TEST_URL) {
        sql = `INSERT IGNORE INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")}`;
      } else {
        sql += ` ON CONFLICT (${uniqueCols.map((c) => `"${c}"`).join(", ")}) DO NOTHING`;
      }
    }

    return this._modelClass.adapter.executeMutation(sql);
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
      onDuplicate?: unknown;
    },
  ): Promise<number> {
    if (options?.onDuplicate !== undefined && options?.updateOnly !== undefined) {
      throw new Error("Cannot use both onDuplicate and updateOnly");
    }

    if (records.length === 0) return 0;

    // Merge scope attributes into each record
    const scopeAttrs = { ...this._createWithAttrs, ...this._scopeAttributes() };
    const mergedRecords = records.map((r) => ({ ...scopeAttrs, ...r }));

    const table = this._modelClass.arelTable;
    const columns = Object.keys(mergedRecords[0]);
    const colList = columns.map((c) => `"${c}"`).join(", ");

    const valueRows = mergedRecords.map((row) => {
      const vals = columns.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
        if (v instanceof Date) return `'${v.toISOString()}'`;
        if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      return `(${vals.join(", ")})`;
    });

    const pk = this._modelClass.primaryKey;
    const uniqueCols = options?.uniqueBy
      ? Array.isArray(options.uniqueBy)
        ? options.uniqueBy
        : [options.uniqueBy]
      : Array.isArray(pk)
        ? pk
        : [pk];

    let sql: string;
    const isMysql = !!process.env.MYSQL_TEST_URL;

    if (options?.onDuplicate === "skip") {
      if (isMysql) {
        sql = `INSERT IGNORE INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")}`;
      } else {
        const conflictTarget = `ON CONFLICT (${uniqueCols.map((c) => `"${c}"`).join(", ")})`;
        sql = `INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")} ${conflictTarget} DO NOTHING`;
      }
    } else {
      // updateOnly restricts which columns get updated on conflict
      let updateCols: string[];
      if (options?.updateOnly) {
        const only = Array.isArray(options.updateOnly) ? options.updateOnly : [options.updateOnly];
        updateCols = only;
      } else {
        updateCols = columns.filter((c) => !uniqueCols.includes(c));
      }

      if (isMysql) {
        const updateClause =
          updateCols.length > 0
            ? updateCols.map((c) => `"${c}" = VALUES("${c}")`).join(", ")
            : `"${columns[0]}" = VALUES("${columns[0]}")`;
        sql = `INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")} ON DUPLICATE KEY UPDATE ${updateClause}`;
      } else {
        const conflictTarget = `ON CONFLICT (${uniqueCols.map((c) => `"${c}"`).join(", ")})`;
        const updateClause =
          updateCols.length > 0
            ? updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")
            : `"${columns[0]}" = EXCLUDED."${columns[0]}"`;
        sql = `INSERT INTO "${table.name}" (${colList}) VALUES ${valueRows.join(", ")} ${conflictTarget} DO UPDATE SET ${updateClause}`;
      }
    }

    return this._modelClass.adapter.executeMutation(sql);
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
  get selectValues(): string[] {
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
    return [...this._whereClauses];
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
    const attrs: Record<string, unknown> = {};
    for (const clause of this._whereClauses) {
      for (const [key, value] of Object.entries(clause)) {
        if (value !== null && !Array.isArray(value) && !(value instanceof Range)) {
          attrs[key] = value;
        }
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
    batchSize = 1000,
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

    while (true) {
      const rel = this._clone();
      rel._limitValue = batchSize;
      rel._offsetValue = currentOffset;
      rel._loaded = false;

      // Ensure deterministic ordering; support custom order direction (Rails 7.1)
      if (rel._orderClauses.length === 0) {
        rel._orderClauses.push(order ? [pk as string, order] : (pk as string));
      }

      // Apply start/finish range constraints
      if (start !== undefined) {
        const startQuoted = typeof start === "number" ? String(start) : `'${start}'`;
        rel._whereRawClauses.push(`"${this._modelClass.arelTable.name}"."${pk}" >= ${startQuoted}`);
      }
      if (finish !== undefined) {
        const finishQuoted = typeof finish === "number" ? String(finish) : `'${finish}'`;
        rel._whereRawClauses.push(
          `"${this._modelClass.arelTable.name}"."${pk}" <= ${finishQuoted}`,
        );
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
    batchSize = 1000,
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
   * Yields Relations scoped to each batch. Unlike findInBatches which yields
   * arrays of records, this yields Relation objects that can be further refined.
   *
   * Mirrors: ActiveRecord::Batches#in_batches
   */
  async *inBatches({ batchSize = 1000 }: { batchSize?: number } = {}): AsyncGenerator<Relation<T>> {
    const pk = this._modelClass.primaryKey;
    let lastId: unknown = null;

    while (true) {
      const rel = this._clone();
      if (lastId !== null) {
        const pkQuoted = typeof lastId === "number" ? String(lastId) : `'${lastId}'`;
        rel._whereRawClauses.push(`"${this._modelClass.arelTable.name}"."${pk}" > ${pkQuoted}`);
      }
      rel._orderClauses = [pk as string];
      rel._limitValue = batchSize;

      const records = await rel.toArray();
      if (records.length === 0) break;

      // Create a scoped relation for just these PKs
      const ids = records.map((r) => (r as any).id);
      const batchRel = this._clone();
      batchRel._whereClauses.push({ [pk as string]: ids });
      yield batchRel;

      if (records.length < batchSize) break;
      lastId = (records[records.length - 1] as any).id;
    }
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

    let sql = manager.toSql();

    // Replace FROM clause if from() was used
    if (this._fromClause) {
      sql = sql.replace(/FROM\s+"[^"]+"/, `FROM ${this._fromClause}`);
    }

    // Insert optimizer hints after SELECT
    if (this._optimizerHints.length > 0) {
      const hints = `/*+ ${this._optimizerHints.join(" ")} */`;
      sql = sql.replace(/^SELECT/, `SELECT ${hints}`);
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

  private _resolveColumn(table: Table, key: string): Nodes.Attribute {
    if (key.includes('"')) return table.get(key);
    const firstDot = key.indexOf(".");
    if (firstDot === -1) return table.get(key);
    const secondDot = key.indexOf(".", firstDot + 1);
    if (secondDot !== -1) return table.get(key);
    return new Table(key.slice(0, firstDot)).get(key.slice(firstDot + 1));
  }

  private _buildWhereNodes(
    table: Table,
    whereClauses: Array<Record<string, unknown>>,
    whereNotClauses: Array<Record<string, unknown>>,
  ): Nodes.Node[] {
    const nodes: Nodes.Node[] = [];
    for (const clause of whereClauses) {
      for (const [key, value] of Object.entries(clause)) {
        const attr = this._resolveColumn(table, key);
        if (value === null) {
          nodes.push(attr.isNull());
        } else if (value instanceof Range) {
          if (value.excludeEnd) {
            nodes.push(attr.gteq(value.begin));
            nodes.push(attr.lt(value.end));
          } else {
            nodes.push(attr.between(value.begin, value.end));
          }
        } else if (Array.isArray(value)) {
          nodes.push(attr.in(value));
        } else {
          nodes.push(attr.eq(value));
        }
      }
    }
    for (const clause of whereNotClauses) {
      for (const [key, value] of Object.entries(clause)) {
        const attr = this._resolveColumn(table, key);
        if (value === null) {
          nodes.push(attr.isNotNull());
        } else if (value instanceof Range) {
          nodes.push(attr.notBetween(value.begin, value.end));
        } else if (Array.isArray(value)) {
          nodes.push(attr.notIn(value));
        } else {
          nodes.push(attr.notEq(value));
        }
      }
    }
    return nodes;
  }

  private _combineNodes(nodes: Nodes.Node[]): Nodes.Node | null {
    if (nodes.length === 0) return null;
    if (nodes.length === 1) return nodes[0];
    return new Nodes.And(nodes);
  }

  private _applyWheresToManager(manager: SelectManager, table: Table): void {
    if (this._orRelations.length > 0) {
      // Collect all branches: this relation's wheres + each OR relation's wheres
      const allBranches: (Nodes.Node | null)[] = [
        this._combineNodes(this._buildWhereNodes(table, this._whereClauses, this._whereNotClauses)),
      ];
      for (const orRel of this._orRelations) {
        allBranches.push(
          this._combineNodes(
            this._buildWhereNodes(table, orRel._whereClauses, orRel._whereNotClauses),
          ),
        );
      }
      const nonNull = allBranches.filter((n): n is Nodes.Node => n !== null);
      if (nonNull.length > 0) {
        const combined = nonNull.reduce((left, right) => new Nodes.Or(left, right));
        manager.where(new Nodes.Grouping(combined));
      }
      return;
    }

    for (const clause of this._whereClauses) {
      for (const [key, value] of Object.entries(clause)) {
        const attr = this._resolveColumn(table, key);
        if (value === null) {
          manager.where(attr.isNull());
        } else if (value instanceof Range) {
          if (value.excludeEnd) {
            manager.where(attr.gteq(value.begin));
            manager.where(attr.lt(value.end));
          } else {
            manager.where(attr.between(value.begin, value.end));
          }
        } else if (Array.isArray(value)) {
          manager.where(attr.in(value));
        } else {
          manager.where(attr.eq(value));
        }
      }
    }
    for (const clause of this._whereNotClauses) {
      for (const [key, value] of Object.entries(clause)) {
        const attr = this._resolveColumn(table, key);
        if (value === null) {
          manager.where(attr.isNotNull());
        } else if (value instanceof Range) {
          manager.where(attr.notBetween(value.begin, value.end));
        } else if (Array.isArray(value)) {
          manager.where(attr.notIn(value));
        } else {
          manager.where(attr.notEq(value));
        }
      }
    }
    // Raw SQL WHERE clauses
    for (const rawClause of this._whereRawClauses) {
      manager.where(new Nodes.SqlLiteral(rawClause));
    }
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

  private _buildWhereStrings(table: Table): string[] {
    const conditions: string[] = [];
    for (const clause of this._whereClauses) {
      for (const [key, value] of Object.entries(clause)) {
        const { tbl, col } = this._qualifiedCol(table, key);
        if (value === null) {
          conditions.push(`"${tbl}"."${col}" IS NULL`);
        } else if (value instanceof Range) {
          const begin =
            typeof value.begin === "number"
              ? String(value.begin)
              : `'${String(value.begin).replace(/'/g, "''")}'`;
          const end =
            typeof value.end === "number"
              ? String(value.end)
              : `'${String(value.end).replace(/'/g, "''")}'`;
          if (value.excludeEnd) {
            conditions.push(`"${tbl}"."${col}" >= ${begin} AND "${tbl}"."${col}" < ${end}`);
          } else {
            conditions.push(`"${tbl}"."${col}" BETWEEN ${begin} AND ${end}`);
          }
        } else if (typeof value === "boolean") {
          conditions.push(`"${tbl}"."${col}" = ${value ? "TRUE" : "FALSE"}`);
        } else if (typeof value === "number") {
          conditions.push(`"${tbl}"."${col}" = ${value}`);
        } else if (Array.isArray(value)) {
          const vals = value
            .map((v) => {
              if (v === null) return "NULL";
              if (typeof v === "number") return String(v);
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(", ");
          conditions.push(`"${tbl}"."${col}" IN (${vals})`);
        } else {
          conditions.push(`"${tbl}"."${col}" = '${String(value).replace(/'/g, "''")}'`);
        }
      }
    }
    for (const clause of this._whereNotClauses) {
      for (const [key, value] of Object.entries(clause)) {
        const { tbl, col } = this._qualifiedCol(table, key);
        if (value === null) {
          conditions.push(`"${tbl}"."${col}" IS NOT NULL`);
        } else if (value instanceof Range) {
          const begin =
            typeof value.begin === "number"
              ? String(value.begin)
              : `'${String(value.begin).replace(/'/g, "''")}'`;
          const end =
            typeof value.end === "number"
              ? String(value.end)
              : `'${String(value.end).replace(/'/g, "''")}'`;
          conditions.push(`NOT ("${tbl}"."${col}" BETWEEN ${begin} AND ${end})`);
        } else if (typeof value === "boolean") {
          conditions.push(`"${tbl}"."${col}" != ${value ? "TRUE" : "FALSE"}`);
        } else if (typeof value === "number") {
          conditions.push(`"${tbl}"."${col}" != ${value}`);
        } else if (Array.isArray(value)) {
          const vals = value
            .map((v) => {
              if (v === null) return "NULL";
              if (typeof v === "number") return String(v);
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(", ");
          conditions.push(`"${tbl}"."${col}" NOT IN (${vals})`);
        } else {
          conditions.push(`"${tbl}"."${col}" != '${String(value).replace(/'/g, "''")}'`);
        }
      }
    }
    // Raw SQL WHERE clauses
    for (const rawClause of this._whereRawClauses) {
      conditions.push(rawClause);
    }
    return conditions;
  }

  private async _preloadAssociationsForRecords(records: T[], assocNames: string[]): Promise<void> {
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
        const singularize = (w: string) => {
          if (w.endsWith("ies")) return w.slice(0, -3) + "y";
          if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
          if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
          return w;
        };
        const camelize = (n: string) =>
          n
            .split("_")
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join("");
        const underscore = (n: string) =>
          n
            .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
            .replace(/([a-z\d])([A-Z])/g, "$1_$2")
            .toLowerCase();
        const pluralize = (w: string) => {
          if (w.endsWith("y") && !/[aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
          if (
            w.endsWith("s") ||
            w.endsWith("x") ||
            w.endsWith("z") ||
            w.endsWith("ch") ||
            w.endsWith("sh")
          )
            return w + "es";
          return w + "s";
        };

        const className = assocDef.options.className ?? camelize(singularize(assocName));
        const asName = assocDef.options.as;
        const foreignKey = asName
          ? (assocDef.options.foreignKey ?? `${underscore(asName)}_id`)
          : (assocDef.options.foreignKey ?? `${underscore(modelClass.name)}_id`);
        const typeCol = asName ? `${underscore(asName)}_type` : null;
        const primaryKey = assocDef.options.primaryKey ?? modelClass.primaryKey;

        // Handle through associations
        if (assocDef.options.through) {
          const throughAssocDef = associations.find(
            (a: any) => a.name === assocDef.options.through,
          );
          if (!throughAssocDef) continue;

          const throughClassName =
            throughAssocDef.options.className ?? camelize(singularize(throughAssocDef.name));
          const throughModel = _mr.get(throughClassName);
          if (!throughModel) continue;

          // Determine FK for loading through records
          const throughAsName = throughAssocDef.options.as;
          const throughFk = throughAsName
            ? (throughAssocDef.options.foreignKey ?? `${underscore(throughAsName)}_id`)
            : (throughAssocDef.options.foreignKey ?? `${underscore(modelClass.name)}_id`);
          const pkValues = [
            ...new Set(records.map((r) => r.readAttribute(primaryKey)).filter((v) => v != null)),
          ];
          if (pkValues.length === 0) continue;

          const sourceName = assocDef.options.source ?? singularize(assocName);

          // Look up the source association on the through model (try singular and plural)
          const throughModelAssociations: any[] = (throughModel as any)._associations ?? [];
          const sourceAssocDef =
            throughModelAssociations.find((a: any) => a.name === sourceName) ??
            throughModelAssociations.find((a: any) => a.name === pluralize(sourceName));
          const sourceAssocKind = sourceAssocDef?.type ?? "belongsTo";

          const throughWhereConditions: Record<string, unknown> = { [throughFk]: pkValues };
          if (throughAsName)
            throughWhereConditions[`${underscore(throughAsName)}_type`] = modelClass.name;

          // Push sourceType filter into the DB query instead of filtering in-memory
          if (
            assocDef.options.sourceType &&
            sourceAssocDef?.options?.polymorphic &&
            sourceAssocKind === "belongsTo"
          ) {
            const resolvedSourceName = sourceAssocDef?.name ?? sourceName;
            const sourceTypeCol = `${underscore(resolvedSourceName)}_type`;
            throughWhereConditions[sourceTypeCol] = assocDef.options.sourceType;
          }

          const throughRecords = await (throughModel as any)
            ._allForPreload()
            .where(throughWhereConditions)
            .toArray();

          const targetModel = _mr.get(className);
          if (!targetModel) continue;

          let targetRecords: any[];
          let targetMap: Map<unknown, any>;
          let getTargetsForThrough: (throughRec: any) => any[];

          if (sourceAssocKind === "belongsTo") {
            // Through record has FK pointing to target (e.g., tagging.tag_id -> tag.id)
            const targetFk = sourceAssocDef?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
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
              ? (sourceAssocDef?.options?.foreignKey ?? `${underscore(sourceAsName)}_id`)
              : (sourceAssocDef?.options?.foreignKey ?? `${underscore(throughClassName)}_id`);
            const throughIds = [
              ...new Set(
                throughRecords.map((r: any) => r.readAttribute("id")).filter((v: any) => v != null),
              ),
            ];
            const sourceWhereConditions: Record<string, unknown> = { [sourceFk]: throughIds };
            if (sourceAsName)
              sourceWhereConditions[`${underscore(sourceAsName)}_type`] = throughClassName;
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
        const underscore = (n: string) =>
          n
            .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
            .replace(/([a-z\d])([A-Z])/g, "$1_$2")
            .toLowerCase();
        const camelize = (n: string) =>
          n
            .split("_")
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join("");
        const singularize = (w: string) => {
          if (w.endsWith("ies")) return w.slice(0, -3) + "y";
          if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
          if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
          return w;
        };

        const className = assocDef.options.className ?? camelize(assocName);
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
              ? camelize(singularize(throughAssocDef.name))
              : camelize(throughAssocDef.name));
          const throughModel = _mr.get(throughClassName);
          if (!throughModel) continue;

          const throughAsName = throughAssocDef.options.as;
          const throughFk = throughAsName
            ? (throughAssocDef.options.foreignKey ?? `${underscore(throughAsName)}_id`)
            : (throughAssocDef.options.foreignKey ?? `${underscore(modelClass.name)}_id`);
          const pkValues = [
            ...new Set(records.map((r) => r.readAttribute(primaryKey)).filter((v) => v != null)),
          ];
          if (pkValues.length === 0) continue;

          const throughWhereConditions: Record<string, unknown> = { [throughFk]: pkValues };
          if (throughAsName)
            throughWhereConditions[`${underscore(throughAsName)}_type`] = modelClass.name;
          const throughRecords = await (throughModel as any)
            ._allForPreload()
            .where(throughWhereConditions)
            .toArray();

          const sourceName = assocDef.options.source ?? assocName;
          const targetModel = _mr.get(className);
          if (!targetModel) continue;

          // Look up source association on through model
          const throughModelAssociations: any[] = (throughModel as any)._associations ?? [];
          const pluralizeHot = (w: string) => {
            if (w.endsWith("y") && !/[aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
            if (
              w.endsWith("s") ||
              w.endsWith("x") ||
              w.endsWith("z") ||
              w.endsWith("ch") ||
              w.endsWith("sh")
            )
              return w + "es";
            return w + "s";
          };
          const sourceAssocDef =
            throughModelAssociations.find((a: any) => a.name === sourceName) ??
            throughModelAssociations.find((a: any) => a.name === pluralizeHot(sourceName));

          const targetFk = sourceAssocDef?.options?.foreignKey ?? `${underscore(sourceName)}_id`;
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
          ? (assocDef.options.foreignKey ?? `${underscore(hasOneAsName)}_id`)
          : (assocDef.options.foreignKey ?? `${underscore(modelClass.name)}_id`);
        const hasOneTypeCol = hasOneAsName ? `${underscore(hasOneAsName)}_type` : null;

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
        const pkList = pkValues
          .map((v) => (typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`))
          .join(", ");
        const joinRows = await modelClass.adapter.execute(
          `SELECT "${ownerFk}", "${targetFk}" FROM "${joinTable}" WHERE "${ownerFk}" IN (${pkList})`,
        );

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

  // -- Finder methods --

  /**
   * Find records by primary key.
   *
   * Mirrors: ActiveRecord::Relation#find
   */
  async find(...ids: unknown[]): Promise<T | T[]> {
    const pk = this._modelClass.primaryKey;
    if (ids.length === 1 && !Array.isArray(ids[0])) {
      const records = await this.where({ [pk as string]: ids[0] })
        .limit(1)
        .toArray();
      if (records.length === 0) {
        throw new RecordNotFound(
          `Couldn't find ${this._modelClass.name} with '${pk}'=${ids[0]}`,
          this._modelClass.name,
          pk as string,
          ids[0],
        );
      }
      return records[0];
    }
    const flatIds = ids.flat();
    if (flatIds.length === 0) {
      throw new RecordNotFound(
        `Couldn't find ${this._modelClass.name} with an empty list of ids`,
        this._modelClass.name,
        pk as string,
        [],
      );
    }
    const records = await this.where({ [pk as string]: flatIds }).toArray();
    if (records.length !== flatIds.length) {
      throw new RecordNotFound(
        `Couldn't find all ${this._modelClass.name} with '${pk}': (${flatIds.join(", ")})`,
        this._modelClass.name,
        pk as string,
        flatIds,
      );
    }
    return records;
  }

  /**
   * Find the first record matching conditions.
   *
   * Mirrors: ActiveRecord::Relation#find_by
   */
  async findBy(conditions: Record<string, unknown>): Promise<T | null> {
    const records = await this.where(conditions).limit(1).toArray();
    return records[0] ?? null;
  }

  /**
   * Find the first record matching conditions, or throw.
   *
   * Mirrors: ActiveRecord::Relation#find_by!
   */
  async findByBang(conditions: Record<string, unknown>): Promise<T> {
    const record = await this.findBy(conditions);
    if (!record) {
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    }
    return record;
  }

  /**
   * Find the sole record matching conditions.
   *
   * Mirrors: ActiveRecord::Relation#find_sole_by
   */
  async findSoleBy(conditions: Record<string, unknown>): Promise<T> {
    return this.where(conditions).sole();
  }

  /**
   * Find or create, raising on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#find_or_create_by!
   */
  async findOrCreateByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    const records = await this.where(conditions).limit(1).toArray();
    if (records.length > 0) return records[0];
    return this._modelClass.createBang({
      ...this._createWithAttrs,
      ...this._scopeAttributes(),
      ...conditions,
      ...extra,
    }) as Promise<T>;
  }

  /**
   * Try to create first; if uniqueness violation, find. Raises on validation failure.
   *
   * Mirrors: ActiveRecord::Relation#create_or_find_by!
   */
  async createOrFindByBang(
    conditions: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return (await this._modelClass.createBang({
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

  // -- Bang ordinal methods --

  /**
   * Mirrors: ActiveRecord::Relation#second!
   */
  async secondBang(): Promise<T> {
    const record = await this.second();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Relation#third!
   */
  async thirdBang(): Promise<T> {
    const record = await this.third();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Relation#fourth!
   */
  async fourthBang(): Promise<T> {
    const record = await this.fourth();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Relation#fifth!
   */
  async fifthBang(): Promise<T> {
    const record = await this.fifth();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Relation#forty_two!
   */
  async fortyTwoBang(): Promise<T> {
    const record = await this.fortyTwo();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Relation#second_to_last!
   */
  async secondToLastBang(): Promise<T> {
    const record = await this.secondToLast();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  /**
   * Mirrors: ActiveRecord::Relation#third_to_last!
   */
  async thirdToLastBang(): Promise<T> {
    const record = await this.thirdToLast();
    if (!record)
      throw new RecordNotFound(`${this._modelClass.name} not found`, this._modelClass.name);
    return record;
  }

  // -- CTE support --

  /**
   * Add a Common Table Expression (WITH clause).
   *
   * Mirrors: ActiveRecord::Relation#with
   */
  with(..._ctes: Array<Record<string, Relation<any> | string>>): Relation<T> {
    const rel = this._clone();
    for (const cte of _ctes) {
      for (const [name, query] of Object.entries(cte)) {
        const sql = typeof query === "string" ? query : query.toSql();
        rel._ctes.push({ name, sql, recursive: false });
      }
    }
    return rel;
  }

  /**
   * Add a recursive Common Table Expression (WITH RECURSIVE clause).
   *
   * Mirrors: ActiveRecord::Relation#with_recursive
   */
  withRecursive(...ctes: Array<Record<string, Relation<any> | string>>): Relation<T> {
    const rel = this._clone();
    for (const cte of ctes) {
      for (const [name, query] of Object.entries(cte)) {
        const sql = typeof query === "string" ? query : query.toSql();
        rel._ctes.push({ name, sql, recursive: true });
      }
    }
    return rel;
  }

  // -- Other query methods --

  /**
   * Add table references for eager loading.
   *
   * Mirrors: ActiveRecord::Relation#references
   */
  references(..._tables: string[]): Relation<T> {
    // In our implementation, references is a hint for the query planner.
    // We store them but they don't affect SQL generation directly.
    return this._clone();
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
    const setClauses = Object.entries(counters)
      .map(([key, val]) => `"${key}" = COALESCE("${key}", 0) + ${val}`)
      .join(", ");
    let sql = `UPDATE "${table.name}" SET ${setClauses}`;
    const whereConditions = this._buildWhereStrings(table);
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(" AND ")}`;
    }
    return this._modelClass.adapter.executeMutation(sql);
  }

  /**
   * Delete a record by primary key (no callbacks).
   *
   * Mirrors: ActiveRecord::Relation#delete
   */
  async delete(id: unknown): Promise<number> {
    const table = this._modelClass.arelTable;
    const pk = this._modelClass.primaryKey;
    const quoted = typeof id === "number" ? String(id) : `'${String(id).replace(/'/g, "''")}'`;
    return this._modelClass.adapter.executeMutation(
      `DELETE FROM "${table.name}" WHERE "${pk}" = ${quoted}`,
    );
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
  get table(): any {
    return this._modelClass.arelTable;
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

  /** @internal */
  _clone(): Relation<T> {
    const rel = new Relation<T>(this._modelClass);
    rel._whereClauses = [...this._whereClauses];
    rel._whereNotClauses = [...this._whereNotClauses];
    rel._whereRawClauses = [...this._whereRawClauses];
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
    return wrapWithScopeProxy(rel);
  }
}

/**
 * Wrap a Relation in a Proxy that delegates scope names
 * to the model's registered scopes.
 */
function wrapWithScopeProxy<T extends Base>(rel: Relation<T>): Relation<T> {
  return new Proxy(rel, {
    get(target: any, prop: string | symbol, receiver: any) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "symbol") return value;
      if (value !== undefined) return value;
      if (prop in target) return value;

      // Check if this is a scope on the model class
      const modelClass = target._modelClass as typeof Base;
      if (modelClass._scopes.has(prop as string)) {
        return (...args: any[]) => {
          const scopeFn = modelClass._scopes.get(prop as string)!;
          const result = scopeFn(target, ...args);
          // Apply scope extensions if any
          const extensions = modelClass._scopeExtensions?.get(prop as string);
          if (extensions && result && typeof result === "object") {
            for (const [name, fn] of Object.entries(extensions)) {
              (result as any)[name] = fn.bind(result);
            }
          }
          return result;
        };
      }
      return value;
    },
  });
}

// Register Relation with Base to break the circular dependency.
_setRelationCtor(Relation as any);
_setScopeProxyWrapper(wrapWithScopeProxy);
