/**
 * Column — base class for database column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Column
 */

import type { SqlTypeMetadata } from "./sql-type-metadata.js";
import { humanize } from "@blazetrails/activesupport";

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

  /**
   * Whether this column is a bigint type.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#bigint?
   */
  isBigint(): boolean {
    return this.sqlType != null && /^bigint\b/i.test(this.sqlType);
  }

  /**
   * Returns the human-readable form of the column name.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#human_name
   */
  humanName(): string {
    return humanize(this.name);
  }

  /**
   * Whether the column is auto-populated by the database using a sequence.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#auto_incremented_by_db?
   */
  isAutoIncrementedByDb(): boolean {
    return false;
  }

  /**
   * Whether the column is auto-populated (auto-increment or has a default function).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#auto_populated?
   */
  isAutoPopulated(): boolean {
    return this.isAutoIncrementedByDb() || this.defaultFunction !== null;
  }

  /**
   * Whether this is a virtual/generated column.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#virtual?
   */
  isVirtual(): boolean {
    return false;
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
