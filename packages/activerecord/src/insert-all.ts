import { Temporal } from "@blazetrails/date";
import { Nodes, Visitors } from "@blazetrails/arel";
import { ArgumentError, SerializeCastValue, type Type } from "@blazetrails/activemodel";
import { IndexDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { UnknownAttributeError } from "./errors.js";
import type { Base } from "./base.js";

import { isFinderNeedsTypeCondition } from "./inheritance.js";
import type { Relation } from "./relation.js";
import { Result } from "./result.js";
import { isEmpty } from "@blazetrails/ruby-compat";
import { isPresent, many, reverseMerge } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { first } from "./ruby-first.js";
import { withConnection } from "./connection-handling.js";
import { allTimestampAttributesInModel, timestampAttributesForUpdateInModel } from "./timestamp.js";

type ModelClass = typeof Base;

const COLUMN_NAME_WITH_ORDER =
  /^\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?[\w,\s]*)\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?(?:\s*,\s*(?:(?:\w+\.)?\w+|\w+\((?:|(?:\w+\.)?[\w,\s]*)\))(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?)*\s*$/i;

export interface InsertAllOptions {
  onDuplicate?: "raise" | "skip" | "update" | Nodes.SqlLiteral;
  updateOnly?: string | string[];
  uniqueBy?: string | string[];
  returning?: string | string[] | Nodes.SqlLiteral | false;
  recordTimestamps?: boolean;
}

/**
 * @noRailsEquivalent PERMANENT
 * @internal
 */
interface ResolvedConnectionFacts {
  supportsInsertReturning: boolean;
  supportsInsertOnDuplicateSkip: boolean;
  supportsInsertOnDuplicateUpdate: boolean;
  supportsInsertConflictTarget: boolean;
  primaryKeys: string[];
  indexes: (tableName: string) => unknown[];
  columnsHash: Record<string, unknown>;
}

/**
 * @noRailsEquivalent PERMANENT
 * @internal
 */
async function resolveConnectionFacts(
  model: ModelClass,
  connection: any,
): Promise<ResolvedConnectionFacts> {
  const cache = connection.schemaCache;
  const supportsInsertReturning =
    typeof connection.supportsInsertReturning === "function"
      ? await connection.supportsInsertReturning()
      : false;
  const supportsInsertOnDuplicateSkip =
    typeof connection.supportsInsertOnDuplicateSkip === "function"
      ? await connection.supportsInsertOnDuplicateSkip()
      : false;
  const supportsInsertOnDuplicateUpdate =
    typeof connection.supportsInsertOnDuplicateUpdate === "function"
      ? await connection.supportsInsertOnDuplicateUpdate()
      : false;
  const supportsInsertConflictTarget =
    typeof connection.supportsInsertConflictTarget === "function"
      ? await connection.supportsInsertConflictTarget()
      : false;
  let primaryKeys: string[] = [];
  if (cache && typeof cache.primaryKeys === "function") {
    const pk = await cache.primaryKeys(model.arelTable.name);
    if (pk != null) primaryKeys = Array.isArray(pk) ? pk : [pk];
  }
  const indexes: unknown[] = cache ? await cache.indexes(model.tableName) : [];
  const columnsHash: Record<string, unknown> = cache
    ? ((await cache.columnsHash(model.tableName)) ?? {})
    : {};
  return {
    supportsInsertReturning,
    supportsInsertOnDuplicateSkip,
    supportsInsertOnDuplicateUpdate,
    supportsInsertConflictTarget,
    primaryKeys,
    indexes: (name: string) => (name === model.tableName ? indexes : []),
    columnsHash,
  };
}

export class InsertAll {
  readonly model: ModelClass;
  readonly connection: ModelClass["connection"];
  inserts: Record<string, unknown>[];
  readonly keys: Set<string>;
  uniqueBy: string | string[] | IndexDefinition | undefined;
  returning: string | string[] | Nodes.SqlLiteral | false | undefined;

  onDuplicate: "raise" | "skip" | "update" | Nodes.SqlLiteral | undefined;
  updateOnly: string | string[] | undefined;
  updateSql: Nodes.SqlLiteral | undefined;

  private scopeAttributes: Record<string, unknown>;
  private _recordTimestamps: boolean;
  private _updatableColumns: string[] | undefined;
  private _keysIncludingTimestamps: Set<string> | undefined;
  private _facts: ResolvedConnectionFacts;

  static async execute(
    relation: Relation<any>,
    inserts: Record<string, unknown>[],
    options: InsertAllOptions = {},
  ): Promise<Result> {
    const model = (relation as any)._model as ModelClass;
    return withConnection.call(model as any, async (c: any) =>
      new InsertAll(
        relation,
        c,
        inserts,
        options,
        await resolveConnectionFacts(model, c),
      ).execute(),
    ) as Promise<Result>;
  }

  /** @missingRailsArgs except — PERMANENT */
  constructor(
    relation: Relation<any>,
    connection: ModelClass["connection"],
    inserts: Record<string, unknown>[],
    options: InsertAllOptions = {},
    facts: ResolvedConnectionFacts,
  ) {
    this._facts = facts;
    this.model = (relation as any)._model as ModelClass;
    this.connection = connection;
    this.inserts = inserts.map((r) => ({ ...r }));
    this.updateOnly = options.updateOnly;
    this.uniqueBy = options.uniqueBy;
    this._recordTimestamps = options.recordTimestamps ?? this.model.recordTimestamps;
    this.updateSql = undefined;
    this.onDuplicate = options.onDuplicate;

    if (options.onDuplicate !== undefined) this.disallowRawSqlBang(options.onDuplicate);
    if (options.returning !== undefined && options.returning !== false)
      this.disallowRawSqlBang(options.returning);

    if (options.returning !== undefined) {
      this.returning =
        options.returning === false ||
        (Array.isArray(options.returning) && options.returning.length === 0)
          ? false
          : options.returning;
    }

    if (isEmpty(this.inserts)) {
      this.keys = new Set();
    } else {
      this.resolveSti();
      this.resolveAttributeAliases();
      this.keys = new Set(Object.keys(first(this.inserts) as Record<string, unknown>));
    }

    this.scopeAttributes = except(
      (relation as any).scopeForCreate() as Record<string, unknown>,
      this.model.inheritanceColumn as string,
    );
    for (const key of Object.keys(this.scopeAttributes)) {
      this.keys.add(key);
    }

    if (this.returning === undefined) {
      this.returning = facts.supportsInsertReturning ? this.primaryKeys() : false;
    }
    if (Array.isArray(this.returning) && this.returning.length === 0) this.returning = false;

    this.uniqueBy = this.findUniqueIndexFor(this.uniqueBy);

    this.configureOnDuplicateUpdateLogic();
    this.ensureValidOptionsForConnectionBang();
  }

  async execute(): Promise<Result> {
    if (isEmpty(this.inserts)) return Result.empty();
    let message = `${this.model.name} `;
    if (many(this.inserts)) message += "Bulk ";
    message += this.onDuplicate === "update" ? "Upsert" : "Insert";
    return this.connection.execInsertAll(await this.toSql(), message);
  }

  /** @internal */
  async toSql(): Promise<string> {
    return this.connection.buildInsertSql(new Builder(this));
  }

  updatableColumns(): string[] {
    const exclude = new Set([...this.readonlyColumns(), ...this.uniqueByColumns()]);
    return (this._updatableColumns ??= [...this.keys].filter((k) => !exclude.has(k)));
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  schemaCacheColumnsHash(tableName: string): Record<string, unknown> {
    return tableName === this.model.tableName ? this._facts.columnsHash : {};
  }

  /** @missingRailsCall table_name — PERMANENT */
  primaryKeys(): string[] {
    return this._facts.primaryKeys;
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
      const attributes = { ...row, ...this.scopeAttributes };
      if (timestamps) {
        for (const [col, val] of Object.entries(timestamps)) {
          if (!(col in attributes)) attributes[col] = val;
        }
      }
      this.verifyAttributes(attributes);
      return keysList.map((key) => fn(key, attributes[key]));
    });
  }

  recordTimestamps(): boolean {
    return this._recordTimestamps;
  }

  keysIncludingTimestamps(): Set<string> {
    if (this._keysIncludingTimestamps) return this._keysIncludingTimestamps;
    if (this.recordTimestamps()) {
      const result = new Set(this.keys);
      for (const col of allTimestampAttributesInModel.call(this.model as never)) {
        result.add(col);
      }
      this._keysIncludingTimestamps = result;
    } else {
      this._keysIncludingTimestamps = this.keys;
    }
    return this._keysIncludingTimestamps;
  }

  /** @internal */
  private verifyAttributes(attributes: Record<string, unknown>): void {
    const expected = this.keysIncludingTimestamps();
    const rowKeys = new Set(Object.keys(attributes));
    if (rowKeys.size !== expected.size || ![...expected].every((k) => rowKeys.has(k))) {
      throw new ArgumentError("All objects being inserted must have the same keys");
    }
  }

  /** @internal */
  private configureOnDuplicateUpdateLogic(): void {
    const onDuplicate = this.onDuplicate;
    if (this.isCustomUpdateSqlProvided() && isPresent(this.updateOnly)) {
      throw new ArgumentError(
        "You can't set :update_only and provide custom update SQL via :on_duplicate at the same time",
      );
    }
    if (
      onDuplicate !== undefined &&
      onDuplicate !== "update" &&
      !this.isCustomUpdateSqlProvided() &&
      isPresent(this.updateOnly)
    ) {
      throw new Error("Cannot use both onDuplicate and updateOnly");
    }

    if (isPresent(this.updateOnly)) {
      this._updatableColumns = Array.isArray(this.updateOnly)
        ? this.updateOnly
        : [this.updateOnly as string];
      this.onDuplicate = "update";
    } else if (this.isCustomUpdateSqlProvided()) {
      this.updateSql = onDuplicate as Nodes.SqlLiteral;
      this.onDuplicate = "update";
    } else if (onDuplicate === "update" && isEmpty(this.updatableColumns())) {
      this.onDuplicate = "skip";
    }
  }

  /** @internal */
  private isCustomUpdateSqlProvided(): boolean {
    return this.onDuplicate instanceof Nodes.SqlLiteral;
  }

  /** @internal */
  private uniqueByColumns(): string[] {
    if (!(this.uniqueBy instanceof IndexDefinition)) return [];
    return Array.isArray(this.uniqueBy.columns) ? this.uniqueBy.columns : [this.uniqueBy.columns];
  }

  /** @internal */
  private ensureValidOptionsForConnectionBang(): void {
    if (this.returning && !this._facts.supportsInsertReturning) {
      throw new ArgumentError(
        `${(this.connection as any).constructor?.name ?? "Adapter"} does not support :returning`,
      );
    }

    if (this.skipDuplicates() && !this._facts.supportsInsertOnDuplicateSkip) {
      throw new ArgumentError(
        `${(this.connection as any).constructor?.name ?? "Adapter"} does not support skipping duplicates`,
      );
    }

    if (this.updateDuplicates() && !this._facts.supportsInsertOnDuplicateUpdate) {
      throw new ArgumentError(
        `${(this.connection as any).constructor?.name ?? "Adapter"} does not support upsert`,
      );
    }

    if (this.uniqueBy && !this._facts.supportsInsertConflictTarget) {
      throw new ArgumentError(
        `${(this.connection as any).constructor?.name ?? "Adapter"} does not support :unique_by`,
      );
    }
  }

  /** @internal */
  private hasAttributeAliases(attributes: Record<string, unknown>): boolean {
    const aliases = (this.model as any).attributeAliases as Record<string, string> | undefined;
    if (!aliases) return false;
    return Object.keys(attributes).some((attr) => attr in aliases);
  }

  /** @internal */
  private resolveSti(): void {
    if (!isFinderNeedsTypeCondition(this.model)) return;
    const stiType = this.model.stiName();
    this.inserts = this.inserts.map((insert) =>
      reverseMerge(insert, { [String(this.model.inheritanceColumn ?? "type")]: stiType }),
    );
  }

  /** @internal */
  private resolveAttributeAliases(): void {
    if (!this.hasAttributeAliases(first(this.inserts) ?? {})) return;
    this.inserts = this.inserts.map((insert) => {
      const resolved: Record<string, unknown> = {};
      for (const [attribute, val] of Object.entries(insert)) {
        resolved[this.resolveAttributeAlias(attribute)] = val;
      }
      return resolved;
    });
    if (this.updateOnly !== undefined) {
      const cols = Array.isArray(this.updateOnly) ? this.updateOnly : [this.updateOnly];
      this.updateOnly = cols.map((attribute) => this.resolveAttributeAlias(attribute));
    }
    if (typeof this.uniqueBy === "string") {
      this.uniqueBy = this.resolveAttributeAlias(this.uniqueBy);
    } else if (Array.isArray(this.uniqueBy)) {
      this.uniqueBy = this.uniqueBy.map((attribute) => this.resolveAttributeAlias(attribute));
    }
  }

  /** @internal */
  private resolveAttributeAlias(attribute: string): string {
    const aliases = (this.model as any).attributeAliases as Record<string, string> | undefined;
    return aliases?.[attribute] ?? attribute;
  }

  /** @internal */
  private findUniqueIndexFor(
    uniqueBy: string | string[] | IndexDefinition | undefined,
  ): IndexDefinition | undefined {
    if (uniqueBy instanceof IndexDefinition) return uniqueBy;
    const conn = this.connection as { constructor?: { name?: string } };
    if (!this._facts.supportsInsertConflictTarget) {
      if (uniqueBy == null) return undefined;
      throw new ArgumentError(
        `${(conn as any).constructor?.name ?? "Adapter"} does not support :unique_by`,
      );
    }
    const modelPk = this.model.primaryKey;
    const modelPrimaryKeys =
      modelPk == null || modelPk === "" ? [] : Array.isArray(modelPk) ? modelPk : [modelPk];
    const nameOrCols =
      uniqueBy == null ? modelPrimaryKeys : Array.isArray(uniqueBy) ? uniqueBy : [uniqueBy];
    const match = nameOrCols.map(String);
    const sortedMatch = [...match].sort().join(",");
    const idx = this.uniqueIndexes().find(
      (i: any) =>
        match.includes(i.name) ||
        (Array.isArray(i.columns) && [...i.columns].sort().join(",") === sortedMatch),
    ) as { name: string; columns: string[]; where?: string } | undefined;
    const tableName = this.model.tableName;
    if (idx) {
      return idx instanceof IndexDefinition
        ? idx
        : new IndexDefinition(tableName, idx.name, true, idx.columns, { where: idx.where });
    }
    const dbPrimaryKeys = this.primaryKeys().map(String);
    if (match.join(",") === dbPrimaryKeys.join(",")) {
      return uniqueBy == null
        ? undefined
        : new IndexDefinition(tableName, `${tableName}_primary_key`, true, [...match]);
    }
    const display = Array.isArray(uniqueBy)
      ? `[${match.join(", ")}]`
      : (uniqueBy ?? nameOrCols.join(", "));
    throw new ArgumentError(`No unique index found for ${display}`);
  }

  /** @internal */
  private uniqueIndexes(): unknown[] {
    return this._facts.indexes(this.model.tableName).filter((i: any) => i.unique);
  }

  /** @internal */
  private readonlyColumns(): string[] {
    return [...this.primaryKeys(), ...this.model.readonlyAttributes];
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
    for (const col of allTimestampAttributesInModel.call(this.model as never)) {
      result[col] = now;
    }
    return result;
  }
}

