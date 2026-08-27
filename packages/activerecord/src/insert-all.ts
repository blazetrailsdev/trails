import { Temporal } from "@blazetrails/date";
import { Nodes, Visitors } from "@blazetrails/arel";
import { ArgumentError, SerializeCastValue, type Type } from "@blazetrails/activemodel";
import { IndexDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { UnknownAttributeError } from "./errors.js";
import type { Base } from "./base.js";

import { isFinderNeedsTypeCondition } from "./inheritance.js";
import type { Relation } from "./relation.js";
import { Result } from "./result.js";
import { isEmpty } from "@blazetrails/activesupport/ruby-empty";
import { except, isPresent, many, reverseMerge } from "@blazetrails/activesupport";
import { first } from "./ruby-first.js";
import { withConnection } from "./connection-handling.js";
import { allTimestampAttributesInModel, timestampAttributesForUpdateInModel } from "./timestamp.js";

type ModelClass = typeof Base;

// Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#column_name_with_order_matcher
// Intentionally more restrictive than Rails: quoted identifiers ("col", `col`) and COLLATE
// clauses are not matched. Callers with those forms must use Arel.sql(). This is the safe
// direction — false-negatives force Arel.sql(), false-positives would allow SQL injection.
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
 * The connection and schema-cache facts Rails' `InsertAll#initialize` reads
 * synchronously at `insert_all.rb:38-45` — `supports_insert_returning?`,
 * `supports_insert_conflict_target?`, `schema_cache.primary_keys(table_name)`
 * and `schema_cache.indexes(table_name)`. Every one of those is async in
 * trails, so `InsertAll.execute` resolves them before constructing and the
 * constructor body stays the pure assignment Rails' is.
 *
 * @noRailsEquivalent PERMANENT: a genuine TypeScript shortcoming — a
 *   constructor cannot await. Resolving in the async factory keeps the
 *   Rails-named constructor tail in place rather than deferring it to
 *   `execute`.
 * @internal
 */
interface ResolvedConnectionFacts {
  supportsInsertReturning: boolean;
  supportsInsertOnDuplicateSkip: boolean;
  supportsInsertOnDuplicateUpdate: boolean;
  supportsInsertConflictTarget: boolean;
  primaryKeys: string[];
  indexes: (tableName: string) => unknown[];
}

/**
 * Resolves the facts above off the connection and schema cache. A missing
 * support predicate reads as unsupported, matching Rails'
 * `AbstractAdapter#supports_insert_conflict_target?` returning false, so a
 * wrapper adapter that forgets to delegate cannot emit a bogus conflict
 * target.
 *
 * @noRailsEquivalent PERMANENT: the async half of `ResolvedConnectionFacts`
 *   above, for the same constructor-cannot-await reason.
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
  readonly connection: ModelClass["connection"];
  inserts: Record<string, unknown>[];
  readonly keys: Set<string>;
  /**
   * Initially the user's `:unique_by` input (column name, column list, or
   * index name). After `_populateUpdatableColumns` resolves, this is
   * mutated to the matching IndexDefinition — matching Rails' shape, so
   * Builder.conflictTarget can read `index.columns` / `index.where`.
   */
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

  /**
   * `facts` carries what Rails' constructor tail (insert_all.rb:38-45) reads
   * synchronously off the connection and schema cache; see
   * `ResolvedConnectionFacts`.
   *
   * @missingRailsArgs except — PERMANENT: Ruby's `scope_for_create.except(col)`
   * is a receiver-form call; JS objects have no `except`, so the activesupport
   * port takes the receiver as its first argument and the argument list is one
   * longer than Rails'. The Ruby arguments are passed unchanged after it.
   */
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

    // Rails: scope_for_create.except(model.inheritance_column) — STI type is
    // handled by resolveSti (reverse_merge) so it must not be re-injected here.
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
    // Mirrors Rails InsertAll#execute: build the log/instrumentation label
    // ("Book Bulk Insert" / "Book Upsert") and route through exec_insert_all
    // so the RETURNING rows are captured into an ActiveRecord::Result rather
    // than discarded (executeMutation only reports the affected-row count).
    let message = `${this.model.name} `;
    if (many(this.inserts)) message += "Bulk ";
    message += this.onDuplicate === "update" ? "Upsert" : "Insert";
    return this.connection.execInsertAll(await this.toSql(), message);
  }

  /**
   * Mirrors: ActiveRecord::InsertAll#to_sql — the adapter assembles the
   * dialect-specific statement from the Builder's fragments.
   * @internal
   */
  async toSql(): Promise<string> {
    return this.connection.buildInsertSql(new Builder(this));
  }

  /** Mirrors: ActiveRecord::InsertAll#updatable_columns (insert_all.rb:58-60). */
  updatableColumns(): string[] {
    const exclude = new Set([...this.readonlyColumns(), ...this.uniqueByColumns()]);
    return (this._updatableColumns ??= [...this.keys].filter((k) => !exclude.has(k)));
  }

  /**
   * Mirrors: ActiveRecord::InsertAll#primary_keys (insert_all.rb:61-63) — the
   * *database* primary keys, empty for an id-less table, distinct from the
   * model's configured `primary_key`.
   *
   * @missingRailsCall table_name — PERMANENT: Language shortcoming: Rails reads
   * `schema_cache.primary_keys(model.table_name)` here; that schema-cache read
   * is async in trails, so the table name is passed where the read happens
   * (`resolveConnectionFacts`) and this reader returns the resolved value.
   */
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
      // Rails calls verify_attributes here (insert_all.rb:79), after the
      // scope merge and the timestamps reverse_merge — and it must stay here,
      // not in the constructor: `keysIncludingTimestamps` reads the model's
      // timestamp attributes off the reflected schema, which is not loaded yet
      // at construction time.
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
    // Rails compares against keys_including_timestamps, NOT @keys — the caller
    // has already reverse_merged the create timestamps into `attributes`, so
    // both sides carry them whenever record_timestamps? is on.
    const expected = this.keysIncludingTimestamps();
    const rowKeys = new Set(Object.keys(attributes));
    if (rowKeys.size !== expected.size || ![...expected].every((k) => rowKeys.has(k))) {
      throw new ArgumentError("All objects being inserted must have the same keys");
    }
  }

  /**
   * @internal
   * Mirrors: ActiveRecord::InsertAll#configure_on_duplicate_update_logic
   * (insert_all.rb:129-143).
   */
  private configureOnDuplicateUpdateLogic(): void {
    const onDuplicate = this.onDuplicate;
    if (this.isCustomUpdateSqlProvided() && isPresent(this.updateOnly)) {
      // Rails: raise ArgumentError (insert_all.rb).
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

  /** @internal Mirrors: ActiveRecord::InsertAll#unique_by_columns */
  private uniqueByColumns(): string[] {
    // Mirrors Rails' `Array(unique_by&.columns)` — an expression index keeps
    // `columns` as a bare string, wrapped here into one element.
    if (!(this.uniqueBy instanceof IndexDefinition)) return [];
    return Array.isArray(this.uniqueBy.columns) ? this.uniqueBy.columns : [this.uniqueBy.columns];
  }

  /** @internal Mirrors: ActiveRecord::InsertAll#ensure_valid_options_for_connection! */
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
    // attributeAliases is on the AttributeMethods mixin host, not yet declared on typeof Base
    const aliases = (this.model as any).attributeAliases as Record<string, string> | undefined;
    if (!aliases) return false;
    return Object.keys(attributes).some((attr) => attr in aliases);
  }

  /** @internal */
  private resolveSti(): void {
    // Rails injects the STI type only for models that actually participate in STI
    // (`finder_needs_type_condition?` — a non-abstract subclass whose table carries
    // the inheritance column). Gating on the column-aware check, not the bare
    // hierarchical `descends_from_active_record?`, keeps a plain concrete subclass
    // with no `type` column (e.g. a readonly-attribute subclass) from inserting a
    // value into a non-existent column.
    if (!isFinderNeedsTypeCondition(this.model)) return;
    const stiType = this.model.stiName();
    // STI is active on this path, so the column resolves to a name; `?? "type"`
    // only satisfies the now-nullable getter's type.
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
    // Mirrors insert_all.rb:121-122: update_only and unique_by are alias-resolved
    // alongside the insert keys so the ON CONFLICT update list and conflict
    // target reference physical column names.
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

  /** @internal Mirrors: ActiveRecord::InsertAll#find_unique_index_for */
  private findUniqueIndexFor(
    uniqueBy: string | string[] | IndexDefinition | undefined,
  ): IndexDefinition | undefined {
    if (uniqueBy instanceof IndexDefinition) return uniqueBy;
    const conn = this.connection as { constructor?: { name?: string } };
    if (!this._facts.supportsInsertConflictTarget) {
      // Rails returns nil for a nil unique_by even when conflict targets are
      // unsupported (plain insertAll on MySQL); a given unique_by raises.
      if (uniqueBy == null) return undefined;
      throw new ArgumentError(
        `${(conn as any).constructor?.name ?? "Adapter"} does not support :unique_by`,
      );
    }
    // Rails: `name_or_columns = unique_by || model.primary_key`. The match runs
    // against the model's configured primary key, while the primary-key branch
    // below compares against the *database* primary keys (schema_cache), so a
    // model whose configured PK lacks a backing unique index (e.g. Speedometer)
    // raises rather than emitting a bogus conflict target.
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
    // The PK fallback is order-sensitive (Rails `match == primary_keys`,
    // insert_all.rb:163) — unlike the index match above, which sorts. A
    // composite PK supplied in a different column order falls through to the
    // raise, matching Rails. `primaryKeys()` is the schema-cache value.
    const dbPrimaryKeys = this.primaryKeys().map(String);
    if (match.join(",") === dbPrimaryKeys.join(",")) {
      return uniqueBy == null
        ? undefined
        : new IndexDefinition(tableName, `${tableName}_primary_key`, true, [...match]);
    }
    // Rails interpolates `name_or_columns` verbatim (insert_all.rb:165): a
    // scalar renders bare, an array as a bracketed list.
    const display = Array.isArray(uniqueBy)
      ? `[${match.join(", ")}]`
      : (uniqueBy ?? nameOrCols.join(", "));
    throw new ArgumentError(`No unique index found for ${display}`);
  }

  /**
   * @internal
   * Mirrors: ActiveRecord::InsertAll#unique_indexes (insert_all.rb:169-171).
   */
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

  /** Mirrors: ActiveRecord::InsertAll#timestamps_for_create (insert_all.rb:221-223). @internal */
  private timestampsForCreate(): Record<string, unknown> {
    const now = Temporal.Now.instant();
    const result: Record<string, unknown> = {};
    for (const col of allTimestampAttributesInModel.call(this.model as never)) {
      result[col] = now;
    }
    return result;
  }
}

/**
 * The fragment surface an adapter's `buildInsertSql` consumes to assemble a
 * dialect-specific INSERT statement. Mirrors the methods Rails'
 * `ActiveRecord::InsertAll::Builder` exposes to `connection.build_insert_sql`.
 *
 * Note: unlike Rails' two-fragment split (`"INSERT #{insert.into} #{insert.values_list}"`),
 * `into()` here bundles the compiled `VALUES (...)` list, so adapters emit just
 * `INSERT ${insert.into()}`. `Builder.valuesList()` still exists for the compile
 * step but isn't part of this contract.
 */
export interface InsertBuilder {
  /** Mirrors Rails `InsertAll::Builder`’s `attr_reader :model` (insert_all.rb:226). */
  readonly model: ModelClass;
  into(): string;
  conflictTarget(): string;
  returning(): string | undefined;
  updatableColumns(): string[];
  touchModelTimestampsUnless(block: (col: string) => string): string;
  rawUpdateSql(): Nodes.SqlLiteral | undefined;
  skipDuplicates(): boolean;
  updateDuplicates(): boolean;
  /** Mirrors Rails `InsertAll::Builder`’s `delegate :keys, to: :insert_all` (insert_all.rb:228). */
  readonly keys: Set<string>;
  quotedTableName(): string;
}

/**
 * Builds SQL fragments for InsertAll operations.
 *
 * Mirrors: ActiveRecord::InsertAll::Builder
 *
 * Identifier quoting delegates to the connection's `quoteColumnName` /
 * `quoteTableName` (mirroring Rails' `quote_column` → `quote_column_name`
 * indirection), so each dialect emits its own form directly: SQLite/PG
 * double-quote (with embedded `"` doubled), MySQL backticks. Embedded-quote
 * doubling therefore comes from the adapter, not ad-hoc `.replace` here.
 *
 * MySQL note: the adapter's `mysqlQuote()` still rewrites double-quoted
 * identifiers to backticks at execution time for *Arel-generated* SQL (the
 * compiled VALUES list runs through the visitor). That blanket pass is still
 * needed and stays; the identifiers this Builder emits for MySQL are already
 * backticks, which `mysqlQuote()` passes through unchanged (it only rewrites
 * `"`), so there is no double-conversion.
 */
export class Builder implements InsertBuilder {
  readonly model: ModelClass;
  private _insertAll: InsertAll;
  private _connection: ModelClass["connection"];

  constructor(insertAll: InsertAll) {
    this._insertAll = insertAll;
    this.model = insertAll.model;
    this._connection = insertAll.connection;
  }

  /**
   * Mirrors: ActiveRecord::InsertAll::Builder#extract_types_from_columns_on
   * (insert_all.rb:306-313).
   *
   * Rails reads `@model.schema_cache.columns_hash(table_name)`. trails' sync
   * read of that hash is `Model.columnsHash()` (model-schema.ts), which is
   * bound to the model's own table — `SchemaCache#columnsHash` is async here and
   * this builder path cannot await (the RFC 0073 constraint
   * `getCachedColumnsHash` documents). `tableName` therefore does not steer the
   * read; it is kept because Rails' signature has it and its sole caller passes
   * `model.table_name`, so the two reads are the same hash.
   * @internal
   */
  private extractTypesFromColumnsOn(tableName: string, keys: string[]): Record<string, Type> {
    const columns = this.model.columnsHash();

    // Ruby's `columns_hash` blocks on a checkout, so it is never empty for a
    // real table; trails' sync read can be cold, and judging keys against an
    // empty hash would raise on every column of a model whose `table_name=`
    // reset the schema (`Book.table_name = "db.books"`, insert_all_test.rb).
    if (Object.keys(columns).length > 0) {
      const unknownColumn = keys.find((key) => !(key in columns));
      if (unknownColumn !== undefined) {
        // UnknownAttributeError only reads record?.constructor?.name; skip the
        // full constructor (attribute init, defaults, callbacks) on the error
        // path by handing it a bare object with the right constructor link.
        throw new UnknownAttributeError({ constructor: this.model }, unknownColumn);
      }
    }

    const types: Record<string, Type> = {};
    for (const key of keys) types[key] = this.model.typeForAttribute(key);
    return types;
  }

  /** Mirrors Rails `quote_column` → `connection.quote_column_name`. @internal */
  private quoteColumn(name: string): string {
    return this._connection.quoteColumnName(name);
  }

  /** Mirrors Rails `connection.quote_table_name`. @internal */
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

  /** Mirrors: `delegate :keys, to: :insert_all` (insert_all.rb:228). */
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
      if (this._connection.adapterName === "mysql2") {
        return `INTO ${tableName} () VALUES ()`;
      }
      return `INTO ${tableName} DEFAULT VALUES`;
    }
    const columnsList = keys.map((k) => this.quoteColumn(k)).join(",");
    const compiledValues = this._visitor().compile(this.valuesList());
    return `INTO ${tableName} (${columnsList}) ${compiledValues}`;
  }

  valuesList(): Nodes.ValuesList {
    const types = this.extractTypesFromColumnsOn(this.model.tableName, [
      ...this._insertAll.keysIncludingTimestamps(),
    ]);

    const rows = this._insertAll.mapKeyWithValue<unknown>((key, value) => {
      if (value instanceof Nodes.SqlLiteral) return value;
      const type = types[key];
      value = SerializeCastValue.serialize(type, type.cast(value));
      // Rails hands the serialized value to the ValuesList *as a value*
      // (insert_all.rb:246): `connection.visitor.compile` renders it, quoting
      // each entry through `connection.quote` (to_sql.rb:106-114). So no
      // pre-quoting here — the visitor's `quote` is the single quoting site,
      // and date/time, binary and array `Data` values all resolve their dialect
      // from the connection's own `quoted_date` / `quoted_binary` / array
      // encoder there.
      return value;
    });
    return new Nodes.ValuesList(rows);
  }

  conflictTarget(): string {
    // Mirrors ActiveRecord::InsertAll::Builder#conflict_target: a resolved
    // unique index emits its columns (and partial WHERE); update_duplicates
    // without a unique_by falls back to the primary keys; the skip path
    // without a unique_by emits no target (`ON CONFLICT DO NOTHING` catches
    // every constraint).
    const index = this._insertAll.uniqueBy;
    if (index instanceof IndexDefinition) {
      // Expression indexes store `columns` as a raw SQL string (e.g.
      // "(lower(external_id))"), kept verbatim like Rails' format_columns;
      // ordinary column lists are quoted.
      const rawCols = index.columns as unknown as string | string[];
      const cols = Array.isArray(rawCols)
        ? rawCols.map((c) => this.quoteColumn(c)).join(",")
        : rawCols;
      return index.where ? `(${cols}) WHERE ${index.where}` : `(${cols})`;
    }
    if (this._insertAll.updateDuplicates()) {
      return `(${this._insertAll
        .primaryKeys()
        .map((c) => this.quoteColumn(c))
        .join(",")})`;
    }
    return "";
  }

  updatableColumns(): string[] {
    return this._insertAll.updatableColumns().map((c) => this.quoteColumn(c));
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

  /** Mirrors Rails `touch_timestamp_attribute?` (insert_all.rb:300-302). @internal */
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
    if (this._connection.adapterName === "mysql2") return new Visitors.MySQL(q);
    if (this._connection.adapterName === "postgres") return new Visitors.PostgreSQL(q);
    return new Visitors.SQLite(q);
  }
}
