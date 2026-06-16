/**
 * Connection-adapters-layer SchemaDumper. Mirrors Rails'
 * `ActiveRecord::ConnectionAdapters::SchemaDumper < SchemaDumper`
 * (connection_adapters/abstract/schema_dumper.rb) — the adapter
 * subclass of the base dumper that adds column-spec helpers used by
 * `schema_type`, `schema_limit`, `schema_default`, etc.
 */

import type { SchemaSource, ColumnInfo, IndexInfo } from "../../schema-dumper.js";
import { SchemaDumper as BaseSchemaDumper } from "../../schema-dumper.js";

/** Column-shaped interface this dumper depends on. */
interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
  /** Raw SQL type string (e.g. "integer", "varchar(255)") — present on all schema-reflected columns. */
  sqlType?: string | null;
}

export class SchemaDumper extends BaseSchemaDumper {
  /**
   * Per-table primary-key column order from `@connection.primary_key(table)`.
   * Populated by `table()` before column iteration so `emitTable` can render
   * `primaryKey: [...]` (and pick the single-PK column) in PK definition order
   * rather than introspection/declaration order. Mirrors Rails' reliance on
   * `@connection.primary_key(table)`, which already returns columns in key order.
   * @internal
   */
  protected primaryKeyOrderCache: Record<string, string[] | undefined> = Object.create(null);

  static override create<T extends typeof BaseSchemaDumper>(
    this: T,
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new this(source, options) as InstanceType<T>;
  }

  /** @internal */
  override async table(tableName: string, lines: string[]): Promise<void> {
    const adapter = this._adapter();
    if (adapter && typeof adapter.primaryKeys === "function") {
      try {
        this.primaryKeyOrderCache[tableName] = await adapter.primaryKeys(tableName);
      } catch {
        // Live introspection is best-effort; fall through to declaration order.
      }
    }
    await super.table(tableName, lines);
  }

  /** @internal */
  protected override orderPrimaryKeyColumns(
    tableName: string,
    pkColumns: ColumnInfo[],
  ): ColumnInfo[] {
    const order = this.primaryKeyOrderCache[tableName];
    if (!order || order.length === 0) return pkColumns;
    const byName = new Map(pkColumns.map((c) => [c.name, c]));
    const reordered: ColumnInfo[] = [];
    for (const name of order) {
      const col = byName.get(name);
      if (col) {
        reordered.push(col);
        byName.delete(name);
      }
    }
    for (const col of byName.values()) reordered.push(col);
    return reordered;
  }

  /** @internal */
  protected columnSpec(column: Column): [symbol | string, Record<string, unknown>] {
    return [this.schemaTypeWithVirtual(column), this.prepareColumnOptions(column)];
  }