export interface InsertBuilder {
  readonly model: ModelClass;
  into(): string;
  conflictTarget(): string;
  returning(): string | undefined;
  updatableColumns(): string[];
  touchModelTimestampsUnless(block: (col: string) => string): string;
  rawUpdateSql(): Nodes.SqlLiteral | undefined;
  skipDuplicates(): boolean;
  updateDuplicates(): boolean;
  readonly keys: Set<string>;
  quotedTableName(): string;
}

export class Builder implements InsertBuilder {
  readonly model: ModelClass;
  private _insertAll: InsertAll;
  private _connection: ModelClass["connection"];

  constructor(insertAll: InsertAll) {
    this._insertAll = insertAll;
    this.model = insertAll.model;
    this._connection = insertAll.connection;
  }

  /** @internal */
  private extractTypesFromColumnsOn(tableName: string, keys: string[]): Record<string, Type> {
    const columns = this._insertAll.schemaCacheColumnsHash(tableName);

    const unknownColumn = keys.find((key) => !(key in columns));
    if (unknownColumn !== undefined) {
      throw new UnknownAttributeError({ constructor: this.model }, unknownColumn);
    }

    const types: Record<string, Type> = {};
    for (const key of keys) types[key] = this.model.typeForAttribute(key);
    return types;
  }

