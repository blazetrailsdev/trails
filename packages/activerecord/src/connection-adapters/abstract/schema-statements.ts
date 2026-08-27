/**
 * SchemaStatements — DDL operations for database schema manipulation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaStatements
 *
 * This is the base implementation with generic SQL. Adapter-specific
 * subclasses can override methods for dialect differences (e.g. SQLite
 * doesn't support ALTER TABLE ADD CONSTRAINT).
 */

import { NotImplementedError } from "../../errors.js";
import { joinTableName as _joinTableName } from "../../migration/join-table.js";
import { CommandRecorder } from "../../migration/command-recorder.js";
import type { MigrationCommand } from "../../migration/command-recorder.js";
import { ArgumentError, type Type } from "@blazetrails/activemodel";
import type { AbstractAdapter as DatabaseAdapter, AdapterName } from "../abstract-adapter.js";
import type { Relation } from "../../relation.js";
import type { Base } from "../../base.js";
import {
  TableDefinition,
  Table,
  AlterTable,
  IndexDefinition,
  AddColumnDefinition,
  ColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  assertCompositeForeignKeyArity,
  type AddForeignKeyOptions,
  type AddIndexOptions,
  type AddReferenceOptions,
  type RemoveReferenceOptions,
  ReferenceDefinition,
  type ColumnType,
  type ColumnOptions,
  type IdHashOptions,
  type ForeignKeyLookupOptions,
  type RemoveForeignKeyOptions,
} from "./schema-definitions.js";
import type { TableDefinitionOf } from "./schema-definitions.js";
import type { UniqueConstraintOptions } from "../postgresql/schema-definitions.js";
import { SchemaCreation, type SchemaCreationConn } from "./schema-creation.js";
import { maxIdentifierLength } from "./database-limits.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import { Column } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import {
  singularize,
  pluralize,
  getCrypto,
  isPresent,
  presence,
  assertValidKeys,
  KeyError,
  any,
  truncateBytes,
  wrap,
} from "@blazetrails/activesupport";
import { SchemaDumper } from "./schema-dumper.js";
import { rubyInspect, rubyInspectHash } from "../../relation/ruby-inspect.js";
import { indexes as sqliteIndexes } from "../sqlite3/schema-statements.js";
import {
  globalPluralizeTableNames,
  globalTableNamePrefix,
  globalTableNameSuffix,
} from "./table-name-options.js";

export { assertSchemaAdapter } from "./assert-schema-adapter.js";

type RemoveIndexOptions = { name?: string; column?: string | string[] };
type IndexInfo = { name: string; columns: string[] };

/**
 * Rails: `can_remove_index_by_name?` (`schema_statements.rb`) —
 * `column_name.nil? && options.key?(:name) && options.except(:name, :algorithm).empty?`.
 * A bare `{ name }` (optionally with `:algorithm`) resolves without
 * introspecting the table's indexes; any other extra key forces the lookup.
 *
 * @internal
 */
export function canRemoveIndexByName(
  columnName: string | string[] | undefined | null,
  options: Record<string, unknown>,
): boolean {
  return (
    columnName == null &&
    "name" in options &&
    Object.keys(options).filter((k) => k !== "name" && k !== "algorithm").length === 0
  );
}

// Rails: `expression_column_name?` — a String column carrying a non-word char
// (e.g. `"lower(email)"`) is an expression index, not a plain column.
/** @internal */
function isExpressionColumnName(columnName: string | string[] | undefined): columnName is string {
  return typeof columnName === "string" && /\W/.test(columnName);
}

type GenerateIndexName = (tableName: string, column: string | string[]) => string;

// Normalize a remove-index spec into the effective name + column list, applying
// Rails' expression branch: an expression positional column with no `name`
// matches by name only. Rails sets `options[:name] = index_name(table, column)`,
// where a String column routes through `index_name_options` (scan \w+, join "_")
// and `generate_index_name`, so the index-name length/hash fallback applies.
function removeIndexSpec(
  generateIndexName: GenerateIndexName,
  tableName: string,
  columnName: string | string[] | undefined,
  options: RemoveIndexOptions,
): { name?: string; columnNames: string[] } {
  if (options.name == null && isExpressionColumnName(columnName)) {
    const joined = (columnName.match(/\w+/g) ?? []).join("_");
    return { name: generateIndexName(tableName, joined), columnNames: [] };
  }
  const raw = columnName ?? options.column;
  const columnNames = raw == null || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
  return { name: options.name, columnNames };
}

/**
 * Rails: `index_name_for_remove` — resolve the concrete index name from the
 * given (already-fetched) indexes plus a name and/or column spec. Raises
 * ArgumentError on a no-match / ambiguous match. Shared by the SQLite and
 * PostgreSQL adapters, whose `removeIndex` overrides are self-contained.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE SchemaStatements#index_name_for_remove (abstract/schema_statements.rb:1647) taking the already-fetched indexes, since ours cannot re-query synchronously.
 */
export function indexNameForRemoveFrom(
  generateIndexName: GenerateIndexName,
  allIndexes: ReadonlyArray<IndexInfo>,
  tableName: string,
  columnName: string | string[] | undefined,
  options: RemoveIndexOptions,
): string {
  // can_remove_index_by_name?: a bare `{ name }` needs no introspection. Rails
  // gates purely on key presence (`options.key?(:name)`) and returns the value
  // as-is, so `{ name: undefined }` returns undefined here (Rails: nil).
  if (canRemoveIndexByName(columnName, options)) {
    return options.name as string;
  }
  const { name, columnNames } = removeIndexSpec(generateIndexName, tableName, columnName, options);
  const checks: Array<(i: IndexInfo) => boolean> = [];
  if (name != null) {
    checks.push((i) => i.name === name);
  }
  if (columnNames.length > 0) {
    // Rails: `index_name(table, i.columns) == index_name(table, column_names)` —
    // both sides route through generate_index_name (length/hash fallback).
    const target = generateIndexName(tableName, columnNames);
    checks.push((i) => generateIndexName(tableName, i.columns) === target);
  }
  if (checks.length === 0) {
    throw new ArgumentError("No name or columns specified");
  }
  const matching = allIndexes.filter((i) => checks.every((check) => check(i)));
  if (matching.length > 1) {
    throw new ArgumentError(
      `Multiple indexes found on ${tableName} columns ${columnNames}. ` +
        `Specify an index name from ${matching.map((i) => i.name).join(", ")}`,
    );
  }
  if (matching.length === 0) {
    throw new ArgumentError(`No indexes found on ${tableName} with the options provided.`);
  }
  return matching[0].name;
}

/**
 * Rails: `index_exists?` for the remove path — true when an index matches the
 * given name and/or columns. Shared by the SQLite / PostgreSQL `removeIndex`
 * overrides for their `ifExists` short-circuit.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE SchemaStatements#index_exists? (abstract/schema_statements.rb:102) over already-fetched indexes for the same async reason.
 */
export function indexExistsForRemoveFrom(
  generateIndexName: GenerateIndexName,
  allIndexes: ReadonlyArray<IndexInfo>,
  tableName: string,
  columnName: string | string[] | undefined,
  options: RemoveIndexOptions,
): boolean {
  const { name, columnNames } = removeIndexSpec(generateIndexName, tableName, columnName, options);
  return allIndexes.some((i) => {
    if (name != null && i.name !== name) return false;
    if (columnNames.length > 0) {
      return (
        i.columns.length === columnNames.length && columnNames.every((c, k) => c === i.columns[k])
      );
    }
    return name != null;
  });
}

/** Options accepted by `createJoinTable`. Extends the `createTable` option set with join-specific keys. */
export type JoinTableOptions = {
  tableName?: string;
  columnOptions?: Record<string, unknown>;
  id?: boolean | "uuid";
  force?: boolean | "cascade";
  ifNotExists?: boolean;
  options?: string;
  comment?: string;
  temporary?: boolean;
  as?: string;
};

/**
 * Constraint-validation statements that only adapters supporting
 * `supportsValidateConstraints` (PostgreSQL) implement. Rails' `Migration`
 * reaches them through `method_missing`, which is untyped in Ruby; declaring
 * them here lets our delegations narrow to a real type instead of `any`, so
 * signature drift on the adapter fails typecheck at the call site.
 */
export interface ValidateConstraintStatements {
  validateConstraint(tableName: string, constraintName: string): Promise<void>;
  validateCheckConstraint(
    tableName: string,
    nameOrOptions: string | { name: string },
  ): Promise<void>;
  validateForeignKey(
    fromTable: string,
    toTable?: string,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<void>;
}

/**
 * A comment argument: either the new value, or Rails' `{ from:, to: }` change hash.
 * Both keys are required: `extract_new_default_value` only unwraps when the hash
 * `has_key?(:from) && has_key?(:to)`
 * (activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1820-1827).
 */
export type CommentOrChanges = string | null | { from: string | null; to: string | null };

/**
 * Comment DDL that only adapters supporting `supportsComments` implement.
 * Reached from `Migration` the same way as {@link ValidateConstraintStatements}.
 */
export interface CommentStatements {
  changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void>;
  changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void>;
}

/** Extension DDL — PostgreSQL only. */
export interface ExtensionStatements {
  enableExtension(name: string, options?: Record<string, unknown>): Promise<void>;
  disableExtension(name: string, options?: { force?: "cascade" }): Promise<void>;
}

/** Enum type DDL — PostgreSQL only. */
export interface EnumStatements {
  createEnum(name: string, values: string[], options?: Record<string, unknown>): Promise<void>;
  dropEnum(
    name: string,
    valuesOrOptions?: string[] | { ifExists?: boolean },
    options?: { ifExists?: boolean },
  ): Promise<void>;
  renameEnumValue(name: string, options: { from: string; to: string }): Promise<void>;
}

/** Unique-constraint DDL — PostgreSQL only. */
export interface UniqueConstraintStatements {
  addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options?: UniqueConstraintOptions,
  ): Promise<void>;
  removeUniqueConstraint(
    tableName: string,
    columnNameOrOptions?: string | string[] | UniqueConstraintOptions | null,
    options?: UniqueConstraintOptions,
  ): Promise<void>;
}

/** Schema (namespace) DDL — PostgreSQL only. */
export interface SchemaNamespaceStatements {
  createSchema(name: string, options?: { force?: boolean; ifNotExists?: boolean }): Promise<void>;
}

/**
 * The pool surface the schema_migrations statements reach for. Rails calls
 * `pool.schema_migration` / `pool.migration_context` unguarded
 * (schema_statements.rb:1356-1370), so a mis-wired pool raises here rather
 * than degrading to a bare `schema_migrations` literal.
 *
 * Versions are strings here where Rails' `MigrationContext#get_all_versions`
 * (`migration.rb:1282`) and `#migrations` (`:1303`) hand back integers, so
 * callers comparing against a numeric target coerce them.
 * @internal
 */
