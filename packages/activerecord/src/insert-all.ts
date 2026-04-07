import { Nodes, Visitors } from "@blazetrails/arel";
import { SerializeCastValue } from "@blazetrails/activemodel";
import type { Base } from "./base.js";
import { quoteSqlValue } from "./base.js";
import type { Relation } from "./relation.js";
import { detectAdapterName } from "./adapter-name.js";

type ModelClass = typeof Base;
type AdapterDialect = "sqlite" | "postgres" | "mysql";

const TIMESTAMP_COLUMNS = ["created_at", "updated_at"] as const;
const UPDATE_TIMESTAMP_COLUMNS = ["updated_at"] as const;

export interface InsertAllOptions {
  onDuplicate?: "skip" | "update" | Nodes.SqlLiteral;
  updateOnly?: string | string[];
  uniqueBy?: string | string[];
  recordTimestamps?: boolean;
}

export class InsertAll {
  readonly model: ModelClass;
  readonly connection: ModelClass["adapter"];
  readonly inserts: Record<string, unknown>[];
  readonly keys: Set<string>;
  readonly uniqueBy: string | string[] | undefined;

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

    if (this.inserts.length === 0) {
      this.keys = new Set();
    } else {
      this.keys = new Set(Object.keys(this.inserts[0]));
    }

    this._scopeAttributes = {
      ...(relation as any)._createWithAttrs,
      ...(relation as any)._scopeAttributes(),
    };
    for (const key of Object.keys(this._scopeAttributes)) {
      this.keys.add(key);
    }

    this._verifyAttributes();
    this._configureDuplicateLogic(options.onDuplicate);
  }

  async execute(): Promise<number> {
    if (this.inserts.length === 0) return 0;
    const dialect = detectAdapterName(this.connection);
    const builder = new Builder(this, dialect);
    return this.connection.executeMutation(builder.toSql());
  }

  updatableColumns(): string[] {
    if (this._updatableColumns) return this._updatableColumns;
    const exclude = new Set([...this.primaryKeys(), ...this._uniqueByColumns()]);
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
    const now = this.recordTimestamps() ? new Date() : undefined;
    const keysList = [...this.keysIncludingTimestamps()];
    return this.inserts.map((row) => {
      const merged = { ...this._scopeAttributes, ...row };
      if (now) {
        for (const col of TIMESTAMP_COLUMNS) {
          if (this.model._attributeDefinitions.has(col) && merged[col] == null) {
            merged[col] = now;
          }
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

  private _verifyAttributes(): void {
    if (this.inserts.length <= 1) return;
    for (const row of this.inserts.slice(1)) {
      const rowKeys = new Set([...Object.keys(row), ...Object.keys(this._scopeAttributes)]);
      if (rowKeys.size !== this.keys.size || ![...this.keys].every((k) => rowKeys.has(k))) {
        throw new Error("All objects being inserted must have the same keys");
      }
    }
  }

  private _configureDuplicateLogic(onDuplicate: InsertAllOptions["onDuplicate"]): void {
    if (onDuplicate instanceof Nodes.SqlLiteral && this.updateOnly !== undefined) {
      throw new Error(
        "You can't set :update_only and provide custom update SQL via :on_duplicate at the same time",
      );
    }
    if (
      onDuplicate !== undefined &&
      onDuplicate !== "update" &&
      !(onDuplicate instanceof Nodes.SqlLiteral) &&
      this.updateOnly !== undefined
    ) {
      throw new Error("Cannot use both onDuplicate and updateOnly");
    }

    if (this.updateOnly !== undefined) {
      this._updatableColumns = Array.isArray(this.updateOnly) ? this.updateOnly : [this.updateOnly];
      this.onDuplicate = this._updatableColumns.length === 0 ? "skip" : "update";
    } else if (onDuplicate instanceof Nodes.SqlLiteral) {
      this.updateSql = onDuplicate;
      this.onDuplicate = "update";
    } else if (onDuplicate === "skip") {
      this.onDuplicate = "skip";
    } else if (onDuplicate === "update") {
      this.onDuplicate = this.updatableColumns().length === 0 ? "skip" : "update";
    }
  }

  private _uniqueByColumns(): string[] {
    if (!this.uniqueBy) return [];
    return Array.isArray(this.uniqueBy) ? this.uniqueBy : [this.uniqueBy];
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
    if (this._dialect === "mysql") return new Visitors.MySQL();
    if (this._dialect === "postgres") return new Visitors.PostgreSQL();
    return new Visitors.SQLite();
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
