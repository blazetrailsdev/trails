/**
 * Column — base class for database column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Column
 */

import { deduplicate } from "./deduplicable.js";
import type { Deduplicable } from "./deduplicable.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import type { SqlTypeMetadataJSON } from "./sql-type-metadata.js";
import { humanize } from "@blazetrails/activesupport";

export class Column implements Deduplicable {
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
   * Rails' subclasses each carry their OWN key set through the coder, and
   * trails now mirrors them one for one: `PostgreSQL::Column` writes `serial` /
   * `identity` / `generated` then calls `super` (`postgresql/column.rb:50-61`)
   * — `oid` / `fmod` are not ivars there but `delegate`s to the metadata
   * (`:7`) the base coder already persists, and `array` derives from the
   * unstripped `sql_type` (`:37-39`); `SQLite3::Column` writes `auto_increment`
   * alone (`sqlite3/column.rb:35-42`), so `rowid` and `@generated_type` are
   * dropped by a round-trip upstream too; `MySQL::Column` defines no coder half
   * at all, because `unsigned?` / `case_sensitive?` / `auto_increment?` /
   * `virtual?` all derive from `sql_type` / `collation` /
   * `sql_type_metadata.extra` (`mysql/column.rb:7-24`).
   *
   * A key a subclass no longer writes leaves its ivar absent on a dump-loaded
   * column, which is exactly Ruby's nil — so each of those predicates is
   * spelled with Ruby's nil truthiness (`!= null` / `present?`), never
   * `!== null`.
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

  /**
   * The registry key over exactly the attributes `Column#==` compares and
   * `Column#hash` folds in (`column.rb:75-88`) — what Rails gets from pairing
   * those two so the `Hash` lookup in `Deduplicable#deduplicate` works.
   * Subclasses extend it with the attributes their own `hash` adds.
   * @internal
   * Ruby's registry is a Hash keyed by the object itself, which works because
   * Rails pairs `==`/`eql?` with `hash`; a JS `Map` keys by identity, so the
   * port needs an explicit string key over exactly those attributes.
   * @noRailsEquivalent PERMANENT Ruby pairs Column#== with Column#hash so a Hash dedupes it (column.rb:75-88); a JS Map keys by identity and needs an explicit key.
   */
  deduplicateKey(): string {
    return JSON.stringify([
      this.name,
      this.default ?? null,
      this.sqlTypeMetadata?.deduplicateKey() ?? null,
      this.null,
      this.defaultFunction,
      this.collation,
      this.comment,
    ]);
  }

  /**
   * Mirrors `Deduplicable#deduplicate` — `self.class.registry[self] ||=
   * deduplicated` (`deduplicable.rb:18`).
   */
  deduplicate(): this {
    return deduplicate(this);
  }

  /**
   * Mirrors `Column#deduplicated` (`column.rb:104-112`): dedup the metadata,
   * then `super` — `Deduplicable#deduplicated`'s `freeze` (`deduplicable.rb:26`).
   * Ruby's `-string` interning has no JS counterpart (strings are already
   * immutable and pooled), so the five `-name` / `-default` lines have nothing
   * to call.
   * @internal
   */
  deduplicated(): this {
    if (this.sqlTypeMetadata) {
      this.sqlTypeMetadata = this.sqlTypeMetadata.deduplicate();
    }
    return Object.freeze(this);
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
  constructor(name: string) {
    super(name, null);
  }
}
