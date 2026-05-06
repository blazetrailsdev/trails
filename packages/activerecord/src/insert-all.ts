import { Temporal } from "@blazetrails/activesupport/temporal";
import { Nodes, Visitors } from "@blazetrails/arel";
import { SerializeCastValue } from "@blazetrails/activemodel";
import type { Base } from "./base.js";
import { quoteSqlValue } from "./base.js";
import { stiName } from "./inheritance.js";
import type { Relation } from "./relation.js";
import type { AdapterName } from "./adapter.js";

type ModelClass = typeof Base;
type AdapterDialect = AdapterName;

const TIMESTAMP_COLUMNS = ["created_at", "updated_at"] as const;
const UPDATE_TIMESTAMP_COLUMNS = ["updated_at"] as const;

// Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#column_name_with_order_matcher
// Allows safe column names (optionally table-qualified, with optional ASC/DESC/NULLS).
// Used by disallowRawSqlBang to distinguish Ruby-symbol-equivalent strings from raw SQL.
const COLUMN_NAME_WITH_ORDER =
  /^\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?[\w,\s]*)\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?[\w,\s]*)\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*\s*$/i;

export interface InsertAllOptions {
  onDuplicate?: "skip" | "update" | Nodes.SqlLiteral;
  updateOnly?: string | string[];
  uniqueBy?: string | string[];
  returning?: string | string[] | Nodes.SqlLiteral | false;
  recordTimestamps?: boolean;
}

export class InsertAll {
  readonly model: ModelClass;
  readonly connection: ModelClass["adapter"];
  readonly inserts: Record<string, unknown>[];
  readonly keys: Set<string>;
  readonly uniqueBy: string | string[] | undefined;
  readonly returning: string | string[] | Nodes.SqlLiteral | false;

  onDuplicate: "skip" | "update" | undefined;
  updateOnly: string | string[] | undefined;
  updateSql: Nodes.SqlLiteral | undefined;

  private _scopeAttributes: Record<string, unknown>;
  private _recordTimestamps: boolean;
  private _updatableColumns: string[] | undefined;
  private _keysIncludingTimestamps: Set<string> | undefined;

  static async execute(
    relation: Relation<any>,
    inserts: Record<string, unknown>[],
    options: InsertAllOptions = {},
  ): Promise<number> {
    const model = (relation as any)._modelClass as ModelClass;
    const ia = new InsertAll(relation, model.adapter, inserts, options);
    return ia.execute();
  }

  constructor(
    relation: Relation<any>,
    connection: ModelClass["adapter"],
    inserts: Record<string, unknown>[],
    options: InsertAllOptions = {},
  ) {
    this.model = (relation as any)._modelClass as ModelClass;
    this.connection = connection;
    this.inserts = inserts.map((r) => ({ ...r }));
    this.updateOnly = options.updateOnly;
    this.uniqueBy = options.uniqueBy;
    this._recordTimestamps = options.recordTimestamps ?? this.model.recordTimestamps;
    this.updateSql = undefined;
    this.onDuplicate = undefined;

    if (options.onDuplicate !== undefined) this.disallowRawSqlBang(options.onDuplicate);
    if (options.returning !== undefined && options.returning !== false)
      this.disallowRawSqlBang(options.returning);

    if (options.returning !== undefined) {
      this.returning =
        options.returning === false ||
        (Array.isArray(options.returning) && options.returning.length === 0)
          ? false
          : options.returning;
    } else {
      const supportsReturning =
        typeof (connection as any).supportsInsertReturning === "function"
          ? (connection as any).supportsInsertReturning()
          : false;
      this.returning = supportsReturning ? this.primaryKeys() : false;
    }

    if (this.inserts.length === 0) {
      this.keys = new Set();
    } else {
      this.resolveSti();
      this.resolveAttributeAliases();
      this.keys = new Set(Object.keys(this.inserts[0]));
    }

    this._scopeAttributes = {
      ...(relation as any)._createWithAttrs,
      ...(relation as any)._scopeAttributes(),
    };
    for (const key of Object.keys(this._scopeAttributes)) {
      this.keys.add(key);
    }

    this.verifyAttributes();
    this.configureOnDuplicateUpdateLogic(options.onDuplicate);
    this.ensureValidOptionsForConnectionBang();
  }

