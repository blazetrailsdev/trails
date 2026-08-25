import type { SchemaQuoter } from "./assert-schema-adapter.js";
import type { Column } from "../column.js";
import { singularize, pluralize, assertValidKeys } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { SchemaDumper } from "../../schema-dumper.js";
import {
  globalPluralizeTableNames,
  globalTableNamePrefix,
  globalTableNameSuffix,
  globalGetPrimaryKey,
} from "./table-name-options.js";

/** @internal */
export function splitColumnNames(
  args: unknown[],
  columnType: string,
): { names: string[]; options: ColumnOptions } {
  const rest = [...args];
  const last = rest[rest.length - 1];
  const options =
    typeof last === "object" && last !== null
      ? (rest.pop() as ColumnOptions)
      : ({} as ColumnOptions);
  if (rest.length === 0) {
    throw new ArgumentError(`Missing column name(s) for ${columnType}`);
  }
  return { names: rest as string[], options };
}

/**
 * @internal Shared identifier guard for MySQL bare-identifier emission
 * (charset/collation). MySQL requires `CHARACTER SET`/`COLLATE` as bare
 * identifiers — `quoteColumnName` (backtick-wrapping) produces invalid DDL
 * like `COLLATE \`utf8mb4_bin\``. This regex substitutes for quoting: only
 * safe charset/collation names pass.
 */
/**
 * @internal RegExp#test with a g/y-flagged pattern mutates shared lastIndex
 * state across calls (Ruby's Regexp#match? has no such statefulness), so a
 * user-configured ignore pattern with those flags would alternate results.
 * schema-dumper.ts strips the flags the same way in its fallback paths.
 */
function statelessTest(pattern: RegExp, value: string): boolean {
  const stateless =
    pattern.global || pattern.sticky
      ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""))
      : pattern;
  return stateless.test(value);
}

export function assertSafeMysqlIdentifier(value: string, kind: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new ArgumentError(`Invalid MySQL ${kind}: ${JSON.stringify(value)}`);
  }
}

/**
 * Column type mapping.
 */
export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "timestamp"
  | "binary"
  | "json"
  | "jsonb"
  | "char"
  | "primary_key"
  | "uuid"
  | (string & {});

export type PrimaryKeyType = "uuid";

export type ReferentialAction = "cascade" | "nullify" | "restrict";

/**
 * The adapter surface {@link TableDefinition.newForeignKeyDefinition} reads
 * beyond {@link SchemaQuoter}: the table_name_prefix/suffix (Rails reads these
 * off `ActiveRecord::Base`) and `foreign_key_options` that fills the default
 * column and SHA256 `fk_rails_<hex>` name.
 * @internal
 */
export interface ForeignKeyOptionsAdapter {
  tableNamePrefix?: string;
  tableNameSuffix?: string;
  /** @internal */
  foreignKeyOptions(
    fromTable: string,
    toTable: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
}

/**
 * The `@conn` surface `new_check_constraint_definition` reaches for.
 *
 * @internal
 */
export interface CheckConstraintOptionsAdapter {
  /** @internal */
  checkConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
}

/**
 * The `@conn` surface `TableDefinition` reads (schema_definitions.rb:575-591:
 * `foreign_key_options`, `check_constraint_options`,
 * `valid_column_definition_options`), plus the quoting subset schema emission
 * needs. In Rails `@conn` is the adapter itself, with `SchemaStatements` mixed
 * in, so every one of these is always there.
 * @internal
 */
export type TableDefinitionConn = SchemaQuoter &
  ForeignKeyOptionsAdapter &
  CheckConstraintOptionsAdapter & {
    /** @internal */
    validColumnDefinitionOptions(): string[];
  };

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ColumnDefinition
 */
export class ColumnDefinition {
  static readonly OPTION_NAMES = [
    "limit",
    "precision",
    "scale",
    "default",
    "null",
    "collation",
    "comment",
    "primaryKey",
    "ifExists",
    "ifNotExists",
  ];

