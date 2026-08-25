/**
 * Connection-adapters-layer SchemaDumper. Mirrors Rails'
 * `ActiveRecord::ConnectionAdapters::SchemaDumper < SchemaDumper`
 * (connection_adapters/abstract/schema_dumper.rb:5) — the adapter subclass of
 * the base dumper that adds the column-spec helpers driving `schema_type`,
 * `schema_limit`, `schema_default`, etc.
 *
 * The base `SchemaDumper#table` calls the unqualified (private) `column_spec`
 * that only this subclass defines. The base declares those members `abstract`
 * and implements none of them, so they resolve by dynamic dispatch on the
 * instance as they do in Ruby and the base module never imports this one — which
 * is what lets this module `extends` it.
 */

import { SchemaDumper as BaseSchemaDumper } from "../../schema-dumper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { ColumnInfo, IndexInfo, SchemaSource } from "../../schema-dumper.js";

/**
 * Column-shaped interface these helpers depend on.
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * converge-abstract-schema-dumper-column-onto-column-class). Rails' dumper
 * reads real `ConnectionAdapters::Column` objects, which trails ports as a
 * class in `connection-adapters/column.ts`; this weaker shape exists because
 * schema reflection hands the dumper plain records instead.
 */
export interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
  /** Raw SQL type string (e.g. "integer", "varchar(255)") — present on all schema-reflected columns. */
  sqlType?: string | null;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaDumper
 * (connection_adapters/abstract/schema_dumper.rb:5-12).
 */
export class SchemaDumper extends BaseSchemaDumper {
  static readonly DEFAULT_DATETIME_PRECISION = 6;

  /** Mirrors `def self.create(connection, options)` (abstract/schema_dumper.rb:8-10). */
  static override create<T extends typeof BaseSchemaDumper>(
    this: T,
    connection: SchemaSource | DatabaseAdapter,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new (this as unknown as new (
      connection: SchemaSource | DatabaseAdapter,
      options: Record<string, unknown>,
    ) => InstanceType<T>)(connection, options);
  }

  /** @internal */
  protected columnSpec(column: Column): [string, Record<string, unknown>] {
    return [this.schemaTypeWithVirtual(column), this.prepareColumnOptions(column)];
  }

  /** @internal */
  protected columnSpecForPrimaryKey(column: Column): Record<string, unknown> {
    const spec: Record<string, unknown> = {};
    if (!this.isDefaultPrimaryKey(column)) {
      spec["id"] = JSON.stringify(this.schemaType(column));
    }
    const colOpts = this.prepareColumnOptions(column);
    delete colOpts["null"];
    Object.assign(spec, colOpts);
    if (this.isExplicitPrimaryKeyDefault(column)) {
      // "null" (not Ruby "nil") — emitted verbatim by formatColspec as `default: null`.
      spec["default"] ??= "null";
    }
    return spec;
  }