  /** @internal */
  protected columnSpecForPrimaryKey(column: Column): Record<string, unknown> {
    const spec: Record<string, unknown> = {};
    if (!this.isDefaultPrimaryKey(column)) {
      // Pre-format the id value as a TS-DSL string literal for formatColspecRaw.
      spec["id"] = JSON.stringify(this.schemaType(column));
    }
    const colOpts = this.prepareColumnOptions(column);
    delete colOpts["null"];
    Object.assign(spec, colOpts);
    if (this.isExplicitPrimaryKeyDefault(column)) {
      // "null" (not Ruby "nil") — emitted verbatim by formatColspecRaw as `default: null`.
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
    return column.type;
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
    if (column.bigint || column.type === "bigint") return undefined;
    // Rails dumps `t.oid` bare because its oid column reports `limit == nil`
    // (NATIVE_DATABASE_TYPES[:oid] carries no :limit, postgresql_adapter.rb:177)
    // and schema_limit only emits when the limit differs from the native type's
    // (abstract/schema_dumper.rb:64). Our PG introspection diverges — it surfaces
    // limit 8 for oid — so we suppress here to match the dump. The root-cause fix
    // (introspection should not carry the oid limit, or a general
    // native_database_types limit comparison like isSerial below) is tracked in
    // rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md.
    if (this.schemaType(column) === "oid") return undefined;
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
      // verbatim by formatColspecRaw, so it must already read as valid TS.
      if (column.precision == null) return "null";
      if (column.precision === BaseSchemaDumper.DEFAULT_DATETIME_PRECISION) return undefined;
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

  /** @internal */
  protected schemaDefault(column: Column): string | undefined {
    if (!column.hasDefault && column.default === undefined) return undefined;
    if (column.default == null) return this.schemaExpression(column);
    const adapter = this._adapter();
    if (adapter?.lookupCastTypeFromColumn) {
      const type = adapter.lookupCastTypeFromColumn(column);
      if (type != null && typeof type.deserialize === "function") {
        const deserialized = type.deserialize(column.default);
        if (deserialized == null) {
          // column.default is already non-null (the `== null` guard above
          // returned early). It may be a pre-deserialized JS value (e.g. []
          // for a PG OID::Array column) that the scalar element type cannot
          // deserialize. Apply typeCastForSchema directly on the original.
          return type.typeCastForSchema(column.default);
        }
        return type.typeCastForSchema(deserialized);
      }
    }
    if (typeof column.default === "string") return JSON.stringify(column.default);
    return String(column.default);
  }

  /** @internal */
  protected _adapter(): any {
    const src = (this as any)._source;
    return src?.adapter ?? src;
  }

  /** @internal */
  protected schemaExpression(column: Column): string | undefined {
    // TS-DSL arrow form (Rails dumps the Ruby lambda `-> { … }`); emitted verbatim
    // by formatColspecRaw and consumed by the DSL as `default: () => "fn()"`.
    if (column.defaultFunction) return `() => ${JSON.stringify(column.defaultFunction)}`;
    return undefined;
  }

  /** @internal */
  protected schemaCollation(column: Column): string | undefined {
    if (column.collation) return JSON.stringify(column.collation);
    return undefined;
  }

  /**
   * Epic 3.3-U3: adapter-backed emitTable routed through columnSpec so
   * per-dialect `prepareColumnOptions` overrides (schemaType, schemaLimit,
   * schemaPrecision, schemaDefault, etc.) take effect on live dumps.
   *
   * The base-class `emitTable` (inline colspec) continues to serve the
   * in-memory MigrationContext path unchanged. This override is called only
   * when the instance is an adapter-specific SchemaDumper subclass.
   * @internal
   */
  protected override emitTable(
    lines: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts: Record<string, unknown> = {},
    inlineConstraints: string[] = [],
  ): void {
    const pkColumns = this.orderPrimaryKeyColumns(
      tableName,
      columns.filter((c) => c.primaryKey),
    );
    const hasCompositePk = pkColumns.length > 1;
    const pkColumn = pkColumns[0];
    // The single-PK column name Rails skips in the column loop (`next if column.name == pk`).
    // Composite PKs (Rails Array case) and PK-less tables never skip a column.
    const singlePkName = !hasCompositePk && pkColumn ? pkColumn.name : undefined;
    const stripped = this.removePrefixAndSuffix(tableName);

    // All values in tableOpts are pre-formatted TS-DSL text for formatColspecRaw.
    const tableOpts: Record<string, unknown> = {};
    if (hasCompositePk) {
      // Rails (Array case) emits only `primary_key: [...]`; the TS DSL also needs
      // `id: false` so createTable doesn't auto-add an `id` column on round-trip.
      tableOpts["primaryKey"] = JSON.stringify(pkColumns.map((c) => c.name));
      tableOpts["id"] = "false";
    } else if (!pkColumn) {
      tableOpts["id"] = "false";
    } else {
      // Rails (String case): print `primary_key: <name>` for a non-"id" key, then the
      // column spec unless empty. Mirrors schema_dumper.rb:170-179.
      if (pkColumn.name !== "id") tableOpts["primaryKey"] = JSON.stringify(pkColumn.name);
      // columnSpecForPrimaryKey returns a FLAT spec (dialect overrides post-process it,
      // e.g. MySQL deletes auto_increment); wrap into `id: { ... }` here at the call site,
      // after those overrides, so the PK's own `comment:` doesn't collide with the
      // table-level `comment:`.
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

    lines.push(
      `  await ctx.createTable(${JSON.stringify(stripped)}, { ${this.formatColspecRaw(tableOpts)} }, (t) => {`,
    );

    for (const col of columns) {
      if (col.name === singlePkName) continue;

      const [dslType, spec] = this.columnSpec(col);
      const optStr = Object.keys(spec).length > 0 ? `, { ${this.formatColspecRaw(spec)} }` : "";
      const typeName = String(dslType);

      if (this._isDslHelper(typeName)) {
        lines.push(`    t.${typeName}(${JSON.stringify(col.name)}${optStr});`);
      } else if ((col as any).isEnum && typeName === "enum") {
        lines.push(`    t.enum(${JSON.stringify(col.name)}${optStr});`);
      } else {
        // Generic fallback: pass arbitrary SQL type verbatim via t.column.
        const colType = typeName === "enum" ? ((col as any).sqlType ?? typeName) : typeName;
        lines.push(
          `    t.column(${JSON.stringify(col.name)}, ${JSON.stringify(colType)}${optStr});`,
        );
      }
    }

    for (const line of inlineConstraints) lines.push(line);
    lines.push("  });");
    this.indexesInCreate(tableName, lines, indexes);
  }
}