  async execute(): Promise<number> {
    if (this.inserts.length === 0) return 0;
    const dialect = this.connection.adapterName;
    const builder = new Builder(this, dialect);
    return this.connection.executeMutation(builder.toSql());
  }

  updatableColumns(): string[] {
    if (this._updatableColumns) return this._updatableColumns;
    const exclude = new Set([...this.readonlyColumns(), ...this.uniqueByColumns()]);
    if (this.recordTimestamps() && !this.updateOnly && !this.updateSql) {
      for (const col of TIMESTAMP_COLUMNS) {
        exclude.add(col);
      }
    }
    this._updatableColumns = [...this.keys].filter((k) => !exclude.has(k));
    return this._updatableColumns;
  }

  primaryKeys(): string[] {
    const pk = this.model.primaryKey;
    return Array.isArray(pk) ? pk : [pk];
  }

  skipDuplicates(): boolean {
    return this.onDuplicate === "skip";
  }

  updateDuplicates(): boolean {
    return this.onDuplicate === "update";
  }

  mapKeyWithValue<T>(fn: (key: string, value: unknown) => T): T[][] {
    const timestamps = this.recordTimestamps() ? this.timestampsForCreate() : undefined;
    const keysList = [...this.keysIncludingTimestamps()];
    return this.inserts.map((row) => {
      const merged = { ...this._scopeAttributes, ...row };
      if (timestamps) {
        for (const [col, val] of Object.entries(timestamps)) {
          if (merged[col] == null) merged[col] = val;
        }
      }
      return keysList.map((key) => fn(key, merged[key]));
    });
  }

  recordTimestamps(): boolean {
    return this._recordTimestamps;
  }

  keysIncludingTimestamps(): Set<string> {
    if (this._keysIncludingTimestamps) return this._keysIncludingTimestamps;
    if (this.recordTimestamps()) {
      const result = new Set(this.keys);
      for (const col of TIMESTAMP_COLUMNS) {
        if (this.model._attributeDefinitions.has(col)) {
          result.add(col);
        }
      }
      this._keysIncludingTimestamps = result;
    } else {
      this._keysIncludingTimestamps = this.keys;
    }
    return this._keysIncludingTimestamps;
  }

  /** @internal */
  private verifyAttributes(): void {
    if (this.inserts.length <= 1) return;
    for (const row of this.inserts.slice(1)) {
      const rowKeys = new Set([...Object.keys(row), ...Object.keys(this._scopeAttributes)]);
      if (rowKeys.size !== this.keys.size || ![...this.keys].every((k) => rowKeys.has(k))) {
        throw new Error("All objects being inserted must have the same keys");
      }
    }
  }

  /** @internal */
  private configureOnDuplicateUpdateLogic(onDuplicate: InsertAllOptions["onDuplicate"]): void {
    if (this.isCustomUpdateSqlProvided(onDuplicate) && this.updateOnly !== undefined) {
      throw new Error(
        "You can't set :update_only and provide custom update SQL via :on_duplicate at the same time",
      );
    }
    if (
      onDuplicate !== undefined &&
      onDuplicate !== "update" &&
      !this.isCustomUpdateSqlProvided(onDuplicate) &&
      this.updateOnly !== undefined
    ) {
      throw new Error("Cannot use both onDuplicate and updateOnly");
    }

    if (this.updateOnly !== undefined) {
      this._updatableColumns = Array.isArray(this.updateOnly) ? this.updateOnly : [this.updateOnly];
      this.onDuplicate = this._updatableColumns.length === 0 ? "skip" : "update";
    } else if (this.isCustomUpdateSqlProvided(onDuplicate)) {
      this.updateSql = onDuplicate as Nodes.SqlLiteral;
      this.onDuplicate = "update";
    } else if (onDuplicate === "skip") {
      this.onDuplicate = "skip";
    } else if (onDuplicate === "update") {
      this.onDuplicate = this.updatableColumns().length === 0 ? "skip" : "update";
    }
  }