  sqlType?: string;
  datetimePhysicalType?: string;
  constructor(
    readonly name: string,
    readonly type: ColumnType,
    readonly options: ColumnOptions = {},
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AddColumnDefinition
 */
export class AddColumnDefinition {
  constructor(readonly column: ColumnDefinition) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::CreateIndexDefinition
 */
export class CreateIndexDefinition {
  constructor(
    readonly index: IndexDefinition,
    readonly algorithm?: string,
    readonly ifNotExists: boolean = false,
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ForeignKeyDefinition
 */
export interface AddForeignKeyOptions {
  column?: string | string[];
  primaryKey?: string | string[];
  name?: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  deferrable?: "immediate" | "deferred" | false;
  validate?: boolean | null;
  ifNotExists?: boolean;
}

/** Mirrors: the keyword args of `remove_foreign_key(from_table, to_table = nil, **options)` */
export interface RemoveForeignKeyOptions extends AddForeignKeyOptions {
  toTable?: string;
  ifExists?: boolean;
}

/** Options accepted by the `foreignKey` field of `ReferenceDefinition`. */
export interface ReferenceForeignKeyOptions extends AddForeignKeyOptions {
  toTable?: string;
}

/**
 * Mirror Rails' composite-arity guard (schema_statements.rb:1258-1266): once
 * `foreign_key_options` has filled the default `column`, a composite FK
 * (either `column` or `primaryKey` given as an array) must reference exactly as
 * many `column`s as `primaryKey`s. `Array(nil)` is empty in Ruby, so a lone
 * array with no counterpart also mismatches.
 * @internal
 */
export function assertCompositeForeignKeyArity(
  toTable: string,
  column: unknown,
  primaryKey: unknown,
): void {
  if (!Array.isArray(column) && !Array.isArray(primaryKey)) return;
  const size = (v: unknown): number => (Array.isArray(v) ? v.length : v == null ? 0 : 1);
  if (size(primaryKey) !== size(column)) {
    throw new ArgumentError(
      `For composite primary keys, specify :column and :primary_key, where ` +
        `:column must reference all the :primary_key columns from ${JSON.stringify(toTable)}`,
    );
  }
}

/**
 * Lookup options accepted by ForeignKeyDefinition#isDefinedFor / foreignKeyFor,
 * mirroring the keyword args Rails `defined_for?` matches generically.
 */
export interface ForeignKeyLookupOptions {
  toTable?: string;
  column?: string | string[];
  name?: string;
  validate?: boolean | null;
  primaryKey?: string | string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  deferrable?: "immediate" | "deferred" | false;
}

/**
 * The generic (sliceable) option keys Rails' `defined_for?` matches via
 * `options.slice(*self.options.keys)`. `to_table`/`validate` are handled
 * separately and are never sliced.
 */
export type ForeignKeyStoredOptionKey =
  | "column"
  | "name"
  | "primaryKey"
  | "onDelete"
  | "onUpdate"
  | "deferrable";

/**
 * The stored-option-key set produced by Rails' `foreign_key_options`: it always
 * fills in `:column` and `:name`, and carries `:primary_key`/`:on_delete`/
 * `:on_update`/`:deferrable` only when the caller explicitly passed them. Used
 * by every `add_foreign_key`-style construction path (DSL + abstract/PG
 * `addForeignKey`) so `isDefinedFor` slices a defaulted key (e.g. primaryKey
 * "id") out rather than mismatching it.
 * @internal
 */
export function foreignKeyOptionsStoredKeys(
  options: Pick<AddForeignKeyOptions, "primaryKey" | "onDelete" | "onUpdate" | "deferrable">,
): ForeignKeyStoredOptionKey[] {
  const keys: ForeignKeyStoredOptionKey[] = ["column", "name"];
  if (options.primaryKey !== undefined) keys.push("primaryKey");
  if (options.onDelete !== undefined) keys.push("onDelete");
  if (options.onUpdate !== undefined) keys.push("onUpdate");
  if (options.deferrable !== undefined) keys.push("deferrable");
  return keys;
}

export class ForeignKeyDefinition {
  readonly fromTable: string;
  readonly toTable: string;
  readonly column: string | string[];
  readonly primaryKey: string | string[];
  readonly name: string;
  readonly onDelete?: ReferentialAction;
  readonly onUpdate?: ReferentialAction;
  readonly deferrable?: "immediate" | "deferred" | false;
  readonly validate: boolean | null;
  /**
   * Whether `:validate` was stored on the options hash (Rails introspection
   * sets it only on PostgreSQL; mysql/sqlite leave it absent). Mirrors the
   * `options.fetch(:validate, validate)` fallback in `defined_for?`: when the
   * definition did not store `validate`, a `validate` lookup is ignored.
   * @internal
   */
  readonly storesValidate: boolean;

  /**
   * Which generic option keys this FK actually carries, mirroring Rails'
   * `self.options.keys`. `isDefinedFor` slices lookup keys to this set so a
   * key the definition never stored is ignored (matches), per
   * `options.slice(*self.options.keys)`. Rails reads this off the raw options
   * hash; trails has no such hash, so we record the key set explicitly.
   * @internal
   */
  readonly storedOptionKeys: ReadonlySet<ForeignKeyStoredOptionKey>;

  constructor(
    fromTable: string,
    toTable: string,
    column: string | string[],
    primaryKey: string | string[],
    name: string,
    onDelete?: ReferentialAction,
    onUpdate?: ReferentialAction,
    deferrable?: "immediate" | "deferred" | false,
    validate?: boolean | null,
    storedOptionKeys?: Iterable<ForeignKeyStoredOptionKey>,
  ) {
    this.fromTable = fromTable;
    this.toTable = toTable;
    this.column = column;
    this.primaryKey = primaryKey;
    this.name = name;
    this.onDelete = onDelete;
    this.onUpdate = onUpdate;
    this.deferrable = deferrable;
    // Rails reads `validate?` off `options.fetch(:validate, true)`, so a stored
    // value — nil included — survives and the `true` default applies only when
    // the key is absent; storesValidate records whether `:validate` was actually
    // on the options hash (PG introspection sets it; mysql/sqlite/DSL-without-it
    // leave it absent), driving the fetch-fallback in isDefinedFor.
    this.storesValidate = validate !== undefined;
    this.validate = this.storesValidate ? (validate as boolean | null) : true;
    this.storedOptionKeys = new Set(
      storedOptionKeys ?? ["column", "name", "primaryKey", "onDelete", "onUpdate", "deferrable"],
    );
  }

  get isCustomPrimaryKey(): boolean {
    return this.primaryKey !== this.defaultPrimaryKey;
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::ForeignKeyDefinition#default_primary_key
   * @internal
   */
  get defaultPrimaryKey(): string {
    return "id";
  }

  /**
   * @missingRailsCall fetch — PERMANENT: Verified per-site (RFC 0106):
   *   `options.fetch(:validate, true)`
   *   (`connection_adapters/schema_definitions.rb:153`) — `options` is a plain
   *   TS object, not a Hash, so the default-substituting read has no `fetch`
   *   call spelling; the body is `this.options.validate ?? true`.
   */
  get isValidate(): boolean | null {
    return this.validate;
  }

  /** Alias of isValidate (Rails: `alias validated? validate?`). */
  get isValidated(): boolean | null {
    return this.isValidate;
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::ForeignKeyDefinition#export_name_on_schema_dump?
  /**
   * @missingRailsCall match? — PERMANENT: Verified per-site (RFC 0106):
   *   `!ActiveRecord::SchemaDumper.fk_ignore_pattern.match?(name) if name`
   *   (`connection_adapters/schema_definitions.rb:158`). Ruby's `Regexp#match?`
   *   is stateless; JS `RegExp#test` advances `lastIndex` on a `/g` pattern, and
   *   `fk_ignore_pattern` is user-assignable
   *   (`schema-definitions.trails.test.ts` pins a `/g` pattern giving two
   *   different answers on consecutive reads). The `statelessTest` wrapper is
   *   that language shortcoming, and `test` is the only JS analogue the gate
   *   credits for `match?`.
   */
  get isExportNameOnSchemaDump(): boolean {
    return this.name != null ? !statelessTest(SchemaDumper.fkIgnorePattern, this.name) : false;
  }

  isDefinedFor(options: ForeignKeyLookupOptions = {}): boolean {
    // Rails compares element-wise after to_s:
    // Array(self.options[k]).map(&:to_s) == Array(v).map(&:to_s)
    // A nil stored option becomes `Array(nil) => []`, so normalize
    // undefined/null to an empty array rather than `["undefined"]`.
    const toArray = (c: unknown): string[] =>
      c === undefined || c === null ? [] : Array.isArray(c) ? c.map(String) : [String(c)];
    const optionEqual = (a: unknown, b: unknown): boolean => {
      const aa = toArray(a);
      const bb = toArray(b);
      return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
    };
    // Rails opens defined_for? with `options = options.slice(*self.options.keys)`,
    // dropping any lookup key the definition never stored before the generic
    // compare. A sliced-out key is therefore ignored (matches).
    const stored = (key: ForeignKeyStoredOptionKey): boolean => this.storedOptionKeys.has(key);
    return (
      (options.toTable === undefined || options.toTable.toString() === this.toTable) &&
      // Mirrors `validate.nil? || validate == self.options.fetch(:validate, validate)`:
      // when `:validate` was not stored on the definition (mysql/sqlite
      // introspection, or an add/DSL path that didn't pass it), the fetch falls
      // back to the lookup value, so the comparison is trivially true.
      (options.validate == null || !this.storesValidate || options.validate === this.validate) &&
      (options.column === undefined ||
        !stored("column") ||
        optionEqual(options.column, this.column)) &&
      (options.name === undefined || !stored("name") || options.name === this.name) &&
      (options.primaryKey === undefined ||
        !stored("primaryKey") ||
        optionEqual(options.primaryKey, this.primaryKey)) &&
      (options.onDelete === undefined ||
        !stored("onDelete") ||
        optionEqual(options.onDelete, this.onDelete)) &&
      (options.onUpdate === undefined ||
        !stored("onUpdate") ||
        optionEqual(options.onUpdate, this.onUpdate)) &&
      (options.deferrable === undefined ||
        !stored("deferrable") ||
        optionEqual(options.deferrable, this.deferrable))
    );
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PrimaryKeyDefinition
 * @internal
 */
export class PrimaryKeyDefinition {
  constructor(readonly name: string[]) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::CheckConstraintDefinition
 */
export class CheckConstraintDefinition {
  readonly tableName: string;
  readonly expression: string;
  readonly options: { name?: string; validate?: boolean | null; [key: string]: unknown };

  constructor(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean | null; [key: string]: unknown } = {},
  ) {
    this.tableName = tableName;
    this.expression = expression;
    this.options = options;
  }

  get name(): string {
    return this.options.name as string;
  }

  /**
   * Mirrors: `validate?` (schema_definitions.rb:180-183). `options.fetch` returns
   * a stored nil as nil; the `true` default applies only when the key is absent.
   */
  get validate(): boolean | null {
    return "validate" in this.options ? (this.options.validate as boolean | null) : true;
  }

  get isValidate(): boolean | null {
    return this.validate;
  }

  get isExportNameOnSchemaDump(): boolean {
    return this.name != null ? !statelessTest(SchemaDumper.chkIgnorePattern, this.name) : false;
  }

  /**
   * Mirrors: `defined_for?(name:, expression: nil, validate: nil, **options)`
   * (schema_definitions.rb:189-195).
   *
   * `expression` is accepted but never compared — Rails does not compare it
   * either (it is used upstream to derive the name), and a raw-string compare
   * would spuriously fail against the adapter's normalized form (e.g.
   * PostgreSQL's `pg_get_constraintdef`).
   *
   * The validate arm is `validate.nil? || validate == options.fetch(:validate,
   * validate)`: with `:validate` unstored the fetch falls back to the lookup
   * value, so the comparison is trivially true and the `validate?` getter's
   * `true` default must not stand in for it. The residual arm is
   * `options.slice(*self.options.keys)` followed by the `to_s` compare, where
   * Ruby's `nil.to_s` is `""`.
   */
  isDefinedFor(options: {
    name: string | null | undefined;
    expression?: string;
    validate?: boolean | null;
    [key: string]: unknown;
  }): boolean {
    const { name, expression: _expression, validate, ...rest } = options;
    const sliced = Object.entries(rest).filter(([k]) => k in this.options);
    const toS = (v: unknown): string => (v == null ? "" : String(v));
    return (
      this.name === (name == null ? "" : name.toString()) &&
      (validate == null || !("validate" in this.options) || validate === this.validate) &&
      sliced.every(([k, v]) => toS(this.options[k]) === toS(v))
    );
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ChangeColumnDefinition
 */
export class ChangeColumnDefinition {
  constructor(
    readonly column: ColumnDefinition,
    readonly name: string,
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition
 */
export class ChangeColumnDefaultDefinition {
  readonly default: unknown;
  constructor(
    readonly column: Column,
    defaultValue: unknown,
  ) {
    this.default = defaultValue;
  }
}

/**
 * Typed shape for the hash form of `createTable`'s `id:` option.
 * Mirrors the Rails subset: `id: { type: :string, collation: "utf8mb4_bin" }` etc.
 */
export interface IdHashOptions {
  type?: ColumnType;
  limit?: number;
  default?: unknown;
  charset?: string;
  collation?: string;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  comment?: string;
  autoIncrement?: boolean;
}

export interface ColumnOptions {
  null?: boolean;
  default?: unknown;
  limit?: number;
  precision?: number | null;
  scale?: number;
  index?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  array?: boolean;
  charset?: string;
  collation?: string;
  comment?: string | null;
  ifExists?: boolean;
  ifNotExists?: boolean;
  autoIncrement?: boolean;
  unsigned?: boolean;
  // MySQL column placement (Rails: `t.column x, :string, first: true`/`after:`),
  // read by `add_column_options!` and carried through `ReferenceDefinition`'s
  // `options.slice(:null, :first, :after)` (schema_definitions.rb:259).
  first?: boolean;
  after?: string;
  // MySQL blob/text sizing (Rails: `t.binary x, size: :tiny`). Maps to the
  // tiny/medium/long type prefix; ignored on adapters without sized blobs.
  size?: "tiny" | "medium" | "long";
  // Virtual/generated-column options (Rails: `t.virtual ..., type:, as:, stored:`).
  // `as`/`stored` are read by MySQL/PostgreSQL/SQLite `add_column_options!`;
  // `type` is the underlying type read by their `new_column_definition` when the
  // positional type is `:virtual`.
  type?: ColumnType;
  as?: string;
  stored?: boolean;
  _usesLegacyReferenceIndexName?: boolean;
  _skipValidateOptions?: boolean;
}

/**
 * Options passed to `add_column_options!` — a column's options merged with a
 * `column` back-reference to the owning ColumnDefinition (Rails:
 * `column_options` returns `options.merge(column: o)`).
 */
export interface AddColumnOptions extends ColumnOptions {
  column?: ColumnDefinition;
}

export interface AddIndexOptions {
  unique?: boolean;
  name?: string;
  where?: string;
  /**
   * `add_index(table, columns, order: :desc)` applies one direction to every
   * column — `options_for_index_columns` takes the bare value as well as the
   * per-column Hash.
   */
  order?: string | Record<string, string>;
  using?: string;
  /**
   * `internal:` is add_index's own kwarg, outside the asserted option set
   * (schema_statements.rb:1476-1477); `copy_table_indexes` passes it
   * (sqlite3_adapter.rb:668).
   */
  internal?: boolean;
  type?: string;
  comment?: string;
  ifNotExists?: boolean;
  length?: number | null | Record<string, number>;
  opclass?: Record<string, string>;
  include?: string[];
  nullsNotDistinct?: boolean;
  algorithm?: string;
}

export interface RemoveReferenceOptions {
  polymorphic?: boolean;
  foreignKey?: boolean | { toTable?: string; column?: string };
  ifExists?: boolean;
  ifNotExists?: boolean;
}

export interface AddReferenceOptions extends Omit<ColumnOptions, "index"> {
  polymorphic?: boolean | Record<string, unknown>;
  foreignKey?: boolean | ReferenceForeignKeyOptions;
  type?: ColumnType;
  index?: boolean | AddIndexOptions;
  ifExists?: boolean;
  ifNotExists?: boolean;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::IndexDefinition
 */
export class IndexDefinition {
  readonly table: string;
  readonly name: string;
  readonly unique: boolean;
  // A string for expression indexes (the raw expression), an array of column
  // names otherwise — mirrors Rails' IndexDefinition#columns.
  readonly columns: string | string[];
  readonly where?: string;
  readonly orders: Record<string, string> | string;
  readonly lengths: Record<string, number> | number;
  readonly opclasses: Record<string, string> | string;
  readonly type?: string;
  readonly using?: string;
  readonly include?: string[];
  readonly nullsNotDistinct?: boolean;
  readonly comment?: string;
  readonly valid: boolean;
  readonly algorithm?: string;
  readonly ifNotExists?: boolean;

  constructor(
    table: string,
    name: string,
    unique: boolean = false,
    columns: string | string[] = [],
    options: {
      where?: string;
      orders?: Record<string, string> | string;
      lengths?: number | null | Record<string, number>;
      opclasses?: Record<string, string> | string;
      type?: string;
      using?: string;
      include?: string[];
      algorithm?: string;
      ifNotExists?: boolean;
      nullsNotDistinct?: boolean;
      comment?: string;
      valid?: boolean;
    } = {},
  ) {
    this.table = table;
    this.name = name;
    this.unique = unique;
    this.columns = columns;
    this.where = options.where;
    this.orders = this.conciseOptions(options.orders ?? {});
    this.lengths =
      typeof options.lengths === "number"
        ? options.lengths
        : this.conciseOptions(options.lengths ?? {});
    this.opclasses = this.conciseOptions(options.opclasses ?? {});
    this.type = options.type;
    this.using = options.using;
    this.include = options.include;
    this.nullsNotDistinct = options.nullsNotDistinct;
    this.comment = options.comment;
    this.valid = options.valid ?? true;
    this.algorithm = options.algorithm;
    this.ifNotExists = options.ifNotExists;
  }

  columnOptions(): {
    length: Record<string, number> | number;
    order: Record<string, string> | string;
    opclass: Record<string, string> | string;
  } {
    return {
      length: this.lengths,
      order: this.orders,
      opclass: this.opclasses,
    };
  }

  isDefinedFor(
    columns?: string | string[],
    options: {
      column?: string | string[];
      name?: string;
      unique?: boolean;
      valid?: boolean;
      include?: string[];
      nullsNotDistinct?: boolean;
    } = {},
  ): boolean {
    // Mirrors Rails: `columns = options[:column] if columns.blank?`
    // Ruby `blank?` is true for nil, "" and [].
    const isBlank =
      columns == null || (Array.isArray(columns) ? columns.length === 0 : columns === "");
    if (isBlank) columns = options.column;
    if (options.name && this.name !== options.name) return false;
    if (options.unique !== undefined && this.unique !== options.unique) return false;
    if (options.valid !== undefined && this.valid !== options.valid) return false;
    if (options.include !== undefined) {
      const a = (this.include ?? []).slice().sort();
      const b = options.include.slice().sort();
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) return false;
    }
    if (
      options.nullsNotDistinct !== undefined &&
      this.nullsNotDistinct !== options.nullsNotDistinct
    )
      return false;
    if (columns !== undefined) {
      const cols = Array.isArray(columns) ? columns : [columns];
      // Mirrors Rails' `Array(self.columns) == Array(columns)` — an expression
      // index keeps `columns` as a bare string, wrapped here into one element.
      const own = Array.isArray(this.columns) ? this.columns : [this.columns];
      if (own.length !== cols.length || own.some((c, i) => c !== cols[i])) return false;
    }
    return true;
  }

  /** @internal */
  private conciseOptions<T>(options: Record<string, T> | T): Record<string, T> | T {
    if (options == null || typeof options !== "object") return options;
    const values = Object.values(options as Record<string, T>);
    if (this.columns.length === values.length && new Set(values).size === 1) {
      return values[0];
    }
    return options;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ColumnMethods
 *
 * Interface for column type methods shared between TableDefinition and Table.
 */
export interface ColumnMethods {
  string(...names: string[]): unknown;
  string(...args: [...names: string[], options: ColumnOptions]): unknown;
  text(...names: string[]): unknown;
  text(...args: [...names: string[], options: ColumnOptions]): unknown;
  integer(...names: string[]): unknown;
  integer(...args: [...names: string[], options: ColumnOptions]): unknown;
  bigint(...names: string[]): unknown;
  bigint(...args: [...names: string[], options: ColumnOptions]): unknown;
  float(...names: string[]): unknown;
  float(...args: [...names: string[], options: ColumnOptions]): unknown;
  decimal(...names: string[]): unknown;
  decimal(...args: [...names: string[], options: ColumnOptions]): unknown;
  boolean(...names: string[]): unknown;
  boolean(...args: [...names: string[], options: ColumnOptions]): unknown;
  date(...names: string[]): unknown;
  date(...args: [...names: string[], options: ColumnOptions]): unknown;
  datetime(...names: string[]): unknown;
  datetime(...args: [...names: string[], options: ColumnOptions]): unknown;
  timestamp(...names: string[]): unknown;
  timestamp(...args: [...names: string[], options: ColumnOptions]): unknown;
  binary(...names: string[]): unknown;
  binary(...args: [...names: string[], options: ColumnOptions]): unknown;
  blob(...names: string[]): unknown;
  blob(...args: [...names: string[], options: ColumnOptions]): unknown;
  numeric(...names: string[]): unknown;
  numeric(...args: [...names: string[], options: ColumnOptions]): unknown;
  json(...names: string[]): unknown;
  json(...args: [...names: string[], options: ColumnOptions]): unknown;
  virtual(...names: string[]): unknown;
  virtual(
    ...args: [
      ...names: string[],
      options: ColumnOptions & { type?: ColumnType; as?: string; stored?: boolean },
    ]
  ): unknown;
}

/** @internal */
export interface ReferenceDefinitionConnection {
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  addIndex(tableName: string, columnNames: string[], options?: AddIndexOptions): Promise<void>;
  addForeignKey(fromTable: string, toTable: string, options?: AddForeignKeyOptions): Promise<void>;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ReferenceDefinition
 */
export class ReferenceDefinition {
  readonly name: string;
  /** @internal */
  readonly polymorphic: boolean | Record<string, unknown>;
  readonly index: boolean | AddIndexOptions;
  readonly foreignKey: boolean | ReferenceForeignKeyOptions;
  readonly type: ColumnType;
  readonly options: Omit<ColumnOptions, "index">;

  constructor(
    name: string,
    options: Omit<ColumnOptions, "index"> & {
      polymorphic?: boolean | Record<string, unknown>;
      foreignKey?: boolean | ReferenceForeignKeyOptions;
      index?: boolean | AddIndexOptions;
      type?: ColumnType;
    } = {},
  ) {
    if (options.polymorphic && options.foreignKey) {
      throw new ArgumentError("Cannot add a foreign key to a polymorphic relation");
    }
    this.name = name;
    this.polymorphic = options.polymorphic ?? false;
    this.index = options.index !== false ? (options.index ?? true) : false;
    this.foreignKey = options.foreignKey ?? false;
    // Rails' ReferenceDefinition defaults `type: :bigint`
    // (schema_definitions.rb:204) — the same class backs both `t.references`
    // and `add_reference`, so the reference column lines up with the default
    // `bigint` primary key of the table it points at.
    this.type = options.type ?? "bigint";
    const { polymorphic: _, foreignKey: _fk, index: _idx, type: _t, ...rest } = options;
    this.options = rest;
  }

  async add(tableName: string, connection: ReferenceDefinitionConnection): Promise<void> {
    for (const [colName, colType, colOpts] of this.columns()) {
      await connection.addColumn(tableName, colName, colType, colOpts);
    }
    if (this.index) {
      await connection.addIndex(tableName, this.columnNames(), this.indexOptions(tableName));
    }
    if (this.foreignKey) {
      await connection.addForeignKey(
        tableName,
        this.foreignTableName(),
        this.foreignKeyOptions() as AddForeignKeyOptions,
      );
    }
  }

  addTo(table: TableDefinition): void {
    for (const [colName, colType, colOpts] of this.columns()) {
      table.column(colName, colType, colOpts);
    }
    if (this.index) {
      table.index(this.columnNames(), this.indexOptions(table.name));
    }
    if (this.foreignKey) {
      table.foreignKey(this.foreignTableName(), this.foreignKeyOptions() as AddForeignKeyOptions);
    }
  }

  /** @internal */
  private asOptions(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * @internal
   *
   * @missingRailsCall slice — PERMANENT: Per-entry verified (RFC 0032 wide-entry
   *   verification): Rails schema_definitions.rb:254-256 is
   *   `options.slice(:if_exists, :if_not_exists)`; trails
   *   schema-definitions.ts:675-680 picks the two keys explicitly.
   */
  private conditionalOptions(): Pick<ColumnOptions, "ifExists" | "ifNotExists"> {
    const result: Pick<ColumnOptions, "ifExists" | "ifNotExists"> = {};
    if (this.options.ifExists !== undefined) result.ifExists = this.options.ifExists;
    if (this.options.ifNotExists !== undefined) result.ifNotExists = this.options.ifNotExists;
    return result;
  }

  /**
   * @internal
   *
   * @missingRailsCall merge — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_definitions.rb:259 chains two `merge`s, spelled as one object
   *   spread in trails (schema-definitions.ts:870-878). Same keys, same
   *   precedence.
   * @missingRailsCall slice — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_definitions.rb:259's `options.slice(:null, :first, :after)` is
   *   spelled as three presence-guarded spreads in trails
   *   (schema-definitions.ts:874-876) — `Hash#slice` has no ported analogue for
   *   a plain object, and a bare spread would introduce the keys as `undefined`.
   */
  private polymorphicOptions(): ColumnOptions {
    return {
      ...this.asOptions(this.polymorphic),
      ...this.conditionalOptions(),
      ...(this.options.null !== undefined ? { null: this.options.null } : {}),
      ...(this.options.first !== undefined ? { first: this.options.first } : {}),
      ...(this.options.after !== undefined ? { after: this.options.after } : {}),
    };
  }

  /** @internal */
  private polymorphicIndexName(tableName: string): string {
    return `index_${tableName}_on_${this.name}`;
  }

  /**
   * @internal
   *
   * @missingRailsCall merge — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_definitions.rb:267 is
   *   `as_options(index).merge(conditional_options)`, spelled as an object
   *   spread in trails (schema-definitions.ts:884-895). Same keys, same
   *   precedence.
   */
  private indexOptions(tableName: string): AddIndexOptions {
    const opts: AddIndexOptions = {
      ...this.asOptions(this.index),
      ...this.conditionalOptions(),
    };
    if (this.polymorphic && !opts.name) {
      opts.name = this.polymorphicIndexName(tableName);
    }
    return opts;
  }

  /**
   * @internal
   *
   * @missingRailsCall merge — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_definitions.rb:277 is `as_options(foreign_key).merge(column:
   *   column_name, **conditional_options)`; trails spells the same merge as an
   *   object spread (schema-definitions.ts:896-902). `Hash#merge` has no ported
   *   analogue for a plain object.
   */
  private foreignKeyOptions(): ReferenceForeignKeyOptions {
    return {
      ...this.asOptions(this.foreignKey),
      column: this.columnName(),
      ...this.conditionalOptions(),
    } as ReferenceForeignKeyOptions;
  }

  /** @internal */
  private columnName(): string {
    return `${this.name}_id`;
  }

  /** @internal */
  private columnNames(): string[] {
    return this.columns().map(([n]) => n);
  }

  /**
   * @internal
   *
   * @missingRailsCall fetch — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_definitions.rb:297-299 is `foreign_key_options.fetch(:to_table) {
   *   ... }`; `to_table` is a declared optional property on trails'
   *   ReferenceForeignKeyOptions, so the block default is spelled `?? (...)`
   *   (schema-definitions.ts:922-925). The Ruby fetch/`??` difference (a STORED
   *   nil) cannot arise: the key is only ever written with a table name.
   */
  private foreignTableName(): string {
    const fkOpts = this.foreignKeyOptions();
    return fkOpts.toTable ?? (globalPluralizeTableNames() ? pluralize(this.name) : this.name);
  }

  /** @internal */
  private columns(): [string, ColumnType, ColumnOptions][] {
    const result: [string, ColumnType, ColumnOptions][] = [
      [this.columnName(), this.type, this.options],
    ];
    if (this.polymorphic) {
      result.unshift([`${this.name}_type`, "string", this.polymorphicOptions()]);
    }
    return result;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AlterTable
 */
export class AlterTable {
  /** @internal */
  protected readonly _td: TableDefinition;
  readonly adds: AddColumnDefinition[] = [];
  readonly foreignKeyAdds: ForeignKeyDefinition[] = [];
  readonly foreignKeyDrops: string[] = [];
  readonly checkConstraintAdds: CheckConstraintDefinition[] = [];
  readonly checkConstraintDrops: string[] = [];
  readonly constraintDrops: string[] = [];
  constructor(td: TableDefinition) {
    this._td = td;
  }

  get name(): string {
    return this._td.name;
  }

  addColumn(name: string, type: ColumnType, options: ColumnOptions = {}): void {
    this.adds.push(new AddColumnDefinition(this._td.newColumnDefinition(name, type, options)));
  }

  addForeignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): void {
    // Mirrors Rails' AlterTable#add_foreign_key, which routes through
    // `@td.new_foreign_key_definition(to_table, options)` so the FK def picks up
    // table_name_prefix/suffix and the converged foreign_key_options defaults.
    this.foreignKeyAdds.push(this._td.newForeignKeyDefinition(toTable, options));
  }

  dropForeignKey(name: string): void {
    this.foreignKeyDrops.push(name);
  }

  addCheckConstraint(
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): void {
    this.checkConstraintAdds.push(this._td.newCheckConstraintDefinition(expression, options));
  }

  dropCheckConstraint(name: string): void {
    this.checkConstraintDrops.push(name);
  }

  dropConstraint(name: string): void {
    this.constraintDrops.push(name);
  }
}

/**
 * The table-definition type an adapter's own `create_table_definition` builds.
 *
 * Ruby resolves a yielded object's methods at call time, so a PostgreSQL
 * `create_table` block reaches `PostgreSQL::ColumnMethods` names
 * (postgresql/schema_definitions.rb:245) with nothing declared anywhere.
 * TypeScript resolves against the DECLARED parameter type instead, so the
 * `create_table` yield has to name the receiver's own definition class for the
 * same names to resolve.
 *
 * @noRailsEquivalent PERMANENT: Ruby needs no type to express what a
 *   `create_table` block yields, so there is nothing to mirror. This is the
 *   declaration-site expression of that same fact.
 */
export type TableDefinitionOf<A> = A extends {
  createTableDefinition(name: string, options?: Record<string, unknown>): infer T;
}
  ? T
  : TableDefinition;

/**
 * TableDefinition — used inside create_table blocks.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition
 */
export class TableDefinition {
  readonly name: string;
  readonly columns: ColumnDefinition[] = [];
  /**
   * Rails stores the caller's options untouched — `indexes << [column_name,
   * options]` (schema_definitions.rb:518) — and validates/normalizes them once,
   * downstream in `add_index_options` (schema_statements.rb:1476).
   */
  readonly indexes: Array<[string | string[], AddIndexOptions]> = [];
  readonly foreignKeys: ForeignKeyDefinition[] = [];
  readonly checkConstraints: CheckConstraintDefinition[] = [];
  readonly temporary: boolean;
  readonly ifNotExists: boolean;
  readonly as?: string;
  readonly options?: string;
  readonly comment?: string;
  private _primaryKeys?: PrimaryKeyDefinition;
  private _adapterName: "sqlite" | "postgres" | "mysql2";
  protected _adapter: TableDefinitionConn;

  constructor(
    name: string,
    tdOptions: {
      adapterName?: "sqlite" | "postgres" | "mysql2";
      adapter: TableDefinitionConn;
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
      options?: string;
      comment?: string;
      charset?: string;
      collation?: string;
    },
  ) {
    this.name = name;
    this._adapterName = tdOptions.adapterName ?? "sqlite";
    this._adapter = tdOptions.adapter;
    this.temporary = tdOptions.temporary ?? false;
    this.ifNotExists = tdOptions.ifNotExists ?? false;
    this.as = tdOptions.as;
    this.options = tdOptions.options;
    this.comment = tdOptions.comment;
  }

  /**
   * @missingRailsCall get_primary_key — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   schema_definitions.rb:397 is `Base.get_primary_key(...)`; importing `Base`
   *   from the connection-adapter layer is a module cycle, so trails reads it
   *   through the `table-name-options.ts` registration slot as
   *   `globalGetPrimaryKey` (schema-definitions.ts:1058). Same value, same
   *   fallback.
   */
  setPrimaryKey(
    tableName: string,
    id: boolean | ColumnType | IdHashOptions,
    primaryKey?: string | string[] | false,
    options: Record<string, unknown> = {},
  ): void {
    if (!id || this.as) return;

    // Rails' `primary_key || Base.get_primary_key(...)` — `||`, not `??`, so an
    // explicit `primaryKey: false` still falls back to the conventional name.
    const pk = primaryKey || globalGetPrimaryKey(singularize(tableName));

    let pkOptions: ColumnOptions = { ...(options as Partial<ColumnOptions>) };
    let pkType: ColumnType = typeof id === "string" ? id : "primary_key";
    if (typeof id === "object" && id !== null) {
      const { type, ...rest } = id;
      pkOptions = { ...pkOptions, ...(rest as Partial<ColumnOptions>) };
      // Rails' `id.fetch(:type, :primary_key)` is key-presence, not truthiness:
      // an explicitly supplied falsy type is passed through, not defaulted.
      pkType = "type" in id ? (type as ColumnType) : "primary_key";
    }

    if (Array.isArray(pk)) {
      this.primaryKeys(pk);
    } else {
      this.primaryKey(pk, pkType, pkOptions);
    }
  }

  /** @internal */
  primaryKeys(name?: string[]): PrimaryKeyDefinition | undefined {
    if (name) this._primaryKeys = new PrimaryKeyDefinition(name);
    return this._primaryKeys;
  }

  /**
   * Creates a new ColumnDefinition for a column with the given name, type, and options.
   * Subclasses override to add adapter-specific type normalization.
   *
   * @internal
   * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition#new_column_definition
   */
  newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if (this.isIntegerLikePrimaryKey(type, options)) {
      type = this.integerLikePrimaryKeyType(type, options);
    }
    type = this.aliasedTypes(type, type) as ColumnType;
    // Mirrors Rails' TableDefinition#new_column_definition:
    //   if @conn.supports_datetime_with_precision? && type == :datetime && !options.key?(:precision)
    //     options[:precision] = 6
    // All adapters we support report supports_datetime_with_precision? = true.
    // precision: null means "no precision suffix"; absence means "use default (6)".
    if (type === "datetime" && !("precision" in options)) {
      options = { ...options, precision: 6 };
    }
    options.primaryKey ||= type === "primary_key";
    if (options.primaryKey) options.null = false;
    return this.createColumnDefinition(name, type, options);
  }

  /** @internal */
  aliasedTypes(name: string, fallback: string): string {
    return name === "timestamp" ? "datetime" : fallback;
  }

  primaryKey(name: string, type: ColumnType = "primary_key", options: ColumnOptions = {}): this {
    return this.column(name, type, { ...options, primaryKey: true });
  }

  column(
    name: string,
    type: ColumnType,
    options: Omit<ColumnOptions, "index"> & { index?: boolean | AddIndexOptions } = {},
  ): this {
    const { index, ...colOpts } = options;
    this.raiseOnDuplicateColumn(name);
    this.columns.push(this.newColumnDefinition(name, type, colOpts as ColumnOptions));
    if (index) {
      const indexOpts: AddIndexOptions = typeof index === "object" ? index : {};
      this.index([name], indexOpts);
    }
    return this;
  }

  /**
   * Returns the ColumnDefinition for the column named +name+.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition#[]
   */
  get(name: string): ColumnDefinition | undefined {
    return this.columns.find((c) => c.name === String(name));
  }

  /**
   * Remove the column +name+ from the table.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition#remove_column
   * (Rails deletes from `@columns_hash`; this port keeps an array.)
   *
   * @missingRailsCall delete — PERMANENT: Newly comparable (RFC 0072 arity sweep): Rails
   *   deletes from the `@columns_hash` Hash; TableDefinition here stores
   *   `columns` as an ordered array, so the same removal is a findIndex/splice.
   *   Equivalent — no Hash to delete from.
   */
  removeColumn(name: string): void {
    const index = this.columns.findIndex((c) => c.name === String(name));
    if (index !== -1) this.columns.splice(index, 1);
  }

  /** @internal */
  protected validColumnDefinitionOptions(): string[] {
    return this._adapter.validColumnDefinitionOptions();
  }

  /** @internal */
  protected createColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions,
  ): ColumnDefinition {
    if (!options._skipValidateOptions) {
      const { _usesLegacyReferenceIndexName: _u, _skipValidateOptions: _s, ...rest } = options;
      assertValidKeys(rest, this.validColumnDefinitionOptions());
    }

    return new ColumnDefinition(name, type, options);
  }

  /** @internal */
  protected isIntegerLikePrimaryKey(type: ColumnType, options: ColumnOptions): boolean {
    return (
      !!options.primaryKey &&
      (type === "integer" || type === "bigint") &&
      options.default === undefined
    );
  }

  /** @internal */
  protected integerLikePrimaryKeyType(type: ColumnType, _options: ColumnOptions): ColumnType {
    return type;
  }

  /** @internal */
  protected raiseOnDuplicateColumn(name: string): void {
    const existing = this.columns.find((c) => c.name === name);
    if (existing) {
      if (existing.options.primaryKey) {
        throw new ArgumentError(
          `you can't redefine the primary key column '${name}' on '${this.name}'. To define a custom primary key, pass { id: false } to create_table.`,
        );
      } else {
        throw new ArgumentError(
          `you can't define an already defined column '${name}' on '${this.name}'.`,
        );
      }
    }
  }

  checkConstraint(expression: string, options: { name?: string; validate?: boolean } = {}): this {
    this.checkConstraints.push(this.newCheckConstraintDefinition(expression, options));
    return this;
  }

  foreignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): this {
    this.foreignKeys.push(this.newForeignKeyDefinition(toTable, options));
    return this;
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition#new_foreign_key_definition
   * (schema_definitions.rb:575-581).
   */
  newForeignKeyDefinition(
    toTable: string,
    options: Partial<AddForeignKeyOptions> = {},
  ): ForeignKeyDefinition {
    const prefix = this._adapter.tableNamePrefix ?? globalTableNamePrefix();
    const suffix = this._adapter.tableNameSuffix ?? globalTableNameSuffix();
    const prefixedToTable = `${prefix}${toTable}${suffix}`;
    const opts = this._adapter.foreignKeyOptions(this.name, prefixedToTable, { ...options });
    return new ForeignKeyDefinition(
      this.name,
      prefixedToTable,
      opts.column as string | string[],
      (opts.primaryKey as string | string[] | undefined) ?? "id",
      opts.name as string,
      opts.onDelete as ReferentialAction | undefined,
      opts.onUpdate as ReferentialAction | undefined,
      opts.deferrable as "immediate" | "deferred" | false | undefined,
      opts.validate as boolean | undefined,
      // Mirror Rails' foreign_key_options stored-key set so a key we defaulted
      // (e.g. primaryKey "id") is sliced out by isDefinedFor rather than
      // mismatching.
      foreignKeyOptionsStoredKeys(options),
    );
  }

  newCheckConstraintDefinition(
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): CheckConstraintDefinition {
    options = this._adapter.checkConstraintOptions(this.name, expression, options) as {
      name?: string;
      validate?: boolean;
    };
    return new CheckConstraintDefinition(this.name, expression, options);
  }

  /** @internal */
  static defineColumnMethods(...columnTypes: string[]): void {
    // In Rails, this dynamically defines type-specific column methods.
    // In TypeScript, these are defined statically on the class.
    // This method exists for API parity — the column methods (string, text,
    // integer, etc.) are already declared as instance methods above.
    for (const type of columnTypes) {
      if (!(type in TableDefinition.prototype)) {
        (TableDefinition.prototype as any)[type] = function (
          this: TableDefinition,
          ...args: unknown[]
        ) {
          return this.definedColumn(type as ColumnType, args);
        };
      }
    }
  }

  /** @internal */
  protected definedColumn(type: ColumnType, args: unknown[]): this {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as ColumnOptions;
    const names = rest as string[];
    if (names.length === 0) {
      throw new ArgumentError(`Missing column name(s) for ${type}`);
    }
    for (const name of names) {
      this.column(name, type, options);
    }
    return this;
  }

  string(...names: string[]): this;
  string(...args: [...names: string[], options: ColumnOptions]): this;
  string(...args: unknown[]): this {
    return this.definedColumn("string", args);
  }

  text(...names: string[]): this;
  text(...args: [...names: string[], options: ColumnOptions]): this;
  text(...args: unknown[]): this {
    return this.definedColumn("text", args);
  }

  integer(...names: string[]): this;
  integer(...args: [...names: string[], options: ColumnOptions]): this;
  integer(...args: unknown[]): this {
    return this.definedColumn("integer", args);
  }

  bigint(...names: string[]): this;
  bigint(...args: [...names: string[], options: ColumnOptions]): this;
  bigint(...args: unknown[]): this {
    return this.definedColumn("bigint", args);
  }

  float(...names: string[]): this;
  float(...args: [...names: string[], options: ColumnOptions]): this;
  float(...args: unknown[]): this {
    return this.definedColumn("float", args);
  }

  decimal(...names: string[]): this;
  decimal(...args: [...names: string[], options: ColumnOptions]): this;
  decimal(...args: unknown[]): this {
    // Rails' TableDefinition#decimal performs no validation; a scale without a
    // precision is rejected later in type_to_sql (schema_statements.rb:1400),
    // so the same ArgumentError covers every column-creation path.
    return this.definedColumn("decimal", args);
  }

  boolean(...names: string[]): this;
  boolean(...args: [...names: string[], options: ColumnOptions]): this;
  boolean(...args: unknown[]): this {
    return this.definedColumn("boolean", args);
  }

  date(...names: string[]): this;
  date(...args: [...names: string[], options: ColumnOptions]): this;
  date(...args: unknown[]): this {
    return this.definedColumn("date", args);
  }

  time(...names: string[]): this;
  time(...args: [...names: string[], options: ColumnOptions]): this;
  time(...args: unknown[]): this {
    return this.definedColumn("time", args);
  }

  datetime(...names: string[]): this;
  datetime(...args: [...names: string[], options: ColumnOptions]): this;
  datetime(...args: unknown[]): this {
    return this.definedColumn("datetime", args);
  }

  timestamp(...names: string[]): this;
  timestamp(...args: [...names: string[], options: ColumnOptions]): this;
  timestamp(...args: unknown[]): this {
    return this.definedColumn("timestamp", args);
  }

  binary(...names: string[]): this;
  binary(...args: [...names: string[], options: ColumnOptions]): this;
  binary(...args: unknown[]): this {
    return this.definedColumn("binary", args);
  }

  // Mirrors Rails' `alias :blob :binary` / `alias :numeric :decimal` in
  // abstract/schema_definitions.rb — `t.blob`/`t.numeric` create binary/decimal
  // columns that introspect (and dump) back as `t.binary`/`t.decimal`.
  blob(...names: string[]): this;
  blob(...args: [...names: string[], options: ColumnOptions]): this;
  blob(...args: unknown[]): this {
    return this.definedColumn("binary", args);
  }

  numeric(...names: string[]): this;
  numeric(...args: [...names: string[], options: ColumnOptions]): this;
  numeric(...args: unknown[]): this {
    return this.definedColumn("decimal", args);
  }

  json(...names: string[]): this;
  json(...args: [...names: string[], options: ColumnOptions]): this;
  json(...args: unknown[]): this {
    return this.definedColumn("json", args);
  }

  virtual(...names: string[]): this;
  virtual(
    ...args: [
      ...names: string[],
      options: ColumnOptions & { type?: ColumnType; as?: string; stored?: boolean },
    ]
  ): this;
  virtual(...args: unknown[]): this {
    return this.definedColumn("virtual" as ColumnType, args);
  }

  timestamps(
    options: Omit<ColumnOptions, "index"> & { index?: boolean | AddIndexOptions } = {},
  ): this {
    const { null: nullOption, ...rest } = options;
    const opts = { ...rest, null: nullOption ?? false };
    this.column("created_at", "datetime", opts);
    this.column("updated_at", "datetime", opts);
    return this;
  }

  references(
    name: string,
    options: Omit<ColumnOptions, "index"> & {
      polymorphic?: boolean | Record<string, unknown>;
      foreignKey?: boolean | ReferenceForeignKeyOptions;
      index?: boolean | AddIndexOptions;
      type?: ColumnType;
    } = {},
  ): this {
    new ReferenceDefinition(name, options).addTo(this);
    return this;
  }

  /** Alias of references (Rails: `alias :belongs_to :references`). */
  belongsTo(
    name: string,
    options: Omit<ColumnOptions, "index"> & {
      polymorphic?: boolean | Record<string, unknown>;
      foreignKey?: boolean | ReferenceForeignKeyOptions;
      index?: boolean | AddIndexOptions;
      type?: ColumnType;
    } = {},
  ): this {
    return this.references(name, options);
  }

  index(columnName: string | string[], options: AddIndexOptions = {}): this {
    this.indexes.push([columnName, options]);
    return this;
  }
}

/**
 * Table — proxy for modifying an existing table inside a changeTable block.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Table
 */
export class Table {
  constructor(
    private _tableName: string,
    private _schema: SchemaStatementsLike,
  ) {}

  /** @internal */
  aliasedTypes(name: string, fallback: string): string {
    return name === "timestamp" ? "datetime" : fallback;
  }

  /** @internal */
  protected async definedColumn(type: ColumnType, args: unknown[]): Promise<void> {
    const { names, options } = splitColumnNames(args, type);
    for (const name of names) {
      await this.column(name, type, options);
    }
  }

  async string(...names: string[]): Promise<void>;
  async string(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async string(...args: unknown[]): Promise<void> {
    await this.definedColumn("string", args);
  }
  async text(...names: string[]): Promise<void>;
  async text(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async text(...args: unknown[]): Promise<void> {
    await this.definedColumn("text", args);
  }
  async integer(...names: string[]): Promise<void>;
  async integer(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async integer(...args: unknown[]): Promise<void> {
    await this.definedColumn("integer", args);
  }
  async float(...names: string[]): Promise<void>;
  async float(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async float(...args: unknown[]): Promise<void> {
    await this.definedColumn("float", args);
  }
  async decimal(...names: string[]): Promise<void>;
  async decimal(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async decimal(...args: unknown[]): Promise<void> {
    await this.definedColumn("decimal", args);
  }
  async boolean(...names: string[]): Promise<void>;
  async boolean(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async boolean(...args: unknown[]): Promise<void> {
    await this.definedColumn("boolean", args);
  }
  async date(...names: string[]): Promise<void>;
  async date(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async date(...args: unknown[]): Promise<void> {
    await this.definedColumn("date", args);
  }
  async datetime(...names: string[]): Promise<void>;
  async datetime(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async datetime(...args: unknown[]): Promise<void> {
    await this.definedColumn("datetime", args);
  }
  async bigint(...names: string[]): Promise<void>;
  async bigint(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async bigint(...args: unknown[]): Promise<void> {
    await this.definedColumn("bigint", args);
  }
  async json(...names: string[]): Promise<void>;
  async json(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async json(...args: unknown[]): Promise<void> {
    await this.definedColumn("json", args);
  }
  async time(...names: string[]): Promise<void>;
  async time(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async time(...args: unknown[]): Promise<void> {
    await this.definedColumn("time", args);
  }
  async timestamp(...names: string[]): Promise<void>;
  async timestamp(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async timestamp(...args: unknown[]): Promise<void> {
    await this.definedColumn("timestamp", args);
  }
  async binary(...names: string[]): Promise<void>;
  async binary(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async binary(...args: unknown[]): Promise<void> {
    await this.definedColumn("binary", args);
  }
  async blob(...names: string[]): Promise<void>;
  async blob(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async blob(...args: unknown[]): Promise<void> {
    await this.definedColumn("binary", args);
  }
  async numeric(...names: string[]): Promise<void>;
  async numeric(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async numeric(...args: unknown[]): Promise<void> {
    await this.definedColumn("decimal", args);
  }
  async char(...names: string[]): Promise<void>;
  async char(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async char(...args: unknown[]): Promise<void> {
    await this.definedColumn("char", args);
  }
  async virtual(
    name: string,
    options: ColumnOptions & { type?: ColumnType; as?: string; stored?: boolean } = {},
  ): Promise<void> {
    await this.column(name, "virtual" as ColumnType, options);
  }
  async array(name: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, type, { ...options, array: true });
  }
  async remove(...columnNames: string[]): Promise<void>;
  async remove(...args: [...columnNames: string[], options: ColumnOptions]): Promise<void>;
  async remove(...args: unknown[]): Promise<void> {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as ColumnOptions;
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    await this._schema.removeColumns(
      this.name,
      ...(rest as string[]),
      ...(Object.keys(options).length > 0 ? [options] : []),
    );
  }
  async rename(columnName: string, newColumnName: string): Promise<void> {
    await this._schema.renameColumn(this.name, columnName, newColumnName);
  }
  async index(columns: string | string[], options: AddIndexOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      await this._schema.addIndex(this.name, columns);
    } else {
      await this._schema.addIndex(this.name, columns, options);
    }
  }
  // Rails: `Table#remove_index(column_name = nil, **options)` forwards to
  // `@base.remove_index(table_name, column_name, **options)`.
  async removeIndex(
    columnOrOptions: string | string[] | { column?: string | string[]; name?: string } = {},
    options: { column?: string | string[]; name?: string } = {},
  ): Promise<void> {
    const isColumn = typeof columnOrOptions === "string" || Array.isArray(columnOrOptions);
    const columnName = isColumn ? columnOrOptions : undefined;
    // Ruby's `**options` collects the hash from either position, so an explicit
    // nil column with the options behind it keeps them.
    options = isColumn ? options : { ...columnOrOptions, ...options };
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      await this._schema.removeIndex(this.name, columnName);
    } else {
      await this._schema.removeIndex(this.name, columnName, options);
    }
  }
  async references(...refNames: string[]): Promise<void>;
  async references(...args: [...refNames: string[], options: AddReferenceOptions]): Promise<void>;
  async references(...args: unknown[]): Promise<void> {
    const { names, options } = this._splitRefNames(args);
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    for (const refName of names) {
      if (Object.keys(options).length === 0) {
        await this._schema.addReference(this.name, refName);
      } else {
        await this._schema.addReference(this.name, refName, options);
      }
    }
  }
  async belongsTo(...refNames: string[]): Promise<void>;
  async belongsTo(...args: [...refNames: string[], options: AddReferenceOptions]): Promise<void>;
  async belongsTo(...args: unknown[]): Promise<void> {
    return (this.references as (...a: unknown[]) => Promise<void>)(...args);
  }
  async timestamps(options: ColumnOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      await this._schema.addTimestamps(this.name);
    } else {
      await this._schema.addTimestamps(this.name, options);
    }
  }

  get name(): string {
    return this._tableName;
  }

  async column(
    columnName: string,
    type: ColumnType,
    options: Omit<ColumnOptions, "index"> & { index?: boolean | AddIndexOptions } = {},
  ): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    const { index: indexOpt, ...colOpts } = options;
    if (Object.keys(colOpts).length === 0) {
      await this._schema.addColumn(this.name, columnName, type);
    } else {
      await this._schema.addColumn(this.name, columnName, type, colOpts as ColumnOptions);
    }
    if (indexOpt) {
      const opts: AddIndexOptions = typeof indexOpt === "object" ? indexOpt : {};
      await this._schema.addIndex(this.name, columnName, opts);
    }
  }

  async columnExists(columnName: string, type?: ColumnType): Promise<boolean> {
    return this._schema.columnExists(this.name, columnName, type);
  }

  async indexExists(
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (Object.keys(options).length === 0) {
      return this._schema.indexExists(this.name, columnName);
    }
    return this._schema.indexExists(this.name, columnName, options);
  }

  async renameIndex(indexName: string, newIndexName: string): Promise<void> {
    return this._schema.renameIndex(this.name, indexName, newIndexName);
  }

  async change(columnName: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    return this._schema.changeColumn(this.name, columnName, type, options);
  }

  async changeDefault(columnName: string, defaultOrChanges: unknown): Promise<void> {
    return this._schema.changeColumnDefault(this.name, columnName, defaultOrChanges);
  }

  async changeNull(columnName: string, isNull: boolean, defaultValue?: unknown): Promise<void> {
    return this._schema.changeColumnNull(this.name, columnName, isNull, defaultValue);
  }

  async removeTimestamps(options: ColumnOptions = {}): Promise<void> {
    if (Object.keys(options).length === 0) {
      return this._schema.removeTimestamps(this.name);
    }
    return this._schema.removeTimestamps(this.name, options);
  }

  async removeReferences(...refNames: string[]): Promise<void>;
  async removeReferences(
    ...args: [...refNames: string[], options: AddReferenceOptions]
  ): Promise<void>;
  async removeReferences(...args: unknown[]): Promise<void> {
    const { names, options } = this._splitRefNames(args);
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    for (const refName of names) {
      if (Object.keys(options).length === 0) {
        await this._schema.removeReference(this.name, refName);
      } else {
        await this._schema.removeReference(this.name, refName, options);
      }
    }
  }
  async removeBelongsTo(...refNames: string[]): Promise<void>;
  async removeBelongsTo(
    ...args: [...refNames: string[], options: AddReferenceOptions]
  ): Promise<void>;
  async removeBelongsTo(...args: unknown[]): Promise<void> {
    return (this.removeReferences as (...a: unknown[]) => Promise<void>)(...args);
  }

  private _splitRefNames(args: unknown[]): { names: string[]; options: AddReferenceOptions } {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (
      typeof last === "object" && last !== null ? rest.pop() : {}
    ) as AddReferenceOptions;
    return { names: rest as string[], options };
  }

  async foreignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      return this._schema.addForeignKey(this.name, toTable);
    }
    return this._schema.addForeignKey(this.name, toTable, options);
  }

  async removeForeignKey(
    toTableOrOptions: string | { column?: string; name?: string } = {},
  ): Promise<void> {
    this.raiseOnIfExistOptions(
      (typeof toTableOrOptions === "object" ? toTableOrOptions : {}) as Record<string, unknown>,
    );
    if (typeof toTableOrOptions === "object" && Object.keys(toTableOrOptions).length === 0) {
      return this._schema.removeForeignKey(this.name);
    }
    return this._schema.removeForeignKey(this.name, toTableOrOptions);
  }

  async foreignKeyExists(toTableOrOptions?: string | Record<string, unknown>): Promise<boolean> {
    if (toTableOrOptions === undefined) {
      return this._schema.foreignKeyExists(this.name);
    }
    return this._schema.foreignKeyExists(this.name, toTableOrOptions);
  }

  async checkConstraint(expression: string, options: Record<string, unknown> = {}): Promise<void> {
    if (Object.keys(options).length === 0) {
      return this._schema.addCheckConstraint(this.name, expression);
    }
    return this._schema.addCheckConstraint(this.name, expression, options);
  }

  async removeCheckConstraint(
    expressionOrOptions?: string | { name?: string },
    options: { name?: string } = {},
  ): Promise<void> {
    if (typeof expressionOrOptions === "string") {
      if (Object.keys(options).length === 0) {
        return this._schema.removeCheckConstraint(this.name, expressionOrOptions);
      }
      return this._schema.removeCheckConstraint(this.name, expressionOrOptions, options);
    }
    // Ruby's `**options` collects the hash from either position, so an absent
    // expression with the options behind it keeps them.
    const opts = { ...expressionOrOptions, ...options };
    if (Object.keys(opts).length === 0) {
      return this._schema.removeCheckConstraint(this.name);
    }
    return this._schema.removeCheckConstraint(this.name, opts);
  }

  async checkConstraintExists(
    options: { name?: string; expression?: string } = {},
  ): Promise<boolean> {
    if (Object.keys(options).length === 0) {
      return this._schema.checkConstraintExists(this.name);
    }
    return this._schema.checkConstraintExists(this.name, options);
  }

  async primaryKey(
    name: string,
    type: ColumnType = "primary_key",
    options: ColumnOptions = {},
  ): Promise<void> {
    await this.column(name, type, { ...options, primaryKey: true });
  }

  async add(columnName: string, type: ColumnType, options?: ColumnOptions): Promise<void> {
    return this._schema.addColumn(this.name, columnName, type, options);
  }

  /** @internal */
  protected raiseOnIfExistOptions(options: Record<string, unknown>): void {
    const unrecognizedOption = Object.keys(options).find(
      (key) => key === "ifExists" || key === "ifNotExists",
    );
    if (unrecognizedOption) {
      const conditional = unrecognizedOption === "ifExists" ? "if" : "unless";
      const railsKey = unrecognizedOption === "ifExists" ? "if_exists" : "if_not_exists";
      throw new ArgumentError(
        `Option ${railsKey} will be ignored. If you are calling an expression like\n` +
          `\`t.column(.., ${railsKey}: true)\` from inside a change_table block, try a\n` +
          `conditional clause instead, as in \`t.column(..) ${conditional} t.column_exists?(..)\``,
      );
    }
  }
}

/**
 * Interface for the subset of SchemaStatements that Table needs.
 * Avoids circular dependency between schema-definitions and schema-statements.
 */
export interface SchemaStatementsLike {
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: { ifExists?: boolean },
  ): Promise<void>;
  removeColumns(
    tableName: string,
    ...columnsOrOptions: Array<string | ColumnOptions>
  ): Promise<void>;
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
  addIndex(tableName: string, columns: string | string[], options?: AddIndexOptions): Promise<void>;
  removeIndex(
    tableName: string,
    columnOrOptions?:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean },
    options?: { column?: string | string[]; name?: string; ifExists?: boolean },
  ): Promise<void>;
  addReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  removeReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  removeTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  columnExists(tableName: string, columnName: string, type?: ColumnType): Promise<boolean>;
  indexExists(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    isNull: boolean,
    defaultValue?: unknown,
  ): Promise<void>;
  addForeignKey(
    tableName: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeForeignKey(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  foreignKeyExists(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  addCheckConstraint(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  checkConstraintExists(tableName: string, options?: Record<string, unknown>): Promise<boolean>;
  primaryKey?(tableName: string): Promise<string | string[] | null>;
}
