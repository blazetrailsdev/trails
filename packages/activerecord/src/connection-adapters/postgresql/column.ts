/**
 * PostgreSQL column — PostgreSQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Column
 */

import { Column as BaseColumn } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  readonly serial: boolean;
  readonly oid: number | null;
  readonly fmod: number | null;
  readonly array: boolean;
  readonly identity: string | null;
  readonly generated: string | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: { sqlType?: string | null; type?: string; oid?: number; fmod?: number } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      primaryKey?: boolean;
      serial?: boolean;
      array?: boolean;
      identity?: string | null;
      generated?: string | null;
    } = {},
  ) {
    const meta = new SqlTypeMetadata({
      sqlType: sqlTypeMetadata.sqlType ?? undefined,
      type: sqlTypeMetadata.type,
    });
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
      primaryKey: options.primaryKey,
    });
    this.serial = options.serial ?? false;
    this.oid = sqlTypeMetadata.oid ?? null;
    this.fmod = sqlTypeMetadata.fmod ?? null;
    // Use the raw sqlTypeMetadata.sqlType (not `this.sqlType`) so the check
    // runs against the unstripped string — our sqlType getter strips "[]".
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

  // Return the full SQL type string (including "[]" for arrays) — callers
  // expecting the base type without the array suffix should use sqlType.
  override get type(): string {
    return super.type ?? "";
  }

  get isSerial(): boolean {
    return (
      this.serial ||
      (typeof this.defaultFunction === "string" && this.defaultFunction.startsWith("nextval("))
    );
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

  // Mirrors: Column#enum? — true when the OID type is a user-defined pg enum
  get isEnum(): boolean {
    return this.sqlTypeMetadata?.type === "enum";
  }
}
