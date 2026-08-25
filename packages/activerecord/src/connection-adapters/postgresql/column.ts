/**
 * PostgreSQL column — PostgreSQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { TypeMetadata } from "./type-metadata.js";
import { isPresent } from "@blazetrails/activesupport";

export class Column extends BaseColumn {
  serial: boolean;
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
      identity?: string | null;
      generated?: string | null;
    } = {},
  ) {
    const meta = new TypeMetadata(
      {
        sqlType: sqlTypeMetadata.sqlType ?? undefined,
        type: sqlTypeMetadata.type,
        limit: sqlTypeMetadata.limit ?? undefined,
        precision: sqlTypeMetadata.precision ?? undefined,
        scale: sqlTypeMetadata.scale ?? undefined,
      },
      { oid: sqlTypeMetadata.oid, fmod: sqlTypeMetadata.fmod },
    );
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
      comment: options.comment,
    });
    this.serial = options.serial ?? false;
    this.identity = options.identity ?? null;
    this.generated = options.generated ?? null;
  }

  // Mirrors: `delegate :oid, :fmod, to: :sql_type_metadata` (postgresql/column.rb:7).
  get oid(): number | null {
    return (this.sqlTypeMetadata as TypeMetadata | null)?.oid ?? null;
  }

  get fmod(): number | null {
    return (this.sqlTypeMetadata as TypeMetadata | null)?.fmod ?? null;
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

  // Mirrors: Column#identity? — the adapter already seats `identity.presence`
  // (postgresql/schema_statements.rb:990), so Ruby's truthiness on the raw ivar
  // is `!= null`. A coder that never carried the key leaves it `undefined`,
  // which `!= null` reads as falsy the way Ruby reads a missing ivar's nil.
  get isIdentity(): boolean {
    return this.identity != null;
  }

  // Mirrors: Column#auto_incremented_by_db?
  override isAutoIncrementedByDb(): boolean {
    return this.isSerial || this.isIdentity;
  }

  // Mirrors: Column#virtual? — `@generated.present?` (postgresql/column.rb:29),
  // so "" is blank and a nil/absent ivar is falsy.
  override isVirtual(): boolean {
    return isPresent(this.generated);
  }

  // Mirrors: Column#has_default? — virtual columns never have a user-visible default
  override get hasDefault(): boolean {
    return super.hasDefault && !this.isVirtual();
  }

  // Mirrors: `def array; sql_type_metadata.sql_type.end_with?("[]"); end`
  // (postgresql/column.rb:37-39) — derived from the UNSTRIPPED sql_type, which
  // is why it reads the metadata rather than this class' `sqlType` override.
  get array(): boolean {
    return this.sqlTypeMetadata?.sqlType?.endsWith("[]") ?? false;
  }

  // Mirrors: `alias :array? :array` (postgresql/column.rb:40)
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

  // Mirrors: postgresql/column.rb:50-55 — `serial`, `identity`, `generated`,
  // then `super`. `oid`/`fmod` are not ivars here (they delegate to the
  // metadata, which the base coder persists) and `array` is derived.
  override initWith(coder: ColumnCoder): void {
    this.serial = (coder["serial"] as boolean) ?? false;
    this.identity = (coder["identity"] as string | null) ?? null;
    this.generated = (coder["generated"] as string | null) ?? null;
    super.initWith(coder);
  }

  /** @see Column#encodeWith — this subclass' half of the JSON class tag. */
  override encodeWith(coder: ColumnCoder): void {
    coder["serial"] = this.serial;
    coder["identity"] = this.identity;
    coder["generated"] = this.generated;
    super.encodeWith(coder);
    coder["class"] = "PostgreSQL::Column";
  }
}
