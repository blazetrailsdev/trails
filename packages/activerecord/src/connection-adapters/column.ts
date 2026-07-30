/**
 * Column — base class for database column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Column
 */

import { SqlTypeMetadata } from "./sql-type-metadata.js";
import type { SqlTypeMetadataJSON } from "./sql-type-metadata.js";
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
    return this.sqlTypeMetadata?.type ?? null;
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
   * Value equality over the attributes Rails compares.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#== (column.rb:75)
   *
   * The guard is `other.is_a?(Column)`, NOT `self.class == other.class`, so a
   * subclass instance can equal a base one from the base receiver's side —
   * subclass `==` narrows the guard to its own class and calls `super`.
   *
   * `primaryKey` is deliberately absent: Rails' Column has no such attribute
   * (it is a trails-side flag), so comparing it would diverge.
   *
   * Ruby aliases `eql?` to this and pairs it with `hash` (column.rb:87); both
   * are in api-compare's `SKIP_GROUPS` as Ruby value-protocol methods with no
   * meaningful TS surface, so `equals` is the whole port.
   */
  equals(other: unknown): boolean {
    return (
      other instanceof Column &&
      this.name === other.name &&
      // Reflected defaults are primitives or null in trails (the adapters
      // stringify before constructing the Column), so `===` stands in for
      // Ruby's `==`; `?? null` keeps an absent default from splitting into
      // distinct null/undefined values the way Ruby's single nil cannot.
      (this.default ?? null) === (other.default ?? null) &&
      metadataEquals(this.sqlTypeMetadata, other.sqlTypeMetadata) &&
      this.null === other.null &&
      this.defaultFunction === other.defaultFunction &&
      this.collation === other.collation &&
      this.comment === other.comment
    );
  }

  /**
   * Whether this is a virtual/generated column.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#virtual?
   */
  isVirtual(): boolean {
    return false;
  }

  toJSON(): ColumnJSON {
    return {
      name: this.name,
      default: this.default,
      sqlTypeMetadata: this.sqlTypeMetadata?.toJSON() ?? null,
      null: this.null,
      defaultFunction: this.defaultFunction,
      collation: this.collation,
      comment: this.comment,
      primaryKey: this.primaryKey,
    };
  }

  static fromJSON(data: ColumnJSON): Column {
    return new Column(
      data.name,
      data.default,
      data.sqlTypeMetadata ? SqlTypeMetadata.fromJSON(data.sqlTypeMetadata) : null,
      data.null,
      {
        defaultFunction: data.defaultFunction,
        collation: data.collation,
        comment: data.comment,
        primaryKey: data.primaryKey,
      },
    );
  }

  deduplicate(): this {
    return this.deduplicated();
  }

  /** @internal */
  protected deduplicated(): this {
    if (this.sqlTypeMetadata) {
      this.sqlTypeMetadata.deduplicate();
    }
    return this;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Ruby's `sql_type_metadata == other.sql_type_metadata` (column.rb:79) works on
 * nil too, where a TS `null` has no `equals` to call.
 *
 * @internal
 */
function metadataEquals(a: SqlTypeMetadata | null, b: SqlTypeMetadata | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

export interface ColumnJSON {
  name: string;
  default: unknown;
  sqlTypeMetadata: SqlTypeMetadataJSON | null;
  null: boolean;
  defaultFunction: string | null;
  collation: string | null;
  comment: string | null;
  primaryKey: boolean;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullColumn
 */
export class NullColumn extends Column {
  constructor() {
    super("", null, null, true);
  }
}