interface SchemaMigrationPool {
  schemaMigration: { tableName: string; versions(): Promise<Array<string | number>> };
  migrationContext: {
    getAllVersions(): Promise<number[]>;
    migrations: ReadonlyArray<{ version: number }>;
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/**
 * `SchemaStatements` is only ever mixed into an adapter (`include()` at the
 * bottom of each adapter module), so its bodies call plain `this` methods the
 * way Rails' module does. This merged interface gives those calls the adapter's
 * type. @internal
 */
export interface SchemaStatements extends DatabaseAdapter, SchemaQuoter {}

export class SchemaStatements {
  /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

  /**
   * `@config` (`abstract_adapter.rb:132`). Rails' module bodies read the host's
   * ivar directly; `_config` is protected on `AbstractAdapter`, which the
   * merged host interface cannot surface, so the field is redeclared here to
   * reach it typed rather than through an `as any` cast. @internal
   */
  declare protected _config: Record<string, unknown>;

  /**
   * `AbstractAdapter#pool` is typed `unknown` (it holds a NullPool until a real
   * ConnectionPool claims the connection); narrow it once here. @internal
   */
  private get _pool(): SchemaMigrationPool {
    return this.pool as SchemaMigrationPool;
  }

  /** Mirrors: SchemaStatements#schema_creation — `SchemaCreation.new(self)`. */
  get schemaCreation(): SchemaCreation {
    return new SchemaCreation(this as unknown as SchemaCreationConn);
  }

  async createTable(
    tableName: string,
    kwargsOrFn?:
      | {
          id?: boolean | ColumnType | IdHashOptions;
          primaryKey?: string | string[] | false;
          force?: boolean | "cascade";
          ifNotExists?: boolean;
          default?: unknown;
          options?: string;
          comment?: string;
          charset?: string;
          collation?: string;
          temporary?: boolean;
          as?: string;
          autoIncrement?: boolean;
          limit?: number;
          precision?: number;
        }
      | ((t: TableDefinitionOf<this>) => void | Promise<void>),
    fn?: (t: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<void> {
    let kwargs: {
      id?: boolean | ColumnType | IdHashOptions;
      primaryKey?: string | string[] | false;
      force?: boolean | "cascade";
      ifNotExists?: boolean;
      default?: unknown;
      options?: string;
      comment?: string;
      charset?: string;
      collation?: string;
      temporary?: boolean;
      as?: string;
      autoIncrement?: boolean;
      limit?: number;
      precision?: number;
    } = {};
    let definer: ((t: TableDefinitionOf<this>) => void | Promise<void>) | undefined;

    if (typeof kwargsOrFn === "function") {
      definer = kwargsOrFn;
    } else if (kwargsOrFn) {
      kwargs = kwargsOrFn;
      definer = fn;
    }

    // Rails takes `id:`, `primary_key:` and `force:` as their own kwargs, so
    // they never reach `validate_create_table_options!(options)`
    // (schema_statements.rb:293-294). TS has no `**rest` in a signature, so
    // every kwarg arrives in one object and is split back out here — `options`
    // is then Rails' `**options`.
    const { id, primaryKey, force, ...options } = kwargs;
    this.validateCreateTableOptionsBang(options);

    if ((options as { _usesLegacyTableName?: boolean })._usesLegacyTableName !== true) {
      this.validateTableLengthBang(tableName);
    }

    if (force && "ifNotExists" in options) {
      throw new ArgumentError(
        "Options `:force` and `:if_not_exists` cannot be used simultaneously.",
      );
    }

    const td = await this.buildCreateTableDefinition(
      tableName,
      { id, primaryKey, force, ...options },
      definer,
    );

    if (force) {
      await this.dropTable(tableName, { force, ifExists: true });
    } else {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
    }

    await this.execute(await this.schemaCreation.accept(td));

    if (!this.supportsIndexesInCreate?.()) {
      for (const [columnName, indexOptions] of td.indexes) {
        // Rails overrides any per-index `if_not_exists:` with the table
        // definition's, since it splats `**index_options` first.
        await this.addIndex(tableName, columnName, {
          ...indexOptions,
          ifNotExists: td.ifNotExists,
        });
      }
    }

    if (this.supportsComments?.() && !this.supportsCommentsInCreate?.()) {
      const tableComment = presence(td.comment);
      if (tableComment != null && typeof this.changeTableComment === "function") {
        await this.changeTableComment(tableName, tableComment);
      }
      // Mirrors Rails: adapters that can't inline column comments in CREATE
      // emit a COMMENT ON COLUMN per column so inline `comment:` options
      // round-trip through columns().
      const commentAdapter = this as {
        changeColumnComment?(t: string, c: string, comment: string | null): Promise<void>;
      };
      if (typeof commentAdapter.changeColumnComment === "function") {
        // ColumnDefinition keeps the comment under `.options.comment` (Rails'
        // `column.comment` reads through to the options hash).
        for (const column of td.columns as Array<{
          name: string;
          options?: { comment?: string | null };
        }>) {
          const comment = presence(column.options?.comment);
          if (comment != null) {
            await commentAdapter.changeColumnComment(tableName, column.name, comment);
          }
        }
      }
    }
  }

  async dropTable(
    ...args:
      | [string, ...string[]]
      | [string, ...string[], { ifExists?: boolean; force?: boolean | "cascade" } | undefined]
      | [string, ...string[], ((t: TableDefinition) => void) | undefined]
      | [
          string,
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade" } | undefined,
          ((t: TableDefinition) => void) | undefined,
        ]
  ): Promise<void> {
    // TS has no kwargs, so Rails' `*table_names, **options, &block`
    // (abstract/schema_statements.rb:540) arrives as a trailing options object
    // on the rest parameter, and the block as a trailing function. Ruby's
    // signature swallows both without them reaching `table_names`; here they
    // are popped off first — the block is only ever read by CommandRecorder,
    // which keeps it so `drop_table` can invert to `create_table`.
    const rest = [...args] as unknown[];
    while (
      rest.length > 0 &&
      (rest[rest.length - 1] === undefined || typeof rest[rest.length - 1] === "function")
    ) {
      rest.pop();
    }
    args = rest as typeof args;
    const last = args[args.length - 1];
    const hasOptions = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOptions ? args.slice(0, -1) : args) as string[];
    const options = (hasOptions ? last : {}) as { ifExists?: boolean; force?: boolean | "cascade" };
    if (tableNames.length === 0) {
      throw new ArgumentError("dropTable requires at least one table name");
    }
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    for (const tableName of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
      await this.execute(`DROP TABLE${ifExists} ${this.quoteTableName(tableName)}`);
    }
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<void> {
    const addColumnDef = await this.buildAddColumnDefinition(tableName, columnName, type, options);
    if (!addColumnDef) return;
    await this.execute(await this.schemaCreation.accept(addColumnDef));
  }

  async removeColumn(
    tableName: string,
    columnName: string,
    type?: ColumnType,
    options: { ifExists?: boolean } = {},
  ): Promise<void> {
    if (columnName === undefined) {
      throw new ArgumentError("wrong number of arguments (given 1, expected 2..3)");
    }
    if (options.ifExists && !(await this.columnExists(tableName, columnName))) {
      return;
    }
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${this.removeColumnForAlter(tableName, columnName, type, options)}`,
    );
  }

  async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
    await this.execute(
      `ALTER TABLE ${this.quoteColumnName(tableName)} RENAME COLUMN ${this.quoteColumnName(oldName)} TO ${this.quoteColumnName(newName)}`,
    );
  }

  async addIndex(
    tableName: string,
    columns: string | string[],
    options: AddIndexOptions = {},
  ): Promise<void> {
    const createIndex = await this.buildCreateIndexDefinition(
      tableName,
      columns,
      options as Record<string, unknown>,
    );
    await this.execute(await this.schemaCreation.accept(createIndex));
  }

  async removeIndex(
    tableName: string,
    columnOrOptions:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean } = {},
    options: { column?: string | string[]; name?: string; ifExists?: boolean } = {},
  ): Promise<void> {
    // Rails: `remove_index(table_name, column_name = nil, **options)` — the column
    // can be passed positionally or via the options hash.
    let columnName: string | string[] | undefined;
    if (typeof columnOrOptions === "string" || Array.isArray(columnOrOptions)) {
      columnName = columnOrOptions;
    } else {
      columnName = undefined;
      // Ruby's `**options` collects the hash whether it arrived as the sole
      // argument or behind an explicit nil column.
      options = { ...columnOrOptions, ...options };
    }

    // Rails: `return if options[:if_exists] && !index_exists?(table_name,
    // column_name, **options)` (schema_statements.rb:967) — one probe, because
    // `Index#defined_for?` (schema_definitions.rb:54) reads `options[:column]`
    // when no columns are given and then matches on `name` alone.
    if (options.ifExists && !(await this.indexExists(tableName, columnName, options))) return;

    // Rails resolves the concrete index name via `index_name_for_remove`, which
    // raises ArgumentError when the spec matches no index (or is ambiguous), and
    // then drops by that real name — never a silent DROP ... IF EXISTS.
    const indexName = await this.indexNameForRemove(tableName, columnName, options);

    if (this.adapterName === "mysql2") {
      await this.execute(
        `DROP INDEX ${this.quoteColumnName(indexName)} ON ${this.quoteColumnName(tableName)}`,
      );
    } else {
      await this.execute(`DROP INDEX ${this.quoteColumnName(indexName)}`);
    }
  }

  /**
   * Changes the column's definition according to the new options.
   * See TableDefinition#column for details of the options you can use.
   *
   *   changeColumn('suppliers', 'name', 'string', { limit: 80 })
   *   changeColumn('accounts', 'description', 'text')
   *
   * Mirrors: `SchemaStatements#change_column` (`schema_statements.rb:711-713`).
   * Every adapter overrides it: MySQL and PostgreSQL through
   * `change_column_for_alter` (abstract_mysql_adapter.rb:396-398,
   * postgresql/schema_statements.rb:466-471), SQLite through `alter_table`
   * (sqlite3_adapter.rb:385-389).
   */
  async changeColumn(
    _tableName: string,
    _columnName: string,
    _type: ColumnType,
    _options: ColumnOptions = {},
  ): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:711
    throw new NotImplementedError("change_column is not implemented");
  }

  /**
   * Renames a table.
   *
   *   renameTable('octopuses', 'octopi')
   *
   * Mirrors: `SchemaStatements#rename_table` (`schema_statements.rb:524-526`).
   */
  async renameTable(_tableName: string, _newName: string): Promise<void> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:524
    throw new NotImplementedError("rename_table is not implemented");
  }

  /**
   * Rails guards with a trailing `if table_name.present?` modifier
   * (schema_statements.rb:60), so a blank name falls off the end of the method
   * and the value is `nil` — not `false`. Same shape at schema_statements.rb:45
   * (`data_source_exists?`) and :75 (`view_exists?`).
   */
  async tableExists(tableName: string): Promise<boolean | null> {
    if (!isPresent(tableName)) return null;
    try {
      return any(
        await this.queryValues(this.dataSourceSql(tableName, { type: "BASE TABLE" }), "SCHEMA"),
      );
    } catch (error) {
      if (!(error instanceof NotImplementedError)) throw error;
      return (await this.tables()).includes(String(tableName));
    }
  }

  async columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options: {
      limit?: unknown;
      precision?: unknown;
      scale?: unknown;
      default?: unknown;
      null?: unknown;
      collation?: unknown;
      comment?: unknown;
    } = {},
  ): Promise<boolean> {
    // Rails' column_exists? loads the table's columns and matches the name in
    // Ruby (schema_statements.rb:132-141), never interpolating the column name
    // into SQL — so an arbitrary value (quotes/operators) simply matches
    // nothing. The schema.table qualification is honored by columns() below.
    // An optional `type` plus any of the `columnOptionsKeys`
    // (limit/precision/scale/default/null/collation/comment) narrow the match,
    // each ANDed like Rails' `checks.all?`.
    const cols = await this.columns(tableName);
    const optionKeys = this.columnOptionsKeys() as Array<keyof typeof options>;
    return cols.some((c) => {
      if (c.name !== columnName) return false;
      if (type != null && (c as { type?: unknown }).type !== type) return false;
      for (const key of optionKeys) {
        if (key in options && (c as unknown as Record<string, unknown>)[key] !== options[key])
          return false;
      }
      return true;
    });
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    // Rails unwraps a Hash to its :to only when it carries BOTH :from and :to
    // (extract_new_default_value, schema_statements.rb:1820); a bare structured
    // default like `{ to: 1 }` without :from is the literal default.
    const defaultVal = this.extractNewDefaultValue(defaultOrChanges);
    // Rails resolves the column before quoting (postgresql/schema_statements.rb:490).
    const column = await this.columnFor(tableName, columnName);
    const clause = await this.quoteDefaultExpression(defaultVal, column);
    await this.execute(
      `ALTER TABLE ${this.quoteColumnName(tableName)} ALTER COLUMN ${this.quoteColumnName(columnName)} SET DEFAULT ${clause || "NULL"}`,
    );
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void> {
    this.validateChangeColumnNullArgumentBang(allowNull);
    if (!allowNull && defaultValue !== undefined) {
      const column = await this.columnFor(tableName, columnName);
      const quoted = await this.quoteDefaultExpression(defaultValue, column);
      await this.execute(
        `UPDATE ${this.quoteColumnName(tableName)} SET ${this.quoteColumnName(columnName)} = ${quoted} WHERE ${this.quoteColumnName(columnName)} IS NULL`,
      );
    }
    const constraint = allowNull ? "DROP NOT NULL" : "SET NOT NULL";
    await this.execute(
      `ALTER TABLE ${this.quoteColumnName(tableName)} ALTER COLUMN ${this.quoteColumnName(columnName)} ${constraint}`,
    );
  }

  async addReference(
    tableName: string,
    refName: string,
    options: AddReferenceOptions = {},
  ): Promise<void> {
    await new ReferenceDefinition(refName, options).add(tableName, this);
  }

  /** Alias of addReference (Rails: `alias :add_belongs_to :add_reference`). */
  async addBelongsTo(
    tableName: string,
    refName: string,
    options: AddReferenceOptions = {},
  ): Promise<void> {
    return this.addReference(tableName, refName, options);
  }

  async removeReference(
    tableName: string,
    refName: string,
    options: RemoveReferenceOptions = {},
  ): Promise<void> {
    const conditionalOptions: { ifExists?: boolean; ifNotExists?: boolean } = {};
    if (options.ifExists !== undefined) conditionalOptions.ifExists = options.ifExists;
    if (options.ifNotExists !== undefined) conditionalOptions.ifNotExists = options.ifNotExists;
    if (options.foreignKey) {
      const fkOptions =
        typeof options.foreignKey === "object"
          ? { ...options.foreignKey, ...conditionalOptions }
          : {
              toTable: globalPluralizeTableNames() ? pluralize(refName) : refName,
              ...conditionalOptions,
            };
      if ((fkOptions as { column?: string }).column == null) {
        (fkOptions as { column?: string }).column = `${refName}_id`;
      }
      await this.removeForeignKey(tableName, fkOptions);
    }
    await this.removeColumn(tableName, `${refName}_id`, undefined, conditionalOptions);
    if (options.polymorphic) {
      await this.removeColumn(tableName, `${refName}_type`, undefined, conditionalOptions);
    }
  }

  /** Alias of removeReference (Rails: `alias :remove_belongs_to :remove_reference`). */
  async removeBelongsTo(
    tableName: string,
    refName: string,
    options: RemoveReferenceOptions = {},
  ): Promise<void> {
    return this.removeReference(tableName, refName, options);
  }

  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    // Rails: return unless use_foreign_keys?
    if (!this.useForeignKeys()) return;
    // Mirrors Rails' add_foreign_key short-circuit:
    //   return if options[:if_not_exists] == true &&
    //     foreign_key_exists?(from_table, to_table, **options.slice(:column))
    // foreign_key_exists? matches via foreign_keys(from).detect { defined_for? },
    // scoping on to_table plus column when one is given.
    if (options.ifNotExists === true) {
      if (await this.foreignKeyExists(fromTable, toTable, { column: options.column })) {
        return;
      }
    }
    // Rails: options = foreign_key_options(from_table, to_table, options)
    //        at = create_alter_table from_table
    //        at.add_foreign_key to_table, options
    //        execute schema_creation.accept(at)
    // foreign_key_options supplies the default column and the SHA256
    // `fk_rails_<hex>` name (via foreign_key_name) when not given. Adapters
    // override addForeignKey on the class and call super for this body, so
    // there is no self-delegation here — the override already shadows the
    // mixed-in method on the prototype.
    options = this.foreignKeyOptions(
      fromTable,
      toTable,
      options as Record<string, unknown>,
    ) as AddForeignKeyOptions;
    const at = this.createAlterTable(fromTable);
    // Route through AlterTable#addForeignKey -> TableDefinition#newForeignKeyDefinition
    // (now converged) rather than building the FK def inline: it applies
    // table_name_prefix/suffix to to_table and re-runs foreign_key_options
    // idempotently (column/name already filled above), mirroring Rails.
    at.addForeignKey(toTable, options as Partial<AddForeignKeyOptions>);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    // Rails: return unless use_foreign_keys?
    if (!this.useForeignKeys()) return;
    // Mirrors Rails remove_foreign_key(from_table, to_table = nil, **options):
    // resolve the actual constraint via foreign_key_for! (matching column /
    // name / to_table against the live foreign keys) rather than deriving a
    // name, so a hashed `fk_rails_<hex>` name drops correctly.
    let toTable: string | undefined;
    let opts: RemoveForeignKeyOptions;
    if (typeof toTableOrOptions === "object" && toTableOrOptions !== null) {
      opts = { ...toTableOrOptions };
      toTable = opts.toTable;
    } else {
      toTable = toTableOrOptions;
      opts = { ...options };
    }
    // Rails checks existence with only the positional to_table
    // (`foreign_key_exists?(from_table, to_table)`), then resolves the exact
    // constraint via foreign_key_for! using column/name too.
    if (opts.ifExists === true && !(await this.foreignKeyExists(fromTable, toTable))) {
      return;
    }
    const lookup: ForeignKeyLookupOptions = { ...opts, toTable };
    delete (lookup as RemoveForeignKeyOptions).ifExists;
    const fk = await this.foreignKeyForBang(fromTable, lookup);
    // Rails: at = create_alter_table from_table; at.drop_foreign_key fk.name;
    //        execute schema_creation.accept(at)
    // Route through AlterTable so adapters emit dialect-specific DROP syntax
    // (MySQL/MariaDB `DROP FOREIGN KEY`) rather than a hardcoded `DROP CONSTRAINT`.
    const at = this.createAlterTable(fromTable);
    at.dropForeignKey(fk.name);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: {
      name?: string;
      validate?: boolean;
      ifNotExists?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<void> {
    const support = this as { supportsCheckConstraints?: () => Promise<boolean> };
    if (
      typeof support.supportsCheckConstraints === "function" &&
      !(await support.supportsCheckConstraints())
    )
      return;

    // schema_statements.rb:1293 takes `if_not_exists:` as its own kwarg, so it
    // survives the `options = check_constraint_options(...)` rebind below.
    const ifNotExists = options.ifNotExists;
    options = this.checkConstraintOptions(tableName, expression, options) as {
      name?: string;
      validate?: boolean;
    };
    if (ifNotExists && (await this.checkConstraintExists(tableName, options))) return;

    const at = this.createAlterTable(tableName);
    at.addCheckConstraint(expression, options);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?:
      | string
      | { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
    options: { name?: string; expression?: string; validate?: boolean; ifExists?: boolean } = {},
  ): Promise<void> {
    // Mirrors Rails remove_check_constraint(table_name, expression = nil,
    // if_exists: false, **options) (schema_statements.rb:1324-1335): the
    // if_exists probe runs on the options alone, then check_constraint_for!
    // resolves the live constraint with the expression *and* the options, and
    // it is dropped by its real name.
    let expression: string | undefined;
    let opts: { name?: string; expression?: string; validate?: boolean; ifExists?: boolean };
    if (typeof expressionOrOptions === "string") {
      expression = expressionOrOptions;
      opts = { ...options };
    } else {
      expression = undefined;
      opts = { ...(expressionOrOptions ?? {}), ...options };
    }
    // `if_exists:` is a kwarg in Rails, so it is not part of the `**options`
    // either lookup receives.
    const { ifExists, ...lookupOptions } = opts;

    if (ifExists === true && !(await this.checkConstraintExists(tableName, lookupOptions))) return;

    const chk = await this.checkConstraintForBang(tableName, { expression, ...lookupOptions });
    // Rails: at = create_alter_table table_name; at.drop_check_constraint chk.name;
    //        execute schema_creation.accept(at)
    // Route through AlterTable so adapters emit dialect-specific DROP syntax
    // (MySQL `DROP CHECK`) rather than a hardcoded `DROP CONSTRAINT`.
    const at = this.createAlterTable(tableName);
    at.dropCheckConstraint(chk.name);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async addTimestamps(tableName: string, options: ColumnOptions = {}): Promise<void> {
    const fragments = await this.addTimestampsForAlter(tableName, options);
    await this.execute(`ALTER TABLE ${this.quoteTableName(tableName)} ${fragments.join(", ")}`);
  }

  async removeTimestamps(tableName: string): Promise<void> {
    await this.removeColumns(tableName, "updated_at", "created_at");
  }

  async createJoinTable(
    table1: string,
    table2: string,
    kwargsOrFn?: JoinTableOptions | ((t: TableDefinition) => void),
    fn?: (t: TableDefinition) => void,
  ): Promise<void> {
    let kwargs: JoinTableOptions = {};
    let definer: ((t: TableDefinition) => void) | undefined;
    if (typeof kwargsOrFn === "function") {
      definer = kwargsOrFn;
    } else if (kwargsOrFn) {
      kwargs = kwargsOrFn;
      definer = fn;
    }
    // Rails takes `column_options:` as its own kwarg, so `options` is the rest
    // (schema_statements.rb:389); `find_join_table_name` then deletes
    // `:table_name` out of it (:390).
    const options: JoinTableOptions = { ...kwargs };
    let columnOptions = options.columnOptions ?? {};
    delete options.columnOptions;
    const joinTableName = this.findJoinTableName(table1, table2, options);
    // schema_statements.rb:391 — `column_options.reverse_merge!`.
    columnOptions = { null: false, index: false, ...columnOptions };
    const [t1Ref, t2Ref] = [table1, table2].map((t) => this.referenceNameForTable(t));

    await this.createTable(joinTableName, { ...options, id: false }, (t) => {
      t.references(t1Ref, columnOptions);
      t.references(t2Ref, columnOptions);
      if (definer) definer(t);
    });
  }

  async dropJoinTable(
    table1: string,
    table2: string,
    kwargs: { tableName?: string; ifExists?: boolean; force?: boolean | "cascade" } = {},
  ): Promise<void> {
    // Ruby's `**options` (schema_statements.rb:427) collects a FRESH hash, so
    // `find_join_table_name`'s `options.delete(:table_name)` cannot reach the
    // caller's. A TS object is passed by reference, so copy it here.
    const options = { ...kwargs };
    const joinTableName = this.findJoinTableName(table1, table2, options);
    await this.dropTable(joinTableName, options);
  }

  /**
   * Rails spells the receiver the yielded `Table` is bound to as the second
   * POSITIONAL parameter — `change_table(table_name, base = self, **options)`
   * (schema_statements.rb:510-518). TS puts it last because slot 2 is already
   * the options-or-block union Ruby gets from `**options` plus a real block.
   */
  async changeTable(
    tableName: string,
    fnOrOptions?: ((t: Table) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: Table) => void | Promise<void>,
    base: unknown = this,
  ): Promise<void> {
    const options = typeof fnOrOptions === "function" ? {} : (fnOrOptions ?? {});
    const callback = typeof fnOrOptions === "function" ? fnOrOptions : fn;

    const supportsBulk =
      typeof (this as any).supportsBulkAlter === "function" &&
      (this as any).supportsBulkAlter() === true;

    if (options.bulk && supportsBulk) {
      const recorder = new CommandRecorder(this);
      const bulkTable = this.updateTableDefinition(tableName, recorder as unknown);
      if (callback) await callback(bulkTable);
      await this.bulkChangeTable(tableName, recorder.commands);
    } else {
      const table = this.updateTableDefinition(tableName, base);
      if (callback) await callback(table);
    }
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    oldName = String(oldName);
    newName = String(newName);
    this.validateIndexLengthBang(tableName, newName);

    const oldIndexDef = (await this.indexes(tableName)).find((i) => i.name === oldName);
    if (!oldIndexDef) return;
    await this.addIndex(tableName, oldIndexDef.columns, {
      name: newName,
      unique: oldIndexDef.unique,
    });
    await this.removeIndex(tableName, { name: oldName });
  }

  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string {
    // Rails `index_name`: the `column` branch routes through generate_index_name
    // (length/hash fallback) by default; the bare `_and_` join is only used when
    // `options[:_uses_legacy_index_name]` is set (Rails migration compatibility).
    if (typeof options !== "string" && !Array.isArray(options)) {
      if (options.column != null) {
        if (options._usesLegacyIndexName) {
          const cols = Array.isArray(options.column) ? options.column : [options.column];
          return `index_${tableName}_on_${cols.join("_and_")}`;
        }
        return this.generateIndexName(tableName, options.column);
      }
      if (options.name != null) return options.name;
      throw new ArgumentError("You must specify the index name");
    }
    return this.indexName(tableName, this.indexNameOptions(options));
  }

  async removeColumns(tableName: string, ...columns: string[]): Promise<void>;
  async removeColumns(tableName: string, ...args: [...string[], ColumnOptions]): Promise<void>;
  async removeColumns(
    tableName: string,
    ...columnsOrOptions: Array<string | ColumnOptions>
  ): Promise<void> {
    const last = columnsOrOptions[columnsOrOptions.length - 1];
    const hasOpts = typeof last === "object" && last !== null;
    const opts = (hasOpts ? columnsOrOptions.pop() : {}) as ColumnOptions;
    const columns = columnsOrOptions as string[];
    if (columns.length === 0) {
      throw new ArgumentError(
        "You must specify at least one column name. Example: remove_columns(:people, :first_name)",
      );
    }
    const fragments = this.removeColumnsForAlter(tableName, columns, { ...opts } as Record<
      string,
      unknown
    >);
    await this.execute(`ALTER TABLE ${this.quoteTableName(tableName)} ${fragments.join(", ")}`);
  }

  async addColumns(
    tableName: string,
    ...args: [...string[], { type: ColumnType } & ColumnOptions]
  ): Promise<void>;
  async addColumns(
    tableName: string,
    ...columnsAndOptions: Array<string | ({ type: ColumnType } & ColumnOptions)>
  ): Promise<void> {
    const last = columnsAndOptions[columnsAndOptions.length - 1];
    if (typeof last !== "object" || last === null || !("type" in last)) {
      throw new TypeError("addColumns requires a trailing options hash with a :type entry");
    }
    const { type, ...rest } = columnsAndOptions.pop() as { type: ColumnType } & ColumnOptions;
    const columns = columnsAndOptions as string[];
    for (const col of columns) {
      await this.addColumn(tableName, col, type, rest);
    }
  }

  /**
   * Mirrors: SchemaStatements#columns (schema_statements.rb:107-113) —
   * `column_definitions(table_name).map { |field| new_column_from_field(...) }`.
   * Both callees are per-adapter overrides (PostgreSQL, MySQL, SQLite3), as in
   * Rails, so they are absent from the abstract host's type and reached through
   * a cast; `new_column_from_field` is async here, so the map is awaited.
   */
  async columns(tableName: string): Promise<Column[]> {
    tableName = String(tableName);
    const adapter = this as unknown as {
      columnDefinitions(tableName: string): Promise<any[]>;
      newColumnFromField(
        tableName: string,
        field: any,
        definitions: any[],
      ): Column | Promise<Column>;
    };
    const definitions = await adapter.columnDefinitions(tableName);
    return Promise.all(
      definitions.map((field) => adapter.newColumnFromField(tableName, field, definitions)),
    );
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    switch (this.adapterName as AdapterName) {
      case "sqlite":
        return sqliteIndexes(this as unknown as DatabaseAdapter, tableName);
      case "postgres": {
        const rows = (
          await this.internalExecQuery(
            `SELECT i.relname AS name, ix.indisunique AS unique, array_agg(a.attname ORDER BY k.n) AS columns,
                  bool_or(ix.indexprs IS NOT NULL) AS has_expressions,
                  pg_get_indexdef(i.oid) AS definition
           FROM pg_index ix
           JOIN pg_class t ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n) ON true
           LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
           WHERE t.relname = '${tableName}' AND n.nspname = 'public' AND NOT ix.indisprimary
           GROUP BY i.relname, ix.indisunique, i.oid`,
            "SCHEMA",
          )
        ).toArray();
        return rows.map((row: any) => {
          const def = (row.definition as string) ?? "";
          const defMatch = def.match(
            / USING \w+? \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?$/s,
          );
          const expressions = defMatch?.[1] ?? "";
          const where = defMatch?.[4]?.trim();
          // Mirrors Rails (postgresql/schema_statements.rb:117) and the concrete
          // adapter: an expression index stores `columns` as the raw expression
          // string parsed from pg_get_indexdef, since the LEFT JOIN on
          // `pg_attribute` yields NULL for expression keys (attnum 0). Plain
          // indexes keep the column array and parse orders.
          const hasExpressions = row.has_expressions === true;
          const columns: string | string[] = hasExpressions
            ? expressions
            : Array.isArray(row.columns)
              ? row.columns
              : [row.columns];
          const ordersMap: Record<string, string> = {};
          const COL_RE = /(\w+)"?\s?(\w+_ops(?:_\w+)?)?\s?(DESC)?\s?(NULLS (?:FIRST|LAST))?/g;
          if (!hasExpressions) {
            for (const [, column, , desc, nulls] of expressions.matchAll(COL_RE)) {
              if (nulls) {
                ordersMap[column] = [desc, nulls].filter(Boolean).join(" ");
              } else if (desc) {
                ordersMap[column] = "desc";
              }
            }
          }
          return new IndexDefinition(tableName, row.name, row.unique === true, columns, {
            where,
            orders: ordersMap,
          });
        });
      }
      case "mysql2": {
        const rows = (
          await this.internalExecQuery(
            `SHOW INDEX FROM ${this.quoteTableName(tableName)} WHERE Key_name != 'PRIMARY'`,
            "SCHEMA",
          )
        ).toArray();
        const indexMap = new Map<
          string,
          { unique: boolean; seqs: [number, string, string | null][] }
        >();
        for (const row of rows as any[]) {
          const name = row.Key_name;
          if (!indexMap.has(name)) {
            indexMap.set(name, { unique: row.Non_unique === 0, seqs: [] });
          }
          // `Collation` is 'A' (ascending), 'D' (descending), or null (unsorted);
          // descending columns surface in `orders`, mirroring Rails' MySQL adapter.
          // Read both casings (the concrete adapter does `Collation ?? COLLATION`).
          indexMap
            .get(name)!
            .seqs.push([row.Seq_in_index, row.Column_name, row.Collation ?? row.COLLATION ?? null]);
        }
        return Array.from(indexMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, info]) => {
            info.seqs.sort((a, b) => a[0] - b[0]);
            const columns = info.seqs.map((s) => s[1]);
            // Mirrors Rails' MySQL adapter: `orders[col] = :desc if Collation == "D"`.
            const ordersMap: Record<string, string> = {};
            for (const [, column, collation] of info.seqs) {
              if (collation === "D") ordersMap[column] = "desc";
            }
            return new IndexDefinition(tableName, name, info.unique, columns, {
              orders: ordersMap,
            });
          });
      }
    }
  }

  /**
   * Mirrors: SchemaStatements#primary_key (schema_statements.rb:145-149) —
   * `pk = primary_keys(table_name); pk = pk.first unless pk.size > 1; pk`.
   * `primary_keys` is a per-adapter override, so it is reached through a cast
   * for the same reason as `columns`' callees above.
   */
  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const primaryKeys = await (
      this as unknown as { primaryKeys(tableName: string): Promise<string[]> }
    ).primaryKeys(tableName);
    let pk: string | string[] | null = primaryKeys;
    if (!(primaryKeys.length > 1)) pk = primaryKeys[0] ?? null;
    return pk;
  }

  async foreignKeys(_tableName: string): Promise<ForeignKeyDefinition[]> {
    // @nie disposition=TODO
    throw new NotImplementedError("foreign_keys is not implemented");
  }

  async tables(): Promise<string[]> {
    return (await this.queryValues(this.dataSourceSql({ type: "BASE TABLE" }), "SCHEMA")).map(
      String,
    );
  }

  async views(): Promise<string[]> {
    return (await this.queryValues(this.dataSourceSql({ type: "VIEW" }), "SCHEMA")).map(String);
  }

  async viewExists(viewName: string): Promise<boolean | null> {
    // Mirrors Rails:
    //   query_values(data_source_sql(view_name, type: "VIEW"), "SCHEMA").any?
    //     if view_name.present?
    //   rescue NotImplementedError
    //     views.include?(view_name.to_s)
    //
    // present? covers blank strings including whitespace-only.
    // The "SCHEMA" name is what keeps the probe out of assertQueries counts.
    if (!isPresent(viewName)) return null;
    try {
      return any(await this.queryValues(this.dataSourceSql(viewName, { type: "VIEW" }), "SCHEMA"));
    } catch (e) {
      if (e instanceof NotImplementedError) {
        return (await this.views()).includes(String(viewName));
      }
      throw e;
    }
  }

  async indexExists(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options?: { unique?: boolean; name?: string; valid?: boolean; column?: string | string[] },
  ): Promise<boolean> {
    const allIndexes = await this.indexes(tableName);
    // Rails `defined_for?`: `columns = options[:column] if columns.blank?`, then
    // the column check only applies when columns are present (`columns.blank?` —
    // nil, "", and [] are all absent), so `index_exists?(:t, nil, name: ...)`
    // matches on name alone (used to reverse a named expression index).
    const isBlank = (c: string | string[] | null | undefined): boolean =>
      c == null || c === "" || (Array.isArray(c) && c.length === 0);
    const columns = isBlank(columnName) ? options?.column : columnName;
    const targetCols = isBlank(columns)
      ? null
      : Array.isArray(columns)
        ? columns
        : [columns as string];

    return allIndexes.some((idx) => {
      if (options?.name && idx.name !== options.name) return false;
      if (options?.unique !== undefined && idx.unique !== options.unique) return false;
      // Mirrors Rails Index#defined_for? — filter on index validity when given
      // (used to distinguish a failed CONCURRENTLY index, which is left invalid).
      if (options?.valid !== undefined && (idx as { valid?: boolean }).valid !== options.valid)
        return false;
      if (targetCols == null) return true;
      // Mirrors Rails `Array(self.columns) == Array(columns).map(&:to_s)`:
      // an expression index carries its columns as a single String, which
      // `Array()` wraps into a one-element array, so a matching expression
      // passed as `column_name` compares equal.
      const idxCols = Array.isArray(idx.columns) ? idx.columns : [idx.columns];
      return targetCols.length === idxCols.length && targetCols.every((c, i) => c === idxCols[i]);
    });
  }

  async foreignKeyExists(
    fromTable: string,
    toTable?: string | ForeignKeyLookupOptions,
    options: Omit<ForeignKeyLookupOptions, "toTable"> = {},
  ): Promise<boolean> {
    const lookup =
      typeof toTable === "string" || toTable == null
        ? { toTable: toTable ?? undefined, ...options }
        : toTable;
    return (await this.foreignKeyFor(fromTable, lookup)) !== undefined;
  }

  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    return this.schemaCreation.typeToSql(type, options);
  }

  // ---------------------------------------------------------------------------
  // Methods below match the Rails SchemaStatements API surface.
  // ---------------------------------------------------------------------------

  nativeDatabaseTypes(): Record<string, unknown> {
    return {};
  }

  async tableOptions(_tableName: string): Promise<Record<string, unknown> | null> {
    return null;
  }

  async tableComment(_tableName: string): Promise<string | null> {
    return null;
  }

  // Rails: `table_alias_length` lives only in DatabaseLimits; SchemaStatements
  // merely uses it (schema_statements.rb:28-29). Resolve it via the mixin host
  // rather than defining a duplicate that would silently diverge from
  // DatabaseLimits if an adapter overrode maxIdentifierLength.
  tableAliasFor(
    this: SchemaStatements & { tableAliasLength(): number },
    tableName: string,
  ): string {
    const maxLen = this.tableAliasLength();
    return tableName.slice(0, maxLen).replace(/\./g, "_");
  }

  async dataSources(): Promise<string[]> {
    try {
      const values = await this.queryValues(this.dataSourceSql(), "SCHEMA");
      return values.map(String);
    } catch (error) {
      if (!(error instanceof NotImplementedError)) throw error;
      const t = await this.tables();
      const v = await this.views();
      return [...new Set([...t, ...v])];
    }
  }

  async dataSourceExists(name: string): Promise<boolean | null> {
    if (!isPresent(name)) return null;
    try {
      return any(await this.queryValues(this.dataSourceSql(name), "SCHEMA"));
    } catch (error) {
      if (!(error instanceof NotImplementedError)) throw error;
      return (await this.dataSources()).includes(String(name));
    }
  }

  async buildCreateTableDefinition(
    tableName: string,
    kwargs: {
      id?: boolean | ColumnType | IdHashOptions;
      primaryKey?: string | string[] | false;
      force?: boolean | "cascade";
      [key: string]: unknown;
    } = {},
    fn?: (td: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<TableDefinitionOf<this>> {
    // schema_statements.rb:331 — `id:`, `primary_key:` and `force:` are named
    // kwargs, so `options` is the `**options` rest the two `extract!` calls
    // below consume.
    const { id = true, primaryKey, force: _force, ...options } = kwargs;
    // Rails uses `options.extract!`, which *deletes* what it returns — so
    // `_skipValidateOptions` only ever reaches the first extraction.
    const tdOptions: Record<string, unknown> = {};
    for (const key of [...this.validTableDefinitionOptions(), "_skipValidateOptions"]) {
      if (key in options) {
        tdOptions[key] = options[key];
        delete options[key];
      }
    }
    const pkOptions: Record<string, unknown> = {};
    for (const key of [...this.validPrimaryKeyOptions(), "_skipValidateOptions"]) {
      if (key in options) {
        pkOptions[key] = options[key];
        delete options[key];
      }
    }

    const tableDefinition = this.createTableDefinition(
      tableName,
      tdOptions,
    ) as TableDefinitionOf<this>;
    tableDefinition.setPrimaryKey(tableName, id, primaryKey, pkOptions);

    if (fn) await fn(tableDefinition);

    return tableDefinition;
  }

  async buildCreateJoinTableDefinition(
    table1: string,
    table2: string,
    kwargs: {
      columnOptions?: Record<string, unknown>;
      tableName?: string;
      [key: string]: unknown;
    } = {},
    fn?: (td: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<TableDefinitionOf<this>> {
    // schema_statements.rb:408-410, as in `create_join_table` above.
    const options: Record<string, unknown> = { ...kwargs };
    let columnOptions = (options.columnOptions as Record<string, unknown>) ?? {};
    delete options.columnOptions;
    const joinTableName = this.findJoinTableName(table1, table2, options);
    columnOptions = { null: false, index: false, ...columnOptions };

    const [t1Ref, t2Ref] = [table1, table2].map((t) => this.referenceNameForTable(t));

    return this.buildCreateTableDefinition(joinTableName, { ...options, id: false }, async (td) => {
      td.references(t1Ref, columnOptions);
      td.references(t2Ref, columnOptions);
      if (fn) await fn(td);
    });
  }

  async buildAddColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { ifNotExists?: boolean } = {},
  ): Promise<AlterTable | null> {
    if (options.ifNotExists && (await this.columnExists(tableName, columnName))) {
      return null;
    }
    const { ifNotExists: _, ...colOpts } = options;
    // Mirrors abstract/schema_statements.rb#build_add_column_definition:
    // default datetime precision to 6 when the adapter supports it.
    if (
      this.supportsDatetimeWithPrecision?.() &&
      type === "datetime" &&
      !("precision" in colOpts)
    ) {
      colOpts.precision = 6;
    }
    // Mirrors Rails' `build_add_column_definition` (abstract/schema_statements.rb:1697):
    // `alter_table = create_alter_table(name); alter_table.add_column(...)`.
    const at = this.createAlterTable(tableName);
    at.addColumn(columnName, type, colOpts);
    return at;
  }

  // Mirrors AbstractAdapter::SchemaStatements#build_change_column_default_definition,
  // which raises NotImplementedError; each adapter that supports it (PostgreSQL,
  // MySQL) overrides with its own column-aware ChangeColumnDefaultDefinition.
  buildChangeColumnDefaultDefinition(
    _tableName: string,
    _columnName: string,
    _defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:738
    throw new NotImplementedError("build_change_column_default_definition is not implemented");
  }

  async buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      ifNotExists?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<CreateIndexDefinition> {
    const [index, algorithm, ifNotExists] = await this.addIndexOptions(
      tableName,
      columnName,
      options,
    );
    return new CreateIndexDefinition(index, algorithm, ifNotExists);
  }

  // Rails' `index_name_exists?` is a value-returning predicate: `detect` hands
  // back the IndexDefinition, not a boolean (schema_statements.rb:1011-1014).
  // The return type is widened to include `boolean` because the PostgreSQL
  // override answers with a COUNT(*) comparison (postgresql/schema_statements.rb
  // :68-79) — Ruby needs no common type across the two bodies, TypeScript does.
  async indexNameExists(
    tableName: string,
    indexName: string,
  ): Promise<IndexDefinition | boolean | undefined> {
    indexName = String(indexName);
    return (await this.indexes(tableName)).find((i) => i.name === indexName);
  }

  foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    // Rails' foreign_key_column_for strips table_name_prefix/suffix before
    // singularizing (schema_statements.rb:1241-1244), so the default column is
    // derived from the bare table name even when new_foreign_key_definition
    // threads a prefixed to_table through.
    const name = this.stripTableNamePrefixAndSuffix(tableName);
    return `${singularize(name)}_${columnName}`;
  }

  /**
   * @missingRailsCall size — PERMANENT: RFC 0106: Ruby Array#size — JS spells it `.length`,
   *   no call to converge (schema_statements.rb:1259-1260).
   */
  foreignKeyOptions(
    fromTable: string,
    toTable: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    options = { ...options };

    if (Array.isArray(options.primaryKey)) {
      if (!options.column) {
        options.column = (options.primaryKey as string[]).map((pkColumn) =>
          this.foreignKeyColumnFor(toTable, pkColumn),
        );
      }
    } else {
      // Rails (schema_statements.rb:1254): the scalar branch always derives the
      // default column from the literal "id", independent of :primary_key.
      if (!options.column) {
        options.column = this.foreignKeyColumnFor(toTable, "id");
      }
    }

    if (!options.name) {
      options.name = this.foreignKeyName(fromTable, options);
    }

    assertCompositeForeignKeyArity(toTable, options.column, options.primaryKey);

    return options;
  }

  async checkConstraints(_tableName: string): Promise<CheckConstraintDefinition[]> {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  /**
   * `schema_statements.rb:1305-1309`:
   * `options[:name] ||= check_constraint_name(table_name, expression: expression, **options)`.
   * The double-splat comes LAST, so an `:expression` carried in options wins
   * over the positional one. The `||=` is truthy where
   * {@link checkConstraintName}'s `fetch` is key-presence — but it derives only
   * for an absent key either way, because its own derive call splats the same
   * options back through that `fetch`, which hands a stored nil straight back.
   */
  checkConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const dup = { ...options };
    dup.name ??= this.checkConstraintName(tableName, { expression, ...dup } as {
      name?: string;
      expression?: string;
    });
    return dup;
  }

  /**
   * `schema_statements.rb:1341-1343`. The argument guard is
   * `!options.key?(:name) && !options.key?(:expression)` — key presence, not
   * truthiness — so an explicitly supplied `name: ""` or `name: nil` satisfies
   * it and falls through to the lookup, which then matches nothing.
   */
  async checkConstraintExists(
    tableName: string,
    options: { name?: string; expression?: string; validate?: boolean } = {},
  ): Promise<boolean> {
    if (!("name" in options) && !("expression" in options)) {
      throw new ArgumentError("At least one of :name or :expression must be supplied");
    }
    return (await this.checkConstraintFor(tableName, options)) !== undefined;
  }

  async removeConstraint(tableName: string, constraintName: string): Promise<void> {
    const at = this.createAlterTable(tableName);
    at.dropConstraint(constraintName);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async dumpSchemaInformation(): Promise<string | null> {
    const versions = await this._pool.schemaMigration.versions();
    if (versions.length === 0) return null;
    return this.insertVersionsSql(versions);
  }

  internalStringOptionsForPrimaryKey(): Record<string, unknown> {
    return { primaryKey: true };
  }

  async assumeMigratedUptoVersion(version: number | string): Promise<void> {
    const leading = /^\s*([+-]?\d+(?:_\d+)*)/.exec(String(version));
    version = leading ? parseInt(leading[1].replace(/_/g, ""), 10) : 0;

    const pool = this._pool;
    const smTable = this.quoteTableName(pool.schemaMigration.tableName);

    const migrationContext = pool.migrationContext;
    const migrated = await migrationContext.getAllVersions();
    const allVersions = migrationContext.migrations.map((m) => m.version);

    if (!migrated.includes(version)) {
      await this.execute(`INSERT INTO ${smTable} (version) VALUES (${this.quote(version)})`);
    }

    const inserting = allVersions.filter((v) => v < version && !migrated.includes(v));
    if (inserting.length > 0) {
      const duplicate = inserting.find((v) => inserting.filter((x) => x === v).length > 1);
      if (duplicate !== undefined) {
        throw new Error(
          `Duplicate migration ${duplicate}. Please renumber your migrations to resolve the conflict.`,
        );
      }
      await this.execute(this.insertVersionsSql(inserting));
    }
  }

  columnsForDistinct(columns: string | string[], _orders?: string[]): string | string[] {
    return columns;
  }

  /**
   * Mirrors: ConnectionAdapters::SchemaStatements#distinct_relation_for_primary_key
   * (schema_statements.rb:1429-1452).
   *
   * Rails returns the rewritten `relation`; every rewrite it performs (`none!`,
   * `where!`, `limit_value=`/`offset_value=`) is an in-place mutation of the
   * argument, so the caller holds the same object either way. TypeScript cannot
   * return it: a trails `Relation` is thenable, so resolving it out of this
   * `Promise` would run the relation and hand back its records instead. The
   * caller therefore reuses the relation it passed in.
   */
  async distinctRelationForPrimaryKey(relation: Relation<Base>): Promise<void> {
    const primaryKeyColumns = wrap(relation.primaryKey).map((column) =>
      this.visitor.compile(relation.table.get(column)),
    );

    const values = this.columnsForDistinct(primaryKeyColumns, relation.orderValues as string[]);

    const limited = relation.reselect(values).distinctBang();
    const limitedIds = (await this.selectRows(limited.arel(), "SQL")).map((results) =>
      results.slice(results.length - wrap(relation.primaryKey).length),
    );

    if (limitedIds.length === 0) {
      relation.noneBang();
    } else {
      relation.whereBang(
        Object.fromEntries(
          wrap(relation.primaryKey).map((key, i) => [key, limitedIds.map((row) => row[i])]),
        ),
      );
    }

    relation.limitValue = relation.offsetValue = null;
  }

  updateTableDefinition(tableName: string, base?: unknown): Table {
    return new Table(tableName, (base ?? this) as SchemaStatements);
  }

  /**
   * Rails takes `name`, `if_not_exists` and `internal` as their own kwargs, so
   * they are out of the asserted set (schema_statements.rb:1476-1477).
   */
  async addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      ifNotExists?: boolean;
      internal?: boolean;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      [key: string]: unknown;
    } = {},
  ): Promise<[IndexDefinition, string | undefined, boolean]> {
    const { name: _n, ifNotExists: _i, internal: _int, ...rest } = options;
    assertValidKeys(rest, [
      "unique",
      "length",
      "order",
      "opclass",
      "where",
      "type",
      "using",
      "comment",
      "algorithm",
      "include",
      "nullsNotDistinct",
    ]);

    // Mirrors Rails: a String column with non-word chars (e.g. "remind_at, place_id"
    // or "(data->'foo')") is an expression — kept verbatim as the index columns,
    // with the index name derived from its `\w+` runs joined by "_".
    const columnNames = this.indexColumnNames(columnName);
    const indexName = options.name?.toString() ?? this.indexName(tableName, columnNames);

    this.validateIndexLengthBang(tableName, indexName, options.internal);

    const idx = new IndexDefinition(tableName, indexName, !!options.unique, columnNames, {
      where: options.where,
      using: options.using,
      type: options.type,
      lengths: (options.length ?? {}) as Record<string, number>,
      orders: (options.order ?? {}) as Record<string, string>,
      opclasses: (options.opclass ?? {}) as Record<string, string>,
      include: options.include as string[] | undefined,
      nullsNotDistinct: options.nullsNotDistinct as boolean | undefined,
      comment: options.comment as string | undefined,
    });
    return [idx, this.indexAlgorithm(options.algorithm), !!options.ifNotExists];
  }

  /**
   * @missingRailsCall fetch — PERMANENT: `index_algorithms.fetch(algorithm) { raise ... }`
   *   (schema_statements.rb:1504-1506). Hash#fetch is a Ruby core method with no JS
   *   analogue: a plain object has no `fetch`, and there is no ported receiver to call
   *   either — ActiveSupport's `core_ext/hash` defines no `fetch`, so a trails helper
   *   would be surface Rails does not have. The key-presence test and the block's raise
   *   are spelled inline at Rails' site, with Rails' arguments and message; the test is
   *   `Object.hasOwn`, since a Hash has no prototype chain for `"toString"` to find.
   */
  indexAlgorithm(algorithm?: string): string | undefined {
    if (algorithm == null) return undefined;
    const indexAlgorithms = this.indexAlgorithms();
    if (Object.hasOwn(indexAlgorithms, algorithm)) return indexAlgorithms[algorithm];
    throw new ArgumentError(
      `Algorithm must be one of the following: ${Object.keys(indexAlgorithms)
        .map((a) => `:${a}`)
        .join(", ")}`,
    );
  }

  async quotedColumnsForIndex(
    columnNames: string[],
    options: Record<string, unknown> = {},
  ): Promise<string> {
    const quotedColumns = new Map(columnNames.map((name) => [name, this.quoteColumnName(name)]));
    return Array.from(
      (
        await this.addOptionsForIndexColumns(
          quotedColumns,
          options as { order?: string | Record<string, string> },
        )
      ).values(),
    ).join(", ");
  }

  isOptionsIncludeDefault(options: Record<string, unknown>): boolean {
    return "default" in options && !(options.null === false && options.default == null);
  }

  async changeTableComment(_tableName: string, _commentOrChanges: CommentOrChanges): Promise<void> {
    throw new Error(
      `NotImplementedError: ${this.adapterName} does not support changing table comments`,
    );
  }

  async changeColumnComment(
    _tableName: string,
    _columnName: string,
    _commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    throw new Error(
      `NotImplementedError: ${this.adapterName} does not support changing column comments`,
    );
  }

  createSchemaDumper(options: Record<string, unknown> = {}): SchemaDumper {
    return SchemaDumper.create(this as Parameters<typeof SchemaDumper.create>[0], options);
  }

  useForeignKeys(): boolean {
    return this.supportsForeignKeys() && this.isForeignKeysEnabled();
  }

  async bulkChangeTable(tableName: string, operations: MigrationCommand[]): Promise<void> {
    let sqlFragments: string[] = [];
    let nonCombinableOperations: Array<() => Promise<void>> = [];

    for (const [command, args] of operations) {
      const [table, ...arguments_] = args as [string, ...unknown[]];
      const method = `${command}ForAlter`;

      if (typeof (this as any)[method] === "function") {
        const result = await (this as any)[method](table, ...arguments_);
        // Ruby `Array(x)`: nil is [], an Array passes through, anything else
        // wraps. `partition` then splits it on String, so every non-String —
        // not only a callable — lands in `procs`.
        const values = result == null ? [] : Array.isArray(result) ? result : [result];
        const sqls: string[] = [];
        const procs: Array<() => Promise<void>> = [];
        for (const v of values) {
          if (typeof v === "string") sqls.push(v);
          else procs.push(v as () => Promise<void>);
        }
        sqlFragments = sqlFragments.concat(sqls);
        nonCombinableOperations = nonCombinableOperations.concat(procs);
      } else {
        if (sqlFragments.length > 0) {
          await this.execute(
            `ALTER TABLE ${this.quoteTableName(tableName)} ${sqlFragments.join(", ")}`,
          );
        }
        for (const proc of nonCombinableOperations) await proc();
        sqlFragments = [];
        nonCombinableOperations = [];
        await (this as any)[command](table, ...arguments_);
      }
    }

    if (sqlFragments.length > 0) {
      await this.execute(
        `ALTER TABLE ${this.quoteTableName(tableName)} ${sqlFragments.join(", ")}`,
      );
    }
    for (const proc of nonCombinableOperations) await proc();
  }

  validTableDefinitionOptions(): string[] {
    return ["temporary", "ifNotExists", "options", "as", "comment", "charset", "collation"];
  }

  validColumnDefinitionOptions(): string[] {
    return ColumnDefinition.OPTION_NAMES;
  }

  validPrimaryKeyOptions(): string[] {
    return ["limit", "default", "precision"];
  }

  maxIndexNameSize(): number {
    return 62;
  }

  /**
   * @internal
   *
   * @missingRailsCall first — PERMANENT: RFC 0106: Ruby String#first(10) on a hexdigest —
   *   the port slices (schema_statements.rb:1603).
   * @missingRailsCall limit — CONVERGEABLE: `name.mb_chars.limit(short_limit)`
   *   (schema_statements.rb:1608). ActiveSupport::Multibyte::Chars is unported, so
   *   there is no `limit` receiver to call; `Chars#limit` is defined as
   *   `truncate_bytes(limit, omission: nil)` (multibyte/chars.rb:118-120), which is
   *   what the port calls directly, so the byte-truncation behaviour matches.
   */
  generateIndexName(tableName: string, column: string | string[]): string {
    const cols = Array.isArray(column) ? column : [column];
    const name = `index_${tableName}_on_${cols.join("_and_")}`;
    if (new TextEncoder().encode(name).length <= this.maxIndexNameSize()) return name;

    const hashedIdentifier =
      "_" + getCrypto().createHash("sha256").update(name).digest("hex").slice(0, 10);
    const shortName = `idx_on_${cols.join("_")}`;

    const shortLimit = this.maxIndexNameSize() - new TextEncoder().encode(hashedIdentifier).length;
    return `${truncateBytes(shortName, shortLimit, { omission: null })}${hashedIdentifier}`;
  }

  /** @internal */
  validateChangeColumnNullArgumentBang(value: unknown): void {
    if (value !== true && value !== false) {
      throw new ArgumentError(
        `change_column_null expects a boolean value (true for NULL, false for NOT NULL). Got: ${rubyInspect(value)}`,
      );
    }
  }

  /** @internal */
  columnOptionsKeys(): string[] {
    return ["limit", "precision", "scale", "default", "null", "collation", "comment"];
  }

  /** @internal */
  addIndexSortOrder(
    quotedColumns: Map<string, string>,
    options: { order?: string | Record<string, string> },
  ): Map<string, string> {
    const orders = this.optionsForIndexColumns(options.order);
    for (const [name, _col] of quotedColumns) {
      const dir = orders(name);
      if (dir) quotedColumns.set(name, `${quotedColumns.get(name)} ${dir.toUpperCase()}`);
    }
    return quotedColumns;
  }

  /** @internal */
  optionsForIndexColumns<T extends string | number>(
    options: T | Record<string, T> | undefined,
  ): (col: string) => T | undefined {
    if (options && typeof options === "object") {
      return (col: string) => options[col];
    }
    return (_col: string) => options ?? undefined;
  }

  /** @internal */
  async addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    } = {},
  ): Promise<Map<string, string>> {
    if (await this.supportsIndexSortOrder()) {
      quotedColumns = this.addIndexSortOrder(quotedColumns, options);
    }
    return quotedColumns;
  }

  /** @internal */
  async indexNameForRemove(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: { name?: string; column?: string | string[] },
  ): Promise<string> {
    if (this.canRemoveIndexByName(columnName, options) && options.name) {
      return options.name;
    }

    const checks: Array<(idx: IndexDefinition) => boolean> = [];
    let columnNames: string[];

    if (
      !options.name &&
      this.isExpressionColumnName(typeof columnName === "string" ? columnName : "")
    ) {
      options = { ...options, name: this.indexName(tableName, columnName as string) };
      columnNames = [];
    } else {
      const rawColumn = columnName ?? options.column;
      columnNames =
        rawColumn !== undefined && rawColumn !== "" ? this.indexColumnNames(rawColumn) : [];
    }

    if (options.name) {
      const n = options.name;
      checks.push((i) => i.name === n);
    }

    // Rails: `if column_names.present? && !(options.key?(:name) &&
    // expression_column_name?(column_names))` — an expression passed via the
    // `column:` option (kept as a raw string by indexColumnNames) is matched by
    // name only, so the column check is skipped.
    if (
      columnNames.length > 0 &&
      !(options.name && this.isExpressionColumnName(columnNames as unknown as string))
    ) {
      checks.push(
        (i) => this.indexName(tableName, i.columns) === this.indexName(tableName, columnNames),
      );
    }

    if (checks.length === 0) throw new ArgumentError("No name or columns specified");

    const allIndexes = await this.indexes(tableName);
    const matching = allIndexes.filter((i) => checks.every((c) => c(i)));

    if (matching.length > 1) {
      throw new ArgumentError(
        `Multiple indexes found on ${tableName} columns ${columnNames}. Specify an index name from ${matching.map((i) => i.name).join(", ")}`,
      );
    } else if (matching.length === 0) {
      throw new ArgumentError(`No indexes found on ${tableName} with the options provided.`);
    }
    return matching[0].name;
  }

  /** @internal */
  async renameTableIndexes(
    tableName: string,
    newName: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const idxs = await this.indexes(newName);
    for (const index of idxs) {
      const generatedIndexName = this.indexName(tableName, {
        column: index.columns,
        ...options,
      } as any);
      if (generatedIndexName === index.name) {
        await this.renameIndex(
          newName,
          generatedIndexName,
          this.indexName(newName, { column: index.columns, ...options } as any),
        );
      }
    }
  }

  /** @internal */
  async renameColumnIndexes(
    tableName: string,
    columnName: string,
    newColumnName: string,
  ): Promise<void> {
    const colName = String(columnName);
    const newColName = String(newColumnName);
    const idxs = await this.indexes(tableName);
    for (const index of idxs) {
      if (!index.columns.includes(newColName)) continue;
      const oldColumns = [...index.columns];
      const pos = oldColumns.indexOf(newColName);
      oldColumns[pos] = colName;
      const generatedIndexName = this.indexName(tableName, { column: oldColumns });
      if (generatedIndexName === index.name) {
        await this.renameIndex(
          tableName,
          generatedIndexName,
          this.indexName(tableName, { column: index.columns }),
        );
      }
    }
  }

  /** @internal */
  createTableDefinition(name: string, options: Record<string, unknown> = {}): TableDefinition {
    return new TableDefinition(this, name, options);
  }

  /**
   * Mirrors Rails `abstract/schema_statements.rb:1705`:
   * `AlterTable.new(create_table_definition(name))`. Passing the
   * TableDefinition lets `AlterTable#addColumn` route through
   * `td.newColumnDefinition` for adapter-specific type normalization
   * (PG virtual → underlying type, MySQL aliases, etc.).
   * @internal
   */
  createAlterTable(name: string): AlterTable {
    return new AlterTable(this.createTableDefinition(name));
  }

  /** @internal */
  validateCreateTableOptionsBang(options: Record<string, unknown>): void {
    if (options._skipValidateOptions) return;
    const { _usesLegacyTableName: _l, _skipValidateOptions: _s, ...rest } = options;
    assertValidKeys(rest, [
      ...this.validTableDefinitionOptions(),
      ...this.validPrimaryKeyOptions(),
    ]);
  }

  /**
   * PostgreSQL never lands here — it defines its own async `fetchTypeMetadata`
   * (postgresql-adapter.ts) keyed on OID — which is why the sync `Type` this
   * reads is safe despite `PostgreSQLAdapter#lookupCastType` returning a promise.
   * @internal
   */
  fetchTypeMetadata(sqlType: string | null): SqlTypeMetadata {
    const castType = this.lookupCastType(sqlType) as Type;
    return new SqlTypeMetadata({
      sqlType,
      // Rails' `cast_type.type` (schema_statements.rb:1721) — `Type#type` is a
      // method here, not a getter, so it must be invoked.
      type: castType?.type(),
      limit: castType?.limit,
      precision: castType?.precision,
      scale: castType?.scale,
    });
  }

  /** @internal */
  indexColumnNames(columnNames: string | string[]): string[] {
    if (this.isExpressionColumnName(columnNames as string)) {
      return columnNames as unknown as string[];
    }
    return Array.isArray(columnNames) ? columnNames : [columnNames];
  }

  /** @internal */
  indexNameOptions(columnNames: string | string[]): { column: string | string[] } {
    if (this.isExpressionColumnName(columnNames as string)) {
      const joined = (columnNames as string).match(/\w+/g)?.join("_") ?? String(columnNames);
      return { column: joined };
    }
    return { column: columnNames };
  }

  /** @internal */
  isExpressionColumnName(columnName: string): boolean {
    return typeof columnName === "string" && /\W/.test(columnName);
  }

  /**
   * @internal
   * Rails reads `Base.table_name_prefix` / `Base.table_name_suffix` (model-class
   * globals). Importing Base here creates a circular dependency
   * (base.ts → connection-adapters/abstract/connection-handler.ts), so the globals
   * arrive through the `table-name-options` registry Base populates at load; an
   * adapter-level override still wins.
   */
  stripTableNamePrefixAndSuffix(tableName: string): string {
    const adapter = this as any;
    const prefix: string = adapter.tableNamePrefix ?? globalTableNamePrefix();
    const suffix: string = adapter.tableNameSuffix ?? globalTableNameSuffix();
    const str = String(tableName);
    const m = str.match(new RegExp(`${prefix}(.+)${suffix}`));
    return m ? m[1] : str;
  }

  /**
   * @internal
   *
   * @missingRailsCall first — PERMANENT: RFC 0106: Ruby String#first(10) on a hexdigest —
   *   the port slices (schema_statements.rb:1755-1762).
   * @missingRailsCall map — PERMANENT: RFC 0106: Ruby Array#map(&:to_s) over already-string
   *   column names — the port has no to_s hop to map
   *   (schema_statements.rb:1757).
   */
  foreignKeyName(
    tableName: string,
    options: { name?: string; column?: string | string[] },
  ): string {
    if (options.name) return options.name;
    if (options.column === undefined) {
      throw new ArgumentError(`foreign_key_name requires either :name or :column to be specified`);
    }
    const cols = Array.isArray(options.column) ? options.column : [options.column];
    const identifier = `${tableName}_${cols.join("_and_")}_fk`;
    const hex = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `fk_rails_${hex}`;
  }

  /** @internal */
  async foreignKeyFor(
    fromTable: string,
    options: ForeignKeyLookupOptions = {},
  ): Promise<ForeignKeyDefinition | undefined> {
    if (!this.useForeignKeys()) return undefined;
    const fks = await this.foreignKeys(fromTable);
    return fks.find((fk) => fk.isDefinedFor(options));
  }

  /** @internal */
  async foreignKeyForBang(
    fromTable: string,
    options: ForeignKeyLookupOptions = {},
  ): Promise<ForeignKeyDefinition> {
    const fk = await this.foreignKeyFor(fromTable, options);
    if (!fk) {
      throw new ArgumentError(
        `Table '${fromTable}' has no foreign key for ${options.toTable ?? rubyInspectHash(options)}`,
      );
    }
    return fk;
  }

  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined {
    switch (specifier) {
      case "CASCADE":
        return "cascade";
      case "SET NULL":
        return "nullify";
      case "RESTRICT":
        return "restrict";
      default:
        return undefined;
    }
  }

  /** @internal */
  /**
   * `abstract/schema_statements.rb:1783-1785` — `@config.fetch(:foreign_keys, true)`.
   *
   * `Hash#fetch` yields the *stored* value whenever the key is present, so an
   * explicit `foreign_keys: nil` disables foreign keys in Ruby; only an absent
   * key takes the `true` default. `??` / `!== false` would answer `true` for
   * that stored null, which is the one input the two expressions disagree on.
   * The stored value is then read for Ruby truthiness, not as a boolean.
   * @internal
   *
   * @missingRailsCall fetch — PERMANENT: RFC 0106: schema_statements.rb:1783-1785 is
   *   `@config.fetch(:foreign_keys, true)`. The port already matches its
   *   SEMANTICS — schema-statements.ts:2328-2331 spells the key-present test as
   *   `"foreignKeys" in this._config ? ... : true`, so a stored null stays falsy
   *   — but `in` emits no callee, so no TS call can credit Ruby's `fetch`.
   *   Language shortcoming: JS has no Hash#fetch.
   */
  isForeignKeysEnabled(): boolean {
    const foreignKeys = "foreignKeys" in this._config ? this._config.foreignKeys : true;
    return foreignKeys != null && foreignKeys !== false;
  }

  /**
   * `schema_statements.rb:1787-1795`, which is two `Hash#fetch` calls:
   * `options.fetch(:name) { ... options.fetch(:expression) ... }`. `fetch` runs
   * its block only when the KEY IS ABSENT, so a stored nil comes back as-is —
   * `{name: nil, expression: "x"}.fetch(:name) { "derived" }` is nil, and a
   * truthy check would instead conflate "no :name given" with "given, but nil".
   * The `||=` in {@link checkConstraintOptions} (`:1305-1309`) is the
   * deliberately different one.
   *
   * The inner fetch takes no default either, so an ABSENT `:expression` raises
   * where a stored nil interpolates as the empty string ("users__chk"). Rails
   * raises Ruby's core `KeyError` there, with `key not found: :expression`.
   * @internal
   *
   * @missingRailsCall first — PERMANENT: RFC 0106: Ruby String#first(10) on a hexdigest —
   *   the port slices; no call to converge (schema_statements.rb:1787-1795).
   */
  checkConstraintName(
    tableName: string,
    options: { name?: string; expression?: string } = {},
  ): string | undefined {
    if ("name" in options) return options.name;
    if (!("expression" in options)) {
      throw new KeyError("key not found: :expression");
    }
    const expression = options.expression;
    const identifier = `${tableName}_${expression ?? ""}_chk`;
    const hex = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `chk_rails_${hex}`;
  }

  /** @internal */
  async checkConstraintFor(
    tableName: string,
    options: { name?: string; expression?: string; validate?: boolean } = {},
  ): Promise<CheckConstraintDefinition | undefined> {
    const adapter = this as any;
    if (
      typeof adapter.supportsCheckConstraints === "function" &&
      !(await adapter.supportsCheckConstraints())
    ) {
      return undefined;
    }
    const chkName = this.checkConstraintName(tableName, options);
    const constraints = await this.checkConstraints(tableName);
    return constraints.find((chk) => chk.isDefinedFor({ name: chkName, ...options }));
  }

  /**
   * Mirrors: SchemaStatements#check_constraint_for!
   * (schema_statements.rb:1802-1806) — the raise interpolates the options
   * Hash, so the message carries Ruby's `{name: "x"}` rendering, not JSON's.
   * Ruby's `expression: nil, **options` split happens in the body: an optional
   * parameter cannot be destructured in the AbstractAdapter interface
   * declaration the mixin-declaration-drift guard compares against, so `kwargs`
   * carries the bag and `options` keeps Rails' name for the interpolated rest.
   * @internal
   */
  async checkConstraintForBang(
    tableName: string,
    kwargs: { name?: string; expression?: string; validate?: boolean } = {},
  ): Promise<CheckConstraintDefinition> {
    const { expression, ...options } = kwargs;
    const chk = await this.checkConstraintFor(tableName, { expression, ...options });
    if (!chk) {
      throw new ArgumentError(
        `Table '${tableName}' has no check constraint for ${expression ?? rubyInspectHash(options)}`,
      );
    }
    return chk;
  }

  /** @internal */
  validateIndexLengthBang(tableName: string, newName: string, _internal = false): void {
    const adapter = this as unknown as { indexNameLength?(): number };
    const limit = adapter.indexNameLength ? adapter.indexNameLength() : maxIdentifierLength();
    if (newName.length > limit) {
      throw new ArgumentError(
        `Index name '${newName}' on table '${tableName}' is too long; the limit is ${limit} characters`,
      );
    }
  }

  /** @internal */
  validateTableLengthBang(tableName: string): void {
    const adapter = this as unknown as { tableNameLength?(): number };
    const limit = adapter.tableNameLength ? adapter.tableNameLength() : maxIdentifierLength();
    if (tableName.length > limit) {
      throw new ArgumentError(
        `Table name '${tableName}' is too long; the limit is ${limit} characters`,
      );
    }
  }

  /** @internal */
  extractNewDefaultValue(defaultOrChanges: unknown): unknown {
    if (
      defaultOrChanges !== null &&
      typeof defaultOrChanges === "object" &&
      "from" in (defaultOrChanges as Record<string, unknown>) &&
      "to" in (defaultOrChanges as Record<string, unknown>)
    ) {
      return (defaultOrChanges as { to: unknown }).to;
    }
    return defaultOrChanges;
  }

  /** @internal alias */
  extractNewCommentValue(defaultOrChanges: CommentOrChanges): string | null {
    // Rails aliases this to `extract_new_default_value`, which is untyped; the
    // comment arm only ever carries a string or nil.
    return this.extractNewDefaultValue(defaultOrChanges) as string | null;
  }

  /**
   * @internal
   *
   * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
   *   `options.except(:name, :algorithm).empty?` (schema_statements.rb:1830) —
   *   `empty?` on a Ruby Hash, whose faithful JS spelling is
   *   `Object.keys(h).length === 0`. That emits no callee, so no TS call can
   *   ever credit the Ruby one. The gate flags it only because `empty?` maps
   *   onto the unrelated `ActiveRecord::Result.empty`, which takes arguments
   *   since it gained Rails' `async:` kwarg (result.rb:94-100) — nothing in the
   *   TS body was dropped.
   */
  canRemoveIndexByName(
    columnName: string | string[] | undefined | null,
    options: Record<string, unknown>,
  ): boolean {
    return canRemoveIndexByName(columnName, options);
  }

  /** @internal */
  referenceNameForTable(tableName: string): string {
    return singularize(tableName.split(".").at(-1) ?? tableName);
  }

  /** @internal */
  addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<string | [string, () => Promise<void>]> {
    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(columnName, type, options);
    return this.schemaCreation.accept(new AddColumnDefinition(cd));
  }

  /** @internal Mirrors change_column_default_for_alter (schema_statements.rb:1843):
   * routes through the adapter's build_change_column_default_definition (which
   * attaches the reflected column, so PG's column-aware default quoting fires)
   * and the schema-creation visitor. The base builder raises NotImplementedError
   * as in Rails; PG and MySQL override it. */
  async changeColumnDefaultForAlter(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<string> {
    const cd = await this.buildChangeColumnDefaultDefinition(
      tableName,
      columnName,
      defaultOrChanges,
    );
    // ChangeColumnDefaultDefinition is dispatched by the PG/MySQL visitor
    // subclasses' accept overrides, not the abstract union — same as Rails,
    // where only those adapters define visit_ChangeColumnDefaultDefinition.
    return (this.schemaCreation as { accept(o: unknown): Promise<string> }).accept(cd);
  }

  /** @internal */
  renameColumnSql(_tableName: string, columnName: string, newColumnName: string): string {
    return `RENAME COLUMN ${this.quoteColumnName(columnName)} TO ${this.quoteColumnName(newColumnName)}`;
  }

  /** @internal */
  removeColumnForAlter(
    _tableName: string,
    columnName: string,
    _type?: ColumnType,
    _options: ColumnOptions = {},
  ): string {
    return `DROP COLUMN ${this.quoteColumnName(columnName)}`;
  }

  /** @internal */
  removeColumnsForAlter(
    tableName: string,
    columnNames: string[],
    _options: Record<string, unknown> = {},
  ): string[] {
    return columnNames.map((columnName) => this.removeColumnForAlter(tableName, columnName));
  }

  /** @internal */
  async addTimestampsForAlter(
    tableName: string,
    options: ColumnOptions = {},
  ): Promise<Array<string | [string, () => Promise<void>]>> {
    const opts: ColumnOptions = { ...options };
    if (opts.null == null) opts.null = false;
    if (!("precision" in opts) && (this as any).supportsDatetimeWithPrecision?.()) {
      opts.precision = 6;
    }
    return [
      await this.addColumnForAlter(tableName, "created_at", "datetime", opts),
      await this.addColumnForAlter(tableName, "updated_at", "datetime", opts),
    ];
  }

  /** @internal */
  removeTimestampsForAlter(tableName: string, _options: Record<string, unknown> = {}): string[] {
    return this.removeColumnsForAlter(tableName, ["updated_at", "created_at"]);
  }

  /** @internal */
  insertVersionsSql(versions: string | number | Array<string | number>): string {
    const smTable = this.quoteTableName(this._pool.schemaMigration.tableName);

    if (Array.isArray(versions)) {
      // Ruby's Array#reverse returns a new array; copy before reversing so we
      // don't mutate the caller's array (e.g. pool.schemaMigration.versions).
      const rows = [...versions].reverse().map((v) => `(${this.quote(v)})`);
      return `INSERT INTO ${smTable} (version) VALUES\n${rows.join(",\n")};`;
    }
    return `INSERT INTO ${smTable} (version) VALUES (${this.quote(versions)});`;
  }

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /**
   * Ruby's `data_source_sql(name = nil, type:)` (schema_statements.rb:1890) is
   * callable with the kwargs alone, and TypeScript cannot skip a leading
   * positional, so the options object may arrive in its place.
   *
   * @internal
   */
  dataSourceSql(options: { type?: string }): string;
  /** @internal */
  dataSourceSql(
    _nameOrOptions?: string | null | { type?: string },
    _options?: { type?: string },
  ): string {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1890
    throw new NotImplementedError(
      "ActiveRecord::ConnectionAdapters::SchemaStatements#data_source_sql is not implemented",
    );
  }

  /** @internal */
  quotedScope(_name?: string, _options?: { type?: string }): Record<string, string> {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_adapters/abstract/schema_statements.rb:1894
    throw new NotImplementedError(
      "ActiveRecord::ConnectionAdapters::SchemaStatements#quoted_scope is not implemented",
    );
  }

  /** @internal */
  findJoinTableName(table1: string, table2: string, options: { tableName?: string } = {}): string {
    return options.tableName ?? this.joinTableName(table1, table2);
  }

  /** @internal */
  joinTableName(table1: string, table2: string): string {
    return _joinTableName(table1, table2);
  }
}
