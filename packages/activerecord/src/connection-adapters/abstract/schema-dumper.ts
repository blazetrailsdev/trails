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
import type { ColumnInfo, SchemaSource } from "../../schema-dumper.js";

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
    if (this.supportsVirtualColumns && column.virtual) return "virtual";
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

  /**
   * Mirrors `def schema_limit(column)` (abstract/schema_dumper.rb:62-65).
   *
   * `limit = column.limit unless column.bigint?` uses the same predicate
   * `schema_type` does, so a column whose bigint-ness is only visible through
   * sqlType is limit-suppressed too. The `@connection.native_database_types`
   * lookup yields `undefined` for a raw/mock source with no backing adapter,
   * which then dumps the limit — as Rails does for a type whose native entry
   * carries no `:limit`.
   * @internal
   */
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
  // the base `table`'s `columnSpec` dispatch. `_adapter` is a trails-only
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
}