  /** @internal */
  private columnsList(): string {
    return this.formatColumns(this._insertAll.keysIncludingTimestamps());
  }

  /** @internal */
  private formatColumns(columns: string | Iterable<string>): string {
    return typeof columns !== "string" ? this.quoteColumns(columns).join(",") : columns;
  }

  /** @internal */
  private quoteColumns(columns: Iterable<string>): string[] {
    return [...columns].map((column) => this.quoteColumn(column));
  }

  /** @internal */
  private quoteColumn(column: string): string {
    return this._connection.quoteColumnName(column);
  }

  /** @internal */
  private quoteTable(name: string): string {
    return this._connection.quoteTableName(name);
  }

  returning(): string | undefined {
    const ret = this._insertAll.returning;
    if (!ret) return undefined;
    if (ret instanceof Nodes.SqlLiteral) return ret.value;
    const cols = Array.isArray(ret) ? ret : [ret];
    const aliases = (this.model as any).attributeAliases as Record<string, string> | undefined;
    return cols
      .map((attr: string) => {
        const physical = aliases?.[attr];
        if (physical) {
          return `${this.quoteColumn(physical)} AS ${this.quoteColumn(attr)}`;
        }
        return this.quoteColumn(attr);
      })
      .join(",");
  }

  skipDuplicates(): boolean {
    return this._insertAll.skipDuplicates();
  }