  /** @internal */
  private isCustomUpdateSqlProvided(onDuplicate: InsertAllOptions["onDuplicate"]): boolean {
    return onDuplicate instanceof Nodes.SqlLiteral;
  }

  /** @internal */
  private uniqueByColumns(): string[] {
    return this.findUniqueIndexFor(this.uniqueBy);
  }

  /** @internal */
  private ensureValidOptionsForConnectionBang(): void {
    if (
      this.returning &&
      typeof (this.connection as any).supportsInsertReturning === "function" &&
      !(this.connection as any).supportsInsertReturning()
    ) {
      throw new Error(
        `${(this.connection as any).constructor?.name ?? "Adapter"} does not support INSERT...RETURNING`,
      );
    }
  }

  /** @internal */
  private hasAttributeAliases(attributes: Record<string, unknown>): boolean {
    const aliases = (this.model as any)._attributeAliases as Record<string, string> | undefined;
    if (!aliases) return false;
    return Object.keys(attributes).some((attr) => attr in aliases);
  }

  /** @internal */
  private resolveSti(): void {
    // descendsFromActiveRecord? is not yet implemented; use inheritanceColumn as proxy
    const inheritanceCol = this.model.inheritanceColumn;
    if (!inheritanceCol) return;
    const type = stiName(this.model);
    for (const insert of this.inserts) {
      if (insert[inheritanceCol] == null) {
        insert[inheritanceCol] = type;
      }
    }
  }

  /** @internal */
  private resolveAttributeAliases(): void {
    if (!this.inserts[0] || !this.hasAttributeAliases(this.inserts[0])) return;
    for (let i = 0; i < this.inserts.length; i++) {
      const resolved: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(this.inserts[i])) {
        resolved[this.resolveAttributeAlias(key)] = val;
      }
      this.inserts[i] = resolved;
    }
  }

  /** @internal */
  private resolveAttributeAlias(attribute: string): string {
    const aliases = (this.model as any)._attributeAliases as Record<string, string> | undefined;
    return aliases?.[attribute] ?? attribute;
  }

  /** @internal */
  private findUniqueIndexFor(uniqueBy: string | string[] | undefined): string[] {
    const nameOrCols =
      uniqueBy == null ? this.primaryKeys() : Array.isArray(uniqueBy) ? uniqueBy : [uniqueBy];
    const sortedMatch = [...nameOrCols].sort().join(",");
    const idx = this.uniqueIndexes().find(
      (i: any) =>
        nameOrCols.includes(i.name) ||
        (Array.isArray(i.columns) && [...i.columns].sort().join(",") === sortedMatch),
    ) as any;
    if (idx) return Array.isArray(idx.columns) ? idx.columns : nameOrCols;
    if (uniqueBy == null || sortedMatch === [...this.primaryKeys()].sort().join(","))
      return uniqueBy == null ? [] : this.primaryKeys();
    throw new Error(`No unique index found for ${JSON.stringify(uniqueBy)}`);
  }

  /** @internal */
  private uniqueIndexes(): unknown[] {
    const schemaCache = (this.model as any).schemaCache;
    if (!schemaCache) return [];
    const indexes = schemaCache.indexes?.(this.model.arelTable.name) ?? [];
    return (indexes as any[]).filter((i: any) => i.unique);
  }

  /** @internal */
  private readonlyColumns(): string[] {
    const readonlyAttrs: string[] = (this.model as any).readonlyAttributes ?? [];
    return [...this.primaryKeys(), ...readonlyAttrs];
  }

  /** @internal */
  private disallowRawSqlBang(value: unknown, permit: RegExp = COLUMN_NAME_WITH_ORDER): void {
    if (value instanceof Nodes.SqlLiteral) return;
    if (typeof value !== "string") return;
    if (permit.test(value)) return;
    throw new Error(
      `Dangerous query method called with raw SQL string: ${value}. ` +
        "Known-safe values can be passed by wrapping them in Arel.sql().",
    );
  }

  /** @internal */
  private timestampsForCreate(): Record<string, unknown> {
    const now = Temporal.Now.instant();
    const result: Record<string, unknown> = {};
    for (const col of TIMESTAMP_COLUMNS) {
      if (this.model._attributeDefinitions.has(col)) {
        result[col] = now;
      }
    }
    return result;
  }
}

