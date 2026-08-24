/**
 * Column — base class for database column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Column
 */

import { SqlTypeMetadata } from "./sql-type-metadata.js";
import type { SqlTypeMetadataJSON } from "./sql-type-metadata.js";
import { humanize } from "@blazetrails/activesupport";

export class Column {
  name: string;
  sqlTypeMetadata: SqlTypeMetadata | null;
  null: boolean;
  default: unknown;
  defaultFunction: string | null;
  collation: string | null;
  comment: string | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: SqlTypeMetadata | null = null,
    null_: boolean = true,
    options: {
      defaultFunction?: string | null;
      collation?: string | null;
      comment?: string | null;
    } = {},
  ) {
    this.name = name;
    this.default = defaultValue;
    this.sqlTypeMetadata = sqlTypeMetadata;
    this.null = null_;
    this.defaultFunction = options.defaultFunction ?? null;
    this.collation = options.collation ?? null;
    this.comment = options.comment ?? null;
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

  equals(other: unknown): boolean {
    return (
      other instanceof Column &&
      this.name === other.name &&
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

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#init_with
   * (`column.rb:46-53`). Rails' YAML/Marshal protocol allocates the class named
   * by the document's tag and then fills its ivars from the coder; the caller
   * that does the allocating is `rehydrateColumn` (`schema-cache.ts`). Because
   * these are Ruby ivars re-assigned here, the fields above cannot be `readonly`.
   *
   * The key set is Rails' exactly. trails' Column carries no primary-key flag
   * either, for the same reason Rails' does not: the key is the schema cache's,
   * held in its own `@primary_keys` slot (`schema_cache.rb:416`).
   */
  initWith(coder: ColumnCoder): void {
    this.name = coder["name"] as string;
    this.sqlTypeMetadata = coder["sql_type_metadata"]
      ? SqlTypeMetadata.fromJSON(coder["sql_type_metadata"] as SqlTypeMetadataJSON)
      : null;
    this.null = coder["null"] as boolean;
    this.default = coder["default"];
    this.defaultFunction = (coder["default_function"] as string | null) ?? null;
    this.collation = (coder["collation"] as string | null) ?? null;
    this.comment = (coder["comment"] as string | null) ?? null;
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::Column#encode_with
   * (`column.rb:55-63`), the seam `SchemaCache#dump_to` serializes through
   * (`schema_cache.rb:406`).
   *
   * The seven keys are Rails' exactly, in Rails' order.
   *
   * `class` is the JSON stand-in for YAML's `!ruby/object:` tag. Rails restores
   * the adapter's Column subclass from that tag and lets `init_with` fill only
   * the seven base ivars, leaving the subclass' own ivars nil; a JSON document
   * carries no tag, so the tag is written as a key and `rehydrateColumn`
   * dispatches on it.
   *
   * The subclass overrides below then go one step further than Rails and encode
   * their own state too. That is a deliberate deviation, not an oversight:
   * Rails' data loss is invisible because Rails only ever compares a reflected
   * cache against another reflected one, while trails' fixtures warm compares a
   * dump-loaded cache against a reflected one — dropping `array` / `serial` /
   * `rowid` & co. reds `base_test.rb`'s `test_clear_cache!`. Tracked by RFC
   * 0096 `converge-column-encode-with-init-with`.
   */
  encodeWith(coder: ColumnCoder): void {
    coder["class"] = "Column";
    coder["name"] = this.name;
    coder["sql_type_metadata"] = this.sqlTypeMetadata?.toJSON() ?? null;
    coder["null"] = this.null;
    coder["default"] = this.default;
    coder["default_function"] = this.defaultFunction;
    coder["collation"] = this.collation;
    coder["comment"] = this.comment;
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

/** @internal */
function metadataEquals(a: SqlTypeMetadata | null, b: SqlTypeMetadata | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/**
 * Psych's `coder` — the untyped key/value bag `encode_with` writes and
 * `init_with` reads (`column.rb:46-63`). Same shape `SchemaCache#encodeWith`
 * takes (`schema-cache.ts`).
 */
export type ColumnCoder = Record<string, unknown>;

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullColumn
 */
export class NullColumn extends Column {
  constructor() {
    super("", null, null, true);
  }
}