  updateDuplicates(): boolean {
    return this._insertAll.updateDuplicates();
  }

  get keys(): Set<string> {
    return this._insertAll.keys;
  }

  into(): string {
    const tableName = this.quoteTable(String(this.model.arelTable.name));
    const keys = [...this._insertAll.keysIncludingTimestamps()];
    if (keys.length === 0) {
      if (this._insertAll.inserts.length > 1) {
        throw new Error("Bulk insert with no explicit columns is not supported");
      }
      if (this._connection.typeRegistryKey === "mysql2") {
        return `INTO ${tableName} () VALUES ()`;
      }
      return `INTO ${tableName} DEFAULT VALUES`;
    }
    const compiledValues = this._visitor().compile(this.valuesList());
    return `INTO ${tableName} (${this.columnsList()}) ${compiledValues}`;
  }

  valuesList(): Nodes.ValuesList {
    const types = this.extractTypesFromColumnsOn(this.model.tableName, [
      ...this._insertAll.keysIncludingTimestamps(),
    ]);

    const rows = this._insertAll.mapKeyWithValue<unknown>((key, value) => {
      if (value instanceof Nodes.SqlLiteral) return value;
      const type = types[key];
      value = SerializeCastValue.serialize(type, type.cast(value));
      return value;
    });
    return new Nodes.ValuesList(rows);
  }