/**
 * Builds SQL fragments for InsertAll operations.
 *
 * Mirrors: ActiveRecord::InsertAll::Builder
 *
 * All identifiers use double quotes (standard SQL). The MySQL adapter
 * converts them to backticks at execution time via mysqlQuote(), matching
 * how the rest of the codebase works with Arel-generated SQL.
 */
export class Builder {
  readonly model: ModelClass;
  private _insertAll: InsertAll;
  private _dialect: AdapterDialect;

  constructor(insertAll: InsertAll, dialect: AdapterDialect = "sqlite") {
    this._insertAll = insertAll;
    this.model = insertAll.model;
    this._dialect = dialect;
  }

  returning(): string | undefined {
    const ret = this._insertAll.returning;
    if (!ret) return undefined;
    if (ret instanceof Nodes.SqlLiteral) return ret.value;
    const cols = Array.isArray(ret) ? ret : [ret];
    return cols
      .map((attr: string) => {
        const model = this._insertAll.model;
        if (
          typeof (model as any).attributeAlias === "function" &&
          (model as any).attributeAlias(attr)
        ) {
          return `"${(model as any).attributeAlias(attr).replace(/"/g, '""')}" AS "${attr.replace(/"/g, '""')}"`;
        }
        return `"${attr.replace(/"/g, '""')}"`;
      })
      .join(", ");
  }

  /** @internal */
  toSql(): string {
    return this._dialect === "mysql" ? this._buildMysqlSql() : this._buildStandardSql();
  }

  into(): string {
    const tableName = `"${this.model.arelTable.name}"`;
    const keys = [...this._insertAll.keysIncludingTimestamps()];
    if (keys.length === 0) {
      if (this._insertAll.inserts.length > 1) {
        throw new Error("Bulk insert with no explicit columns is not supported");
      }
      if (this._dialect === "mysql") {
        return `INTO ${tableName} () VALUES ()`;
      }
      return `INTO ${tableName} DEFAULT VALUES`;
    }
    const columnsList = keys.map((k) => `"${k}"`).join(", ");
    const compiledValues = this._visitor().compile(this.valuesList());
    return `INTO ${tableName} (${columnsList}) ${compiledValues}`;
  }

  valuesList(): Nodes.ValuesList {
    const arrayCols = this._arrayColumnSet();
    const model = this._insertAll.model;
    const rows = this._insertAll.mapKeyWithValue<Nodes.Node>((key, value) => {
      if (value instanceof Nodes.SqlLiteral) return value;
      // Cast then serialize via the column type if available, falling back
      // to SerializeCastValue.serializeCastValue (identity) when no type exists
      const def = model._attributeDefinitions.get(key) as any;
      const type = def?.type ?? def;
      const castValue = type && typeof type.cast === "function" ? type.cast(value) : value;
      if (type && typeof type.serializeCastValue === "function") {
        value = type.serializeCastValue(castValue);
      } else if (type && typeof type.serialize === "function") {
        value = type.serialize(castValue);
      } else {
        value = SerializeCastValue.serializeCastValue(castValue);
      }
      return new Nodes.SqlLiteral(quoteSqlValue(value, arrayCols.has(key)));
    });
    return new Nodes.ValuesList(rows);
  }

  conflictTarget(): string {
    const cols = this._insertAll.uniqueBy
      ? Array.isArray(this._insertAll.uniqueBy)
        ? this._insertAll.uniqueBy
        : [this._insertAll.uniqueBy]
      : this._insertAll.primaryKeys();
    return `(${cols.map((c) => `"${c}"`).join(", ")})`;
  }

  updatableColumns(): string[] {
    return this._insertAll.updatableColumns().map((c) => `"${c}"`);
  }

