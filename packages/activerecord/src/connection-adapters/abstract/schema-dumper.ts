import { SchemaDumper as BaseSchemaDumper } from "../../schema-dumper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { ColumnInfo, SchemaSource } from "../../schema-dumper.js";

/** @noRailsEquivalent CONVERGEABLE */
export interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
  sqlType?: string | null;
}

export class SchemaDumper extends BaseSchemaDumper {
  static readonly DEFAULT_DATETIME_PRECISION = 6;

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
    if (this.supportsVirtualColumns && column.virtual) return "virtual";
    return this.schemaType(column);
  }

  /** @internal */
  protected schemaType(column: Column): string {
    if (this.isBigint(column)) return "bigint";
    return column.type ?? "";
  }

  /** @internal */
  protected isBigint(column: Column): boolean {
    return !!column.bigint || column.type === "bigint" || /^bigint\b/i.test(column.sqlType ?? "");
  }

  /** @internal */
  protected schemaLimit(column: Column): string | undefined {
    if (this.isBigint(column)) return undefined;
    const limit = column.limit;
    if (limit == null) return undefined;
    const nativeLimit = (
      this._adapter()?.nativeDatabaseTypes?.()?.[column.type ?? ""] as
        | { limit?: unknown }
        | undefined
    )?.limit;
    if (limit === nativeLimit) return undefined;
    return String(limit);
  }

  /** @internal */
  protected schemaPrecision(column: Column): string | undefined {
    if (column.type === "datetime") {
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

  /** @internal */
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
    if (column.defaultFunction) return `() => ${JSON.stringify(column.defaultFunction)}`;
    return undefined;
  }

  /** @internal */
  protected schemaCollation(column: Column): string | undefined {
    if (column.collation) return JSON.stringify(column.collation);
    return undefined;
  }

  /** @internal */
  protected validType(type: string | null | undefined): boolean {
    const adapter = this._adapter();
    if (adapter && typeof adapter.isValidType === "function") {
      return adapter.isValidType(type);
    }
    return true;
  }
}
