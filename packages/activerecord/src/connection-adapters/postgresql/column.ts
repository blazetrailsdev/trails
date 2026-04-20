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
    this.array = options.array ?? this.sqlType?.endsWith("[]") ?? false;
  }

  override get type(): string {
    return this.sqlType ?? "";
  }

  get isSerial(): boolean {
    return (
      this.serial ||
      (typeof this.defaultFunction === "string" && this.defaultFunction.startsWith("nextval("))
    );
  }
}