  touchModelTimestampsUnless(block: (col: string) => string): string {
    if (!this._insertAll.updateDuplicates() || !this._insertAll.recordTimestamps()) {
      return "";
    }
    const quotedUpdatable = this.updatableColumns();
    if (quotedUpdatable.length === 0) return "";
    const updatable = this._insertAll.updatableColumns();
    const parts: string[] = [];
    const tableName = `"${this.model.arelTable.name}"`;
    const conditions = quotedUpdatable.map(block).join(" AND ");
    for (const col of UPDATE_TIMESTAMP_COLUMNS) {
      if (this.model._attributeDefinitions.has(col) && !updatable.includes(col)) {
        const qcol = `"${col}"`;
        parts.push(
          `${qcol}=(CASE WHEN (${conditions}) THEN ${tableName}.${qcol} ELSE CURRENT_TIMESTAMP END)`,
        );
      }
    }
    return parts.join(",");
  }

  rawUpdateSql(): Nodes.SqlLiteral | undefined {
    return this._insertAll.updateSql;
  }

  private _buildStandardSql(): string {
    let sql = `INSERT ${this.into()}`;

    if (this._insertAll.skipDuplicates()) {
      sql += ` ON CONFLICT ${this.conflictTarget()} DO NOTHING`;
    } else if (this._insertAll.updateDuplicates()) {
      sql += ` ON CONFLICT ${this.conflictTarget()} DO UPDATE SET `;
      if (this._insertAll.updateSql) {
        sql += this._insertAll.updateSql.value;
      } else {
        const touchCondition =
          this._dialect === "postgres"
            ? (col: string) => `${col} IS NOT DISTINCT FROM excluded.${col}`
            : (col: string) => `${col} IS excluded.${col}`;
        const assignments = this._updateAssignments(
          touchCondition,
          (col) => `${col}=excluded.${col}`,
        );
        sql += assignments.join(",");
      }
    }

    const ret = this.returning();
    if (ret) {
      sql += ` RETURNING ${ret}`;
    }

    return sql;
  }

  private _buildMysqlSql(): string {
    let sql = `INSERT ${this.into()}`;
    const noOpColumn = this._firstColumn();

    if (this._insertAll.skipDuplicates()) {
      if (noOpColumn) {
        sql += ` ON DUPLICATE KEY UPDATE ${noOpColumn}=${noOpColumn}`;
      }
    } else if (this._insertAll.updateDuplicates()) {
      if (this._insertAll.updateSql) {
        sql += ` ON DUPLICATE KEY UPDATE ${this._insertAll.updateSql.value}`;
      } else {
        sql += " ON DUPLICATE KEY UPDATE ";
        const assignments = this._updateAssignments(
          (col) => `${col}<=>VALUES(${col})`,
          (col) => `${col}=VALUES(${col})`,
        );
        sql += assignments.join(",");
      }
    }

    return sql;
  }

  private _updateAssignments(
    touchCondition: (col: string) => string,
    updateExpr: (col: string) => string,
  ): string[] {
    const assignments: string[] = [];

    const touch = this.touchModelTimestampsUnless(touchCondition);
    if (touch) {
      assignments.push(touch);
    }

    for (const col of this.updatableColumns()) {
      assignments.push(updateExpr(col));
    }

    return assignments;
  }

  private _visitor(): Visitors.ToSql {
    const v = this._insertAll.connection.arelVisitor;
    if (v) return v;
    const q = this._insertAll.connection as unknown as Visitors.ArelQuoter;
    if (this._dialect === "mysql") return new Visitors.MySQL(q);
    if (this._dialect === "postgres") return new Visitors.PostgreSQL(q);
    return new Visitors.SQLite(q);
  }

  private _firstColumn(): string | undefined {
    const keys = [...this._insertAll.keysIncludingTimestamps()];
    if (keys.length > 0) return `"${keys[0]}"`;
    const pk = this._insertAll.primaryKeys();
    if (pk.length > 0) return `"${pk[0]}"`;
    return undefined;
  }

  private _arrayColumnSet(): Set<string> {
    const keys = [...this._insertAll.keysIncludingTimestamps()];
    return new Set(
      keys.filter((c) => {
        const def = this.model._attributeDefinitions.get(c);
        return def?.type?.name === "array";
      }),
    );
  }
}
