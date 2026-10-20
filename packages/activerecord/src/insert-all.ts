import * as Arel from "@blazetrails/arel";
import { Nodes } from "@blazetrails/arel";
import { ArgumentError, SerializeCastValue, type ValueType } from "@blazetrails/activemodel";
import { IndexDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { UnknownAttributeError } from "./errors.js";
import type { Base } from "./base.js";

import { isFinderNeedsTypeCondition } from "./inheritance.js";
import type { Relation } from "./relation.js";
import { Result } from "./result.js";
import {
  isEmpty,
  isSymbol,
  rbEqual,
  rbFArray,
  rbObjAsString,
  rtest,
  sort,
  symbolToS,
  toSym,
} from "@blazetrails/ruby-compat";
import {
  filterMap,
  indexWith,
  isPresent,
  many,
  reverseMerge,
  reverseMergeBang,
  stringifyKeys,
  transformKeys,
} from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { aryJoin, first } from "@blazetrails/ruby-compat";
import { withConnection } from "./connection-handling.js";

type ModelClass = typeof Base;

export interface InsertAllOptions {
  onDuplicate?: ":raise" | ":skip" | ":update" | Nodes.SqlLiteral;
  updateOnly?: string | string[];
  uniqueBy?: string | string[];
  returning?: `:${string}` | `:${string}`[] | Nodes.SqlLiteral | false;
  recordTimestamps?: boolean;
}

interface ResolvedConnectionFacts {
  supportsInsertReturning: boolean;
  supportsInsertOnDuplicateSkip: boolean;
  supportsInsertOnDuplicateUpdate: boolean;
  supportsInsertConflictTarget: boolean;
  primaryKeys: string[];
  indexes: (tableName: string) => unknown[];
}

async function resolveConnectionFacts(
  model: ModelClass,
  connection: any,
): Promise<ResolvedConnectionFacts> {
  const cache = connection.schemaCache;
  await connection.databaseVersion;
  const supportsInsertReturning =
    typeof connection.supportsInsertReturning === "function"
      ? connection.supportsInsertReturning()
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
  return {
    supportsInsertReturning,
    supportsInsertOnDuplicateSkip,
    supportsInsertOnDuplicateUpdate,
    supportsInsertConflictTarget,
    primaryKeys,
    indexes: (name: string) => (name === model.tableName ? indexes : []),
  };
}

export class InsertAll {
  readonly model: ModelClass;
  readonly connection: NonNullable<Awaited<ModelClass["connection"]>>;
  inserts: Record<string, unknown>[];
  readonly keys: Set<string>;
  uniqueBy: string | string[] | IndexDefinition | undefined;
  returning: string | string[] | Nodes.SqlLiteral | false | undefined;

  onDuplicate: ":raise" | ":skip" | ":update" | Nodes.SqlLiteral | undefined;
  updateOnly: string | string[] | undefined;
  updateSql: Nodes.SqlLiteral | undefined;

  private scopeAttributes: Record<string, unknown>;
  private _recordTimestamps: boolean;
  private _updatableColumns: string[] | undefined;
  private _keysIncludingTimestamps: Set<string> | undefined;
  private _facts: ResolvedConnectionFacts;

  static async execute(
    relation: Relation<any, boolean>,
    inserts: Record<string, unknown>[],
    options: InsertAllOptions = {},
  ): Promise<Result> {
    const model = relation.model as ModelClass;
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

  constructor(
    relation: Relation<any, boolean>,
    connection: NonNullable<Awaited<ModelClass["connection"]>>,
    inserts: Record<string, unknown>[],
    options: InsertAllOptions = {},
    facts: ResolvedConnectionFacts,
  ) {
    this._facts = facts;
    this.model = relation.model as ModelClass;
    this.connection = connection;
    this.inserts = inserts.map((r) => ({ ...r }));
    this.updateOnly = options.updateOnly;
    this.uniqueBy = options.uniqueBy;
    this._recordTimestamps = options.recordTimestamps ?? this.model.recordTimestamps;
    this.updateSql = undefined;
    this.onDuplicate = options.onDuplicate;

    this.disallowRawSqlBang(options.onDuplicate);
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
      relation.scopeForCreate(),
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
    message += this.onDuplicate === ":update" ? "Upsert" : "Insert";
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

  /** @missingRailsCall table_name — PERMANENT */
  primaryKeys(): string[] {
    return this._facts.primaryKeys;
  }

  skipDuplicates(): boolean {
    return this.onDuplicate === ":skip";
  }

  updateDuplicates(): boolean {
    return this.onDuplicate === ":update";
  }

  mapKeyWithValue<T>(block: (key: string, value: unknown) => T): T[][] {
    return this.inserts.map((attributes) => {
      attributes = stringifyKeys(attributes);
      Object.assign(attributes, this.scopeAttributes);
      if (this.recordTimestamps()) reverseMergeBang(attributes, this.timestampsForCreate());

      this.verifyAttributes(attributes);

      return [...this.keysIncludingTimestamps()].map((key) => block(key, attributes[key]));
    });
  }

  recordTimestamps(): boolean {
    return this._recordTimestamps;
  }

  keysIncludingTimestamps(): Set<string> {
    if (this._keysIncludingTimestamps) return this._keysIncludingTimestamps;
    if (this.recordTimestamps()) {
      const result = new Set(this.keys);
      for (const col of this.model.allTimestampAttributesInModel()) {
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

    if (isPresent(this.updateOnly)) {
      this._updatableColumns = rbFArray(this.updateOnly) as string[];
      this.onDuplicate = ":update";
    } else if (this.isCustomUpdateSqlProvided()) {
      this.updateSql = onDuplicate as Nodes.SqlLiteral;
      this.onDuplicate = ":update";
    } else if (onDuplicate === ":update" && isEmpty(this.updatableColumns())) {
      this.onDuplicate = ":skip";
    }
  }

  /** @internal */
  private isCustomUpdateSqlProvided(): boolean {
    return this.onDuplicate instanceof Nodes.SqlLiteral;
  }

  /** @internal */
  private uniqueByColumns(): string[] {
    return rbFArray((this.uniqueBy as IndexDefinition | undefined)?.columns) as string[];
  }

  /** @internal */
  private ensureValidOptionsForConnectionBang(): void {
    if (this.returning && !this._facts.supportsInsertReturning) {
      throw new ArgumentError(`${this.connection.constructor.name} does not support :returning`);
    }

    if (this.skipDuplicates() && !this._facts.supportsInsertOnDuplicateSkip) {
      throw new ArgumentError(
        `${this.connection.constructor.name} does not support skipping duplicates`,
      );
    }

    if (this.updateDuplicates() && !this._facts.supportsInsertOnDuplicateUpdate) {
      throw new ArgumentError(`${this.connection.constructor.name} does not support upsert`);
    }

    if (this.uniqueBy && !this._facts.supportsInsertConflictTarget) {
      throw new ArgumentError(`${this.connection.constructor.name} does not support :unique_by`);
    }
  }

  /** @internal */
  private hasAttributeAliases(attributes: Record<string, unknown>): boolean {
    return Object.keys(attributes).some((attribute) => this.model.isAttributeAlias(attribute));
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
    this.inserts = this.inserts.map((insert) =>
      transformKeys(insert, (attribute) => this.resolveAttributeAlias(attribute)),
    );
    if (rtest(this.updateOnly)) {
      this.updateOnly = (rbFArray(this.updateOnly) as string[]).map((attribute) =>
        this.resolveAttributeAlias(attribute),
      );
    }
    if (rtest(this.uniqueBy)) {
      this.uniqueBy = (rbFArray(this.uniqueBy) as string[]).map((attribute) =>
        this.resolveAttributeAlias(attribute),
      );
    }
  }

  /** @internal */
  private resolveAttributeAlias(attribute: string): string {
    return this.model.attributeAlias(attribute) || attribute;
  }

  /** @internal */
  private findUniqueIndexFor(
    uniqueBy: string | string[] | IndexDefinition | undefined,
  ): IndexDefinition | undefined {
    if (!this._facts.supportsInsertConflictTarget) {
      if (uniqueBy == null) return undefined;

      throw new ArgumentError(`${this.connection.constructor.name} does not support :unique_by`);
    }

    const nameOrColumns = rtest(uniqueBy) ? uniqueBy : this.model.primaryKey;
    const match = rbFArray(nameOrColumns).map((column) => rbObjAsString(column));
    const sortedMatch = sort(match);

    let index: IndexDefinition | undefined;
    if (
      (index = this.uniqueIndexes().find(
        (i) => match.includes(i.name) || rbEqual(sort(rbFArray(i.columns)), sortedMatch),
      )) != null
    ) {
      return index;
    } else if (rbEqual(match, this.primaryKeys())) {
      return uniqueBy == null
        ? undefined
        : new IndexDefinition(
            this.model.tableName!,
            `${this.model.tableName}_primary_key`,
            true,
            match,
          );
    } else {
      throw new ArgumentError(`No unique index found for ${rbObjAsString(nameOrColumns)}`);
    }
  }

  /** @internal */
  private uniqueIndexes(): IndexDefinition[] {
    return (this._facts.indexes(this.model.tableName!) as IndexDefinition[]).filter(
      (i) => i.unique,
    );
  }

  /** @internal */
  private readonlyColumns(): string[] {
    return [...this.primaryKeys(), ...this.model.readonlyAttributes];
  }

  /** @internal */
  private disallowRawSqlBang(value: unknown): void {
    if (typeof value !== "string" || isSymbol(value) || Arel.arelNode(value)) return;

    throw new ArgumentError(
      "Dangerous query method (method whose arguments are used as raw " +
        `SQL) called: ${value}. ` +
        "Known-safe values can be passed " +
        "by wrapping them in Arel.sql().",
    );
  }

  /** @internal */
  private timestampsForCreate(): Record<string, unknown> {
    return indexWith(
      this.model.allTimestampAttributesInModel(),
      this.connection.highPrecisionCurrentTimestamp(),
    );
  }
}

export interface InsertBuilder {
  readonly model: ModelClass;
  into(): string;
  valuesList(): Promise<string>;
  conflictTarget(): string;
  returning(): string | undefined;
  updatableColumns(): string[];
  touchModelTimestampsUnless(block: (col: string) => string): string;
  rawUpdateSql(): Nodes.SqlLiteral | undefined;
  skipDuplicates(): boolean;
  updateDuplicates(): boolean;
  readonly keys: Set<string>;
}

export class Builder implements InsertBuilder {
  readonly model: ModelClass;
  private _insertAll: InsertAll;
  private _connection: NonNullable<Awaited<ModelClass["connection"]>>;

  constructor(insertAll: InsertAll) {
    this._insertAll = insertAll;
    this.model = insertAll.model;
    this._connection = insertAll.connection;
  }

  /** @internal */
  private columnsList(): string {
    return this.formatColumns(this._insertAll.keysIncludingTimestamps());
  }

  /** @internal */
  private async extractTypesFromColumnsOn(
    tableName: string,
    keys: string[],
  ): Promise<Record<string, ValueType | null>> {
    const columns = await this.model.schemaCache().columnsHash(tableName);

    const columnsKeys = Object.keys(columns);
    const unknownColumn = first(keys.filter((key) => !columnsKeys.includes(key)));
    if (unknownColumn != null) {
      throw new UnknownAttributeError(new this.model(), unknownColumn);
    }

    return indexWith(keys, (key) => this.model.typeForAttribute(key));
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

  /**
   * @inventedArm toSym — PERMANENT
   * @inventedArm symbolToS — PERMANENT
   */
  returning(): string | undefined {
    if (!rtest(this._insertAll.returning)) return undefined;

    if (
      this._insertAll.returning instanceof Nodes.SqlLiteral ||
      (typeof this._insertAll.returning === "string" && !isSymbol(this._insertAll.returning))
    ) {
      return this._insertAll.returning.toString();
    } else {
      return (rbFArray(this._insertAll.returning) as string[])
        .map((attribute) => {
          attribute = symbolToS(toSym(attribute));
          if (this.model.isAttributeAlias(attribute)) {
            return `${this.quoteColumn(this.model.attributeAlias(attribute)!)} AS ${this.quoteColumn(attribute)}`;
          } else {
            return this.quoteColumn(attribute);
          }
        })
        .join(",");
    }
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
    return `INTO ${this.model.quotedTableName()} (${this.columnsList()})`;
  }

  async valuesList(): Promise<string> {
    const types = await this.extractTypesFromColumnsOn(this.model.tableName!, [
      ...this._insertAll.keysIncludingTimestamps(),
    ]);

    const valuesList = this._insertAll.mapKeyWithValue<unknown>((key, value) => {
      if (value instanceof Nodes.SqlLiteral) return value;
      const type = types[key];
      value = SerializeCastValue.serialize(type!, type!.cast(value));
      return value;
    });
    return this._connection.visitor.compile(new Nodes.ValuesList(valuesList));
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
    return aryJoin(
      filterMap(this.model.timestampAttributesForUpdateInModel(), (columnName) => {
        if (this.touchTimestampAttribute(columnName)) {
          return `${columnName}=(CASE WHEN (${this.updatableColumns()
            .map(block)
            .join(" AND ")}) THEN ${this.model.quotedTableName()}.${columnName} ELSE ${String(
            this._connection.highPrecisionCurrentTimestamp(),
          )} END),`;
        }
      }),
    );
  }

  /** @internal */
  private touchTimestampAttribute(columnName: string): boolean {
    return !this._insertAll.updatableColumns().includes(columnName);
  }

  rawUpdateSql(): Nodes.SqlLiteral | undefined {
    return this._insertAll.updateSql;
  }
}
