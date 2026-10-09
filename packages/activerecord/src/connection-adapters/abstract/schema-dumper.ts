import { SchemaDumper as BaseSchemaDumper } from "../../schema-dumper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { Column } from "../column.js";
import { compact, isPresent } from "@blazetrails/activesupport";
import { rbInspect, rtest } from "@blazetrails/ruby-compat";

export class SchemaDumper extends BaseSchemaDumper {
  static readonly DEFAULT_DATETIME_PRECISION = 6;

  static override create<T extends typeof BaseSchemaDumper>(
    this: T,
    connection: DatabaseAdapter,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new (this as unknown as new (
      connection: DatabaseAdapter,
      options: Record<string, unknown>,
    ) => InstanceType<T>)(connection, options);
  }

  /** @internal */
  protected async columnSpec(column: Column): Promise<[string, Record<string, unknown>]> {
    return [await this.schemaTypeWithVirtual(column), await this.prepareColumnOptions(column)];
  }

  /** @internal */
  protected async columnSpecForPrimaryKey(
    column: Column | undefined,
  ): Promise<Record<string, unknown>> {
    const spec: Record<string, unknown> = {};
    if (!this.isDefaultPrimaryKey(column!)) {
      spec["id"] = JSON.stringify(this.schemaType(column!).replace(/^:/, ""));
    }
    const colOpts = await this.prepareColumnOptions(column!);
    delete colOpts["null"];
    Object.assign(spec, colOpts);
    if (this.isExplicitPrimaryKeyDefault(column!)) {
      spec["default"] ??= "null";
    }
    return spec;
  }

  /** @internal */
  protected async prepareColumnOptions(column: Column): Promise<Record<string, unknown>> {
    const spec: Record<string, unknown> = {};
    spec["limit"] = this.schemaLimit(column);
    spec["precision"] = this.schemaPrecision(column);
    spec["scale"] = this.schemaScale(column);
    spec["default"] = this.schemaDefault(column);
    if (!column.null) spec["null"] = "false";
    spec["collation"] = await this.schemaCollation(column);
    if (isPresent(column.comment)) spec["comment"] = rbInspect(column.comment);
    return compact(spec);
  }

  /** @internal */
  protected isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === ":bigint";
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(_column: Column): boolean {
    return false;
  }

  /** @internal */
  protected async schemaTypeWithVirtual(column: Column): Promise<string> {
    if ((await this.connection.supportsVirtualColumns()) && column.isVirtual()) {
      return ":virtual";
    } else {
      return this.schemaType(column);
    }
  }

  /** @internal */
  protected schemaType(column: Column): string {
    if (this.isBigint(column)) return ":bigint";
    return `:${column.type ?? ""}`;
  }

  /** @internal */
  protected schemaLimit(column: Column): string | undefined {
    const limit = this.isBigint(column) ? undefined : column.limit;
    if (
      rtest(limit) &&
      limit !==
        (this.connection.nativeDatabaseTypes()[column.type as string] as { limit?: unknown }).limit
    ) {
      return rbInspect(limit);
    }
    return undefined;
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
  protected schemaDefault(column: Column): unknown {
    if (!column.hasDefault) return undefined;
    const type = this.connection.lookupCastTypeFromColumn(column);
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
  protected async schemaCollation(column: Column): Promise<string | undefined> {
    if (column.collation) return JSON.stringify(column.collation);
    return undefined;
  }

  /** @internal */
  protected isBigint(column: Column): boolean {
    return column.type === "bigint" || column.isBigint();
  }
}
