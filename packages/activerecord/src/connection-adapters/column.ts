/**
 * Column — base class for database column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Column
 */

import type { SqlTypeMetadata } from "./sql-type-metadata.js";

export class Column {
  readonly name: string;
  readonly sqlTypeMetadata: SqlTypeMetadata | null;
  readonly null: boolean;
  readonly default: unknown;
  readonly defaultFunction: string | null;
  readonly collation: string | null;
  readonly comment: string | null;
  readonly primaryKey: boolean;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: SqlTypeMetadata | null = null,
    null_: boolean = true,
    options: {
      defaultFunction?: string | null;
      collation?: string | null;
      comment?: string | null;
      primaryKey?: boolean;
    } = {},
  ) {
    this.name = name;
    this.default = defaultValue;
    this.sqlTypeMetadata = sqlTypeMetadata;
    this.null = null_;
    this.defaultFunction = options.defaultFunction ?? null;
    this.collation = options.collation ?? null;
    this.comment = options.comment ?? null;
    this.primaryKey = options.primaryKey ?? false;
  }

  get sqlType(): string | null {
    return this.sqlTypeMetadata?.sqlType ?? null;
  }

  get type(): string | null {
    return this.sqlTypeMetadata?.sqlType ?? this.sqlTypeMetadata?.type ?? null;
  }

  get baseType(): string | null {
    return this.sqlTypeMetadata?.type ?? null;
  }

  get limit(): number | null {
    return this.sqlTypeMetadata?.limit ?? null;
  }

  get precision(): number | null {
    return this.sqlTypeMetadata?.precision ?? null;
  }

  get scale(): number | null {
    return this.sqlTypeMetadata?.scale ?? null;
  }

  get hasDefault(): boolean {
    return this.default != null || this.defaultFunction !== null;
  }

  get isNullable(): boolean {
    return this.null;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullColumn
 */
export class NullColumn extends Column {
  constructor() {
    super("", null, null, true);
  }
}