  conflictTarget(): string {
    const index = this._insertAll.uniqueBy;
    if (index instanceof IndexDefinition) {
      const cols = this.formatColumns(index.columns as unknown as string | string[]);
      return index.where ? `(${cols}) WHERE ${index.where}` : `(${cols})`;
    }
    if (this._insertAll.updateDuplicates()) {
      return `(${this.formatColumns(this._insertAll.primaryKeys())})`;
    }
    return "";
  }

  updatableColumns(): string[] {
    return this.quoteColumns(this._insertAll.updatableColumns());
  }

  touchModelTimestampsUnless(block: (col: string) => string): string {
    if (!this._insertAll.updateDuplicates() || !this._insertAll.recordTimestamps()) {
      return "";
    }
    return timestampAttributesForUpdateInModel
      .call(this.model as never)
      .filter((columnName) => this.touchTimestampAttribute(columnName))
      .map(
        (columnName) =>
          `${columnName}=(CASE WHEN (${this.updatableColumns()
            .map(block)
            .join(" AND ")}) THEN ${this.quotedTableName()}.${columnName} ELSE ${String(
            this._connection.highPrecisionCurrentTimestamp(),
          )} END),`,
      )
      .join("");
  }

  /** @internal */
  private touchTimestampAttribute(columnName: string): boolean {
    return !this._insertAll.updatableColumns().includes(columnName);
  }

  /**
   * @internal Mirrors Rails `insert.model.quoted_table_name`.
   * @noRailsEquivalent CONVERGEABLE `insert.model.quoted_table_name` (insert_all.rb:235) as a Builder method rather than a chained send.
   */
  quotedTableName(): string {
    return this.quoteTable(String(this.model.arelTable.name));
  }

  rawUpdateSql(): Nodes.SqlLiteral | undefined {
    return this._insertAll.updateSql;
  }

  private _visitor(): Visitors.ToSql {
    const v = this._connection.visitor;
    if (v) return v;
    const q = this._connection as unknown as Visitors.ArelConnection;
    if (this._connection.typeRegistryKey === "mysql2") return new Visitors.MySQL(q);
    if (this._connection.typeRegistryKey === "postgresql") return new Visitors.PostgreSQL(q);
    return new Visitors.SQLite(q);
  }
}
