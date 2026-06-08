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
  static override create<T extends typeof BaseSchemaDumper>(
    this: T,
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new this(source, options) as InstanceType<T>;
  }

  /** @internal */
  protected columnSpec(column: Column): [symbol | string, Record<string, unknown>] {
    return [this.schemaTypeWithVirtual(column), this.prepareColumnOptions(column)];
  }

  /** @internal */
  protected columnSpecForPrimaryKey(column: Column): Record<string, unknown> {
    const colOpts = this.prepareColumnOptions(column);
    delete colOpts["null"];
    if (this.isExplicitPrimaryKeyDefault(column)) {
      // "null" (not Ruby "nil") — emitted verbatim by formatColspecRaw as `default: null`.
      colOpts["default"] ??= "null";
    }

    const idHash: Record<string, unknown> = {};
    if (!this.isDefaultPrimaryKey(column)) {
      // Pre-format the type as a TS-DSL string literal for formatColspecRaw.
      idHash["type"] = JSON.stringify(this.schemaType(column));
    }
    Object.assign(idHash, colOpts);

    if (Object.keys(idHash).length === 0) return {};
    // Only a type override with no extra options: emit the simple string form
    // `id: "type"` so the output is compact and matches Rails' common case.
    if (Object.keys(idHash).length === 1 && "type" in idHash) {
      return { id: idHash["type"] };
    }
    // Hash form: `id: { type: "...", comment: "...", ... }` — used when there
    // are extra PK column options (comment, default, etc.) beyond just the type.
    return { id: idHash };
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
    if (column.bigint || column.type === "bigint") return "bigint";
    return column.type;
  }

  /** @internal */
  protected schemaLimit(column: Column): string | undefined {
    if (column.bigint || column.type === "bigint") return undefined;
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
    const hasId = !hasCompositePk && pkColumn?.name === "id";
    const stripped = this.removePrefixAndSuffix(tableName);

    // All values in tableOpts are pre-formatted TS-DSL text for formatColspecRaw.
    const tableOpts: Record<string, unknown> = {};
    if (hasCompositePk) {
      tableOpts["primaryKey"] = JSON.stringify(pkColumns.map((c) => c.name));
      tableOpts["id"] = "false";
    } else if (!hasId) {
      tableOpts["id"] = "false";
    } else if (pkColumn) {
      if (!this.isDefaultPrimaryKey(pkColumn) || (pkColumn as any).comment) {
        Object.assign(tableOpts, this.columnSpecForPrimaryKey(pkColumn));
      }
    }
    if (typeof adapterTableOpts.charset === "string")
      tableOpts["charset"] = JSON.stringify(adapterTableOpts.charset);
    if (typeof adapterTableOpts.collation === "string")
      tableOpts["collation"] = JSON.stringify(adapterTableOpts.collation);
    if (typeof adapterTableOpts.options === "string")
      tableOpts["options"] = JSON.stringify(adapterTableOpts.options);
    if (typeof adapterTableOpts.comment === "string" && adapterTableOpts.comment.length > 0)
      tableOpts["comment"] = JSON.stringify(adapterTableOpts.comment);
    tableOpts["force"] = '"cascade"';

    lines.push(
      `  await ctx.createTable(${JSON.stringify(stripped)}, { ${this.formatColspecRaw(tableOpts)} }, (t) => {`,
    );

    for (const col of columns) {
      if (col.name === "id" && hasId) continue;

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
