/**
 * PostgreSQL column — PostgreSQL-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::Column
 */

export class Column {
  readonly name: string;
  readonly sqlType: string | null;
  readonly null: boolean;
  readonly default: unknown;
  readonly defaultFunction: string | null;
  readonly collation: string | null;
  readonly primaryKey: boolean;
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
    this.name = name;
    this.default = defaultValue;
    this.sqlType = sqlTypeMetadata.sqlType ?? null;
    this.null = null_;
    this.collation = options.collation ?? null;
    this.defaultFunction = options.defaultFunction ?? null;
    this.primaryKey = options.primaryKey ?? false;
    this.serial = options.serial ?? false;
    this.oid = sqlTypeMetadata.oid ?? null;
    this.fmod = sqlTypeMetadata.fmod ?? null;
    this.array = options.array ?? this.sqlType?.endsWith("[]") ?? false;
  }

  get type(): string {
    return this.sqlType ?? "";
  }

  get hasDefault(): boolean {
    return this.default != null || this.defaultFunction != null;
  }

  get isSerial(): boolean {
    return (
      this.serial ||
      (typeof this.defaultFunction === "string" && this.defaultFunction.startsWith("nextval("))
    );
  }
}