  /** @internal */
  protected prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec: Record<string, unknown> = {};
    const limit = this.schemaLimit(column);
    if (limit !== undefined) spec["limit"] = limit;
    const precision = this.schemaPrecision(column);
    if (precision !== undefined) spec["precision"] = precision;
    const scale = this.schemaScale(column);
    if (scale !== undefined) spec["scale"] = scale;
    const def = this.schemaDefault(column);
    if (def !== undefined) spec["default"] = def;
    if (column.null === false) spec["null"] = "false";
    const collation = this.schemaCollation(column);
    if (collation !== undefined) spec["collation"] = collation;
    if (column.comment) spec["comment"] = JSON.stringify(column.comment);
    return spec;
  }

  /** @internal */
  protected isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "bigint";
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(_column: Column): boolean {
    return false;
  }

  /** @internal */
  protected schemaTypeWithVirtual(column: Column): string {
    if (column.virtual) return "virtual";
    return this.schemaType(column);
  }

  /** @internal */
  protected schemaType(column: Column): string {
    if (this.isBigint(column)) return "bigint";
    return column.type ?? "";
  }

  /**
   * Mirrors `ConnectionAdapters::Column#bigint?` (`/\Abigint\b/.match?(sql_type)`),
   * which the abstract `schema_type` consults. A live column reflects a `bigint`
   * declaration as sqlType `"bigint"`/`"BIGINT"` with dsl type `"integer"`, so
   * detect it off sqlType; the `bigint` flag / `type === "bigint"` arms keep mock
   * sources that set them directly working.
   * @internal
   */
  protected isBigint(column: Column): boolean {
    return !!column.bigint || column.type === "bigint" || /^bigint\b/i.test(column.sqlType ?? "");
  }

  /** @internal */
  protected schemaLimit(column: Column): string | undefined {
    // Mirrors Rails `schema_limit`: `limit = column.limit unless column.bigint?` — same
    // predicate `schema_type` uses, so a column whose bigint-ness is only visible through
    // sqlType is limit-suppressed too.
    if (this.isBigint(column)) return undefined;
    // Rails suppresses the serial/bigserial limit because it matches the native
    // database type's default (int4 limit = 4, int8 limit = 8). We don't have
    // the native_database_types comparison available here, so we guard explicitly
    // on isSerial — functionally equivalent to the Rails approach.
    if (column.isSerial) return undefined;
    const limit = column.limit;
    if (limit == null) return undefined;
    return String(limit);
  }

  /** @internal */
  protected schemaPrecision(column: Column): string | undefined {
    if (column.type === "datetime") {
      // TS-DSL literal `null` (Rails dumps the Ruby `nil`); the value is emitted
      // verbatim by formatColspec, so it must already read as valid TS.
      if (column.precision == null) return "null";
      if (column.precision === SchemaDumper.DEFAULT_DATETIME_PRECISION) return undefined;
      return String(column.precision);
    }
    if (column.precision != null) return String(column.precision);
    return undefined;
  }

  /** @internal */
  protected schemaScale(column: Column): string | undefined {
    if (column.scale != null) return String(column.scale);
    return undefined;
  }

  // Rails `schema_default` / `schema_expression` live in
  // `connection_adapters/abstract/schema_dumper.rb`, so the ports stay in this
  // file (the parity:api-mapped location) — the sole definitions, consumed by
  // the single `emitTable`/`columnSpec` dispatch. `_adapter` is a trails-only
  // helper on the base (it reaches base-private `_source`).

  /**
   * Mirrors `def schema_default(column)`
   * (connection_adapters/abstract/schema_dumper.rb:87-95).
   * @internal
   */
  protected schemaDefault(column: Column): string | undefined {
    if (!column.hasDefault) return undefined;
    const type = this._adapter().lookupCastTypeFromColumn(column);
    const default_ = type.deserialize(column.default);
    if (default_ == null) {
      return this.schemaExpression(column);
    } else {
      return type.typeCastForSchema(default_);
    }
  }

  /** @internal */
  protected schemaExpression(column: Column): string | undefined {
    // TS-DSL arrow form (Rails dumps the Ruby lambda `-> { … }`); emitted verbatim
    // by formatColspec and consumed by the DSL as `default: () => "fn()"`.
    if (column.defaultFunction) return `() => ${JSON.stringify(column.defaultFunction)}`;
    return undefined;
  }

  /** @internal */
  protected schemaCollation(column: Column): string | undefined {
    if (column.collation) return JSON.stringify(column.collation);
    return undefined;
  }

  /**
   * Mirrors `abstract_adapter.rb:262` `valid_type?` — `!native_database_types[type]`.
   * Delegates to the backing adapter's `isValidType`; raw/mock sources without an
   * adapter can't validate a type map, so they accept (the pre-raise behavior).
   * @internal
   */
  protected validType(type: string | null | undefined): boolean {
    const adapter = this._adapter();
    if (adapter && typeof adapter.isValidType === "function") {
      return adapter.isValidType(type);
    }
    return true;
  }

  /**
   * The single `emitTable`, routed through `columnSpec` so per-dialect
   * `prepareColumnOptions` overrides (schemaType, schemaLimit, schemaPrecision,
   * schemaDefault, etc.) take effect. Mirrors the column-emission half of Rails'
   * `SchemaDumper#table`, whose `@connection.column_spec` is the adapter's
   * mixed-in method. Every dump reaches it — the single dumper class assigns this
   * onto its prototype, including the mock-source paths.
   *
   * Builds into a local buffer so a raise mid-table discards the partial
   * `create_table` body (Rails writes into its own `tbl` StringIO and only prints
   * it on success — schema_dumper.rb:220-224). On any error we emit the "Could
   * not dump table" comment instead of the table.
   * @internal
   */
  protected emitTable(
    stream: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts: Record<string, unknown> = {},
    inlineConstraints: string[] = [],
  ): void {
    const body: string[] = [];
    try {
      // Rails validates every column's type before emitting the body
      // (schema_dumper.rb:196), raising on an unmapped/composite type whose
      // DSL type is nil so `valid_type?` is false. This includes the PK column.
      for (const col of columns) {
        if (!this.validType(col.type)) {
          const err = new Error(`Unknown type '${col.sqlType ?? ""}' for column '${col.name}'`);
          // Rails raises a StandardError; surface that class in the comment.
          err.name = "StandardError";
          throw err;
        }
      }
      this.emitTableBody(body, tableName, columns, indexes, adapterTableOpts, inlineConstraints);
    } catch (e) {
      const cls = e instanceof Error ? e.name : "StandardError";
      const message = e instanceof Error ? e.message : String(e);
      stream.push(
        `# Could not dump table ${JSON.stringify(tableName)} because of following ${cls}`,
      );
      stream.push(`#   ${message}`);
      return;
    }
    for (const line of body) stream.push(line);
  }

  /** @internal */
  protected emitTableBody(
    stream: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts: Record<string, unknown> = {},
    inlineConstraints: string[] = [],
  ): void {
    const pkColumns = this.resolvePrimaryKeyColumns(tableName, columns);
    const hasCompositePk = pkColumns.length > 1;
    const pkColumn = pkColumns[0];
    // The single-PK column name Rails skips in the column loop (`next if column.name == pk`).
    // Composite PKs (Rails Array case) and PK-less tables never skip a column.
    const singlePkName = !hasCompositePk && pkColumn ? pkColumn.name : undefined;
    const stripped = this.removePrefixAndSuffix(tableName);

    const tableOpts: Record<string, unknown> = {};
    if (hasCompositePk) {
      // Rails (Array case) emits only `primary_key: [...]` — schema_dumper.rb:182.
      tableOpts["primaryKey"] = JSON.stringify(pkColumns.map((c) => c.name));
    } else if (!pkColumn) {
      tableOpts["id"] = "false";
    } else {
      // Rails (String case): print `primary_key: <name>` for a non-"id" key, then the
      // column spec unless empty. Mirrors schema_dumper.rb:170-179.
      if (pkColumn.name !== "id") tableOpts["primaryKey"] = JSON.stringify(pkColumn.name);
      const pkSpec = this.columnSpecForPrimaryKey(pkColumn);
      if (Object.keys(pkSpec).length > 0) {
        if (Object.keys(pkSpec).every((k) => k === "id" || k === "default")) {
          Object.assign(tableOpts, pkSpec);
        } else {
          const { id: idType, ...rest } = pkSpec as { id?: unknown } & Record<string, unknown>;
          tableOpts["id"] = { ...(idType != null ? { type: idType } : {}), ...rest };
        }
      }
    }
    if (typeof adapterTableOpts.charset === "string")
      tableOpts["charset"] = JSON.stringify(adapterTableOpts.charset);
    if (typeof adapterTableOpts.collation === "string")
      tableOpts["collation"] = JSON.stringify(adapterTableOpts.collation);
    if (typeof adapterTableOpts.options === "string")
      tableOpts["options"] = JSON.stringify(adapterTableOpts.options);
    if (typeof adapterTableOpts.comment === "string" && adapterTableOpts.comment.trim().length > 0)
      tableOpts["comment"] = JSON.stringify(adapterTableOpts.comment);
    tableOpts["force"] = '"cascade"';

    stream.push(
      `  await ctx.createTable(${JSON.stringify(stripped)}, { ${this.formatColspec(tableOpts)} }, (t) => {`,
    );

    for (const col of columns) {
      if (col.name === singlePkName) continue;

      const [dslType, spec] = this.columnSpec(col);
      const optStr = Object.keys(spec).length > 0 ? `, { ${this.formatColspec(spec)} }` : "";
      const typeName = String(dslType);

      if (this._isDslHelper(typeName)) {
        stream.push(`    t.${typeName}(${JSON.stringify(col.name)}${optStr});`);
      } else if ((col as any).isEnum && typeName === "enum") {
        stream.push(`    t.enum(${JSON.stringify(col.name)}${optStr});`);
      } else {
        const colType = typeName === "enum" ? ((col as any).sqlType ?? typeName) : typeName;
        stream.push(
          `    t.column(${JSON.stringify(col.name)}, ${JSON.stringify(colType)}${optStr});`,
        );
      }
    }

    for (const line of inlineConstraints) stream.push(line);
    stream.push("  });");
    this.indexesInCreate(tableName, stream, indexes);
  }
}
