/**
 * PostgreSQL column — PostgreSQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  serial: boolean;
  oid: number | null;
  fmod: number | null;
  array: boolean;
  identity: string | null;
  generated: string | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: {
      sqlType?: string | null;
      type?: string;
      oid?: number;
      fmod?: number;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      comment?: string | null;
      serial?: boolean;
      array?: boolean;
      identity?: string | null;
      generated?: string | null;
    } = {},
  ) {
    const meta = new SqlTypeMetadata({
      sqlType: sqlTypeMetadata.sqlType ?? undefined,
      type: sqlTypeMetadata.type,
      limit: sqlTypeMetadata.limit ?? undefined,
      precision: sqlTypeMetadata.precision ?? undefined,
      scale: sqlTypeMetadata.scale ?? undefined,
    });
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
      comment: options.comment,
    });
    this.serial = options.serial ?? false;
    this.oid = sqlTypeMetadata.oid ?? null;
    this.fmod = sqlTypeMetadata.fmod ?? null;
    this.array = options.array ?? sqlTypeMetadata.sqlType?.endsWith("[]") ?? false;
    this.identity = options.identity ?? null;
    this.generated = options.generated ?? null;
  }

  // Mirrors: Column#sql_type — strips the array suffix so callers get the
  // base type name; the array dimension is captured by `this.array`.
  override get sqlType(): string | null {
    const raw = super.sqlType;
    return raw?.endsWith("[]") ? raw.slice(0, -2) : (raw ?? null);
  }

  // Rails' Column#type delegates to sql_type_metadata with `allow_nil: true`
  // (column.rb:12), so an unmapped sql_type — e.g. a composite OID — reflects
  // `nil`. Do NOT coerce that to "" (the old override did, breaking
  // `assert_nil column.type`). The declared `string | null` tells the truth
  // rather than casting the runtime nil away, so callers must null-guard. The
  // schema dumper never sees this nil at runtime: the dump path only reads the
  // coalesced (never-nil) ColumnInfo from `SchemaSource.columns()`, while the
  // reflection path (`columnsHash()[...].type`) passes the real nil through.
  override get type(): string | null {
    return super.type;
  }

  // Mirrors Rails Column#serial? — returns the stored flag, which the adapter
  // computes by matching the `nextval()` default's sequence against the
  // conventional `<table>_<column>_seq` name (see
  // PostgreSQLAdapter#newColumnFromField). An explicit
  // `default: -> { "nextval('some_seq')" }` is NOT serial.
  get isSerial(): boolean {
    return this.serial;
  }

  // Mirrors: Column#identity? — truthy when attidentity is "a" or "d"
  get isIdentity(): boolean {
    return this.identity !== null && this.identity !== "";
  }

  // Mirrors: Column#auto_incremented_by_db?
  override isAutoIncrementedByDb(): boolean {
    return this.isSerial || this.isIdentity;
  }

  // Mirrors: Column#virtual? — true for any generated (stored) column
  override isVirtual(): boolean {
    return this.generated !== null && this.generated !== "";
  }

  // Mirrors: Column#has_default? — virtual columns never have a user-visible default
  override get hasDefault(): boolean {
    return super.hasDefault && !this.isVirtual();
  }

  // Mirrors: Column#array? — true when the column stores an array type
  isArray(): boolean {
    return this.array;
  }

  // Mirrors: Column#enum? — true when the OID type is a user-defined pg enum
  get isEnum(): boolean {
    return this.sqlTypeMetadata?.type === "enum";
  }

  override equals(other: unknown): boolean {
    return (
      other instanceof Column &&
      super.equals(other) &&
      this.isIdentity === other.isIdentity &&
      this.isSerial === other.isSerial
    );
  }

  /** @see Column#encodeWith — this subclass' half of the JSON class tag. */
  override initWith(coder: ColumnCoder): void {
    super.initWith(coder);
    this.serial = (coder["serial"] as boolean) ?? false;
    this.oid = (coder["oid"] as number | null) ?? null;
    this.fmod = (coder["fmod"] as number | null) ?? null;
    this.array = (coder["array"] as boolean) ?? false;
    this.identity = (coder["identity"] as string | null) ?? null;
    this.generated = (coder["generated"] as string | null) ?? null;
  }

  override encodeWith(coder: ColumnCoder): void {
    super.encodeWith(coder);
    coder["class"] = "PostgreSQL::Column";
    coder["serial"] = this.serial;
    coder["oid"] = this.oid;
    coder["fmod"] = this.fmod;
    coder["array"] = this.array;
    coder["identity"] = this.identity;
    coder["generated"] = this.generated;
  }
}
